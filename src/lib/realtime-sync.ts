import {
  PEER_COLORS,
  type CanvasItem,
  type InkStroke,
  type NotebookPage,
  type NotebookTool,
  type PeerPresence,
  type ShootNotebook,
} from "../types/notebook";
import { base64ToBlob, blobToBase64 } from "./media-utils";
import {
  DEFAULT_MQTT_BROKERS,
  createMqttWsClient,
  type MqttWsClientHandle,
} from "./mqtt-ws";

export type RoomSyncStatus = "connecting" | "connected" | "local" | "offline";

export type NotebookDelta =
  | { type: "stroke"; stroke: InkStroke }
  | { type: "item"; item: CanvasItem }
  | { type: "page"; page: NotebookPage }
  | {
      type: "meta";
      title: string;
      paperTemplate: ShootNotebook["paperTemplate"];
      pageHeight: number;
      quickBody?: string;
      metaUpdatedAt: number;
    };

export interface RoomSyncCallbacks {
  roomId: string;
  getDisplayName: () => string;
  onFullState: (notebook: ShootNotebook) => void;
  onDelta: (delta: NotebookDelta) => void;
  onMediaBlob: (
    mediaId: string,
    blob: Blob,
    mimeType: string,
    fileName: string
  ) => void;
  onPeersChange: (peers: PeerPresence[]) => void;
  onStatusChange: (status: RoomSyncStatus) => void;
  getCurrentNotebook: () => ShootNotebook | null;
}

export interface RoomSyncSession {
  broadcastFullState: (nb: ShootNotebook) => void;
  broadcastDelta: (delta: NotebookDelta) => void;
  broadcastMediaBlob: (
    mediaId: string,
    blob: Blob,
    mimeType: string,
    fileName: string
  ) => Promise<void>;
  broadcastCursor: (x: number, y: number, tool: NotebookTool) => void;
  requestSync: () => void;
  announcePresence: () => void;
  leave: () => void;
}

interface MediaChunkPacket {
  mediaId: string;
  mimeType: string;
  fileName: string;
  index: number;
  total: number;
  chunk: string;
}

interface FrameChunkPayload {
  transferId: string;
  index: number;
  total: number;
  data: string;
}

type SyncEnvelopeKind =
  | "hello"
  | "presence"
  | "bye"
  | "full"
  | "delta"
  | "cursor"
  | "media"
  | "chunk";

interface SyncEnvelope {
  v: 2;
  msgId: string;
  senderId: string;
  kind: SyncEnvelopeKind;
  payload?: unknown;
}

const MAX_SYNC_MEDIA_BYTES = 10 * 1024 * 1024; // 10 MB per shared clip
const MEDIA_PACKET_CHARS = 12 * 1024;
const FRAME_CHUNK_LIMIT = 18_000;
const FRAME_CHUNK_SIZE = 16_000;
const MAX_SEEN_IDS = 600;
const PEER_TTL_MS = 14_000;

function colorForPeer(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i += 1) {
    hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  }
  return PEER_COLORS[hash % PEER_COLORS.length];
}

function makeShortId(prefix: string): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `${prefix}-${crypto.randomUUID().slice(0, 8)}`;
  }
  return `${prefix}-${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 7)}`;
}

function hasNotebookContent(nb: ShootNotebook | null): nb is ShootNotebook {
  if (!nb) return false;
  return (
    nb.metaUpdatedAt > 0 ||
    nb.strokes.length > 0 ||
    nb.items.length > 0 ||
    (Array.isArray(nb.pages) && nb.pages.some((p) => p.updatedAt > 0))
  );
}

export async function createRoomSyncSession(
  opts: RoomSyncCallbacks
): Promise<RoomSyncSession> {
  const {
    roomId,
    getDisplayName,
    onFullState,
    onDelta,
    onMediaBlob,
    onPeersChange,
    onStatusChange,
    getCurrentNotebook,
  } = opts;

  const localClientId = makeShortId("sn");
  const topic = `shootnote/v2/${roomId}`;

  const peersMap = new Map<string, PeerPresence>();
  const seenMsgIds = new Set<string>();
  const pendingChunks = new Map<
    string,
    { total: number; parts: string[]; received: number; createdAt: number }
  >();
  const incomingMedia = new Map<
    string,
    { mimeType: string; fileName: string; total: number; chunks: string[]; received: number }
  >();

  let closed = false;
  let connectedBrokers = 0;
  let bc: BroadcastChannel | null = null;
  const mqttClients: MqttWsClientHandle[] = [];
  const pendingTimers = new Set<ReturnType<typeof setTimeout>>();

  onStatusChange("connecting");

  const updateConnectionStatus = () => {
    if (closed) return;
    if (connectedBrokers > 0) {
      onStatusChange("connected");
    } else if (bc) {
      onStatusChange("local");
    } else {
      onStatusChange("offline");
    }
  };

  const trackMsgId = (msgId: string): boolean => {
    if (seenMsgIds.has(msgId)) return false;
    seenMsgIds.add(msgId);
    if (seenMsgIds.size > MAX_SEEN_IDS) {
      const oldest = seenMsgIds.values().next().value;
      if (oldest !== undefined) {
        seenMsgIds.delete(oldest);
      }
    }
    return true;
  };

  const emitPeers = () => {
    const now = Date.now();
    for (const [pid, peer] of peersMap.entries()) {
      if (now - peer.lastSeen > PEER_TTL_MS) {
        peersMap.delete(pid);
      }
    }
    onPeersChange(Array.from(peersMap.values()));
  };

  const upsertPeer = (
    peerId: string,
    patch: Partial<Omit<PeerPresence, "peerId" | "color">>
  ) => {
    const existing = peersMap.get(peerId);
    peersMap.set(peerId, {
      peerId,
      name: patch.name?.trim() || existing?.name || `เพื่อน (${peerId.slice(-4)})`,
      color: existing?.color || colorForPeer(peerId),
      x: patch.x ?? existing?.x ?? -200,
      y: patch.y ?? existing?.y ?? -200,
      tool: patch.tool ?? existing?.tool ?? "pen",
      lastSeen: Date.now(),
    });
    emitPeers();
  };

  const handleMediaPacket = (packet: MediaChunkPacket) => {
    if (!packet?.mediaId || !packet.total) return;
    let entry = incomingMedia.get(packet.mediaId);
    if (!entry) {
      entry = {
        mimeType: packet.mimeType,
        fileName: packet.fileName,
        total: packet.total,
        chunks: new Array(packet.total).fill(""),
        received: 0,
      };
      incomingMedia.set(packet.mediaId, entry);
    }
    if (!entry.chunks[packet.index]) {
      entry.chunks[packet.index] = packet.chunk;
      entry.received += 1;
    }
    if (entry.received >= entry.total) {
      const fullB64 = entry.chunks.join("");
      incomingMedia.delete(packet.mediaId);
      try {
        const blob = base64ToBlob(fullB64, entry.mimeType);
        onMediaBlob(packet.mediaId, blob, entry.mimeType, entry.fileName);
      } catch {
        // Ignore corrupt transfer
      }
    }
  };

  const sendRawToMqtt = (serialized: string) => {
    for (const client of mqttClients) {
      if (client.isConnected()) {
        client.publish(serialized);
      }
    }
  };

  const dispatchEnvelope = (kind: SyncEnvelopeKind, payload?: unknown) => {
    if (closed) return;
    const envelope: SyncEnvelope = {
      v: 2,
      msgId: makeShortId("m"),
      senderId: localClientId,
      kind,
      payload,
    };

    const serialized = JSON.stringify(envelope);

    if (serialized.length <= FRAME_CHUNK_LIMIT) {
      try {
        bc?.postMessage(envelope);
      } catch {
        // Ignore
      }
      sendRawToMqtt(serialized);
      return;
    }

    // Large payload (e.g. notebook with embedded images / many strokes) -> split cleanly
    const transferId = makeShortId("tx");
    const total = Math.ceil(serialized.length / FRAME_CHUNK_SIZE);
    for (let i = 0; i < total; i += 1) {
      const chunkEnvelope: SyncEnvelope = {
        v: 2,
        msgId: makeShortId("c"),
        senderId: localClientId,
        kind: "chunk",
        payload: {
          transferId,
          index: i,
          total,
          data: serialized.slice(
            i * FRAME_CHUNK_SIZE,
            (i + 1) * FRAME_CHUNK_SIZE
          ),
        } satisfies FrameChunkPayload,
      };

      try {
        bc?.postMessage(chunkEnvelope);
      } catch {
        // Ignore
      }

      const chunkJson = JSON.stringify(chunkEnvelope);
      if (i < 3) {
        sendRawToMqtt(chunkJson);
      } else {
        const timer = setTimeout(() => {
          pendingTimers.delete(timer);
          if (!closed) {
            sendRawToMqtt(chunkJson);
          }
        }, (i - 2) * 12);
        pendingTimers.add(timer);
      }
    }
  };

  const processEnvelope = (msg: SyncEnvelope) => {
    if (closed || !msg || msg.senderId === localClientId || !msg.msgId) {
      return;
    }
    if (!trackMsgId(msg.msgId)) return;

    if (msg.kind === "chunk" && msg.payload) {
      const c = msg.payload as FrameChunkPayload;
      if (!c.transferId || !c.total || c.index < 0 || c.index >= c.total) {
        return;
      }
      let entry = pendingChunks.get(c.transferId);
      if (!entry) {
        entry = {
          total: c.total,
          parts: new Array(c.total).fill(""),
          received: 0,
          createdAt: Date.now(),
        };
        pendingChunks.set(c.transferId, entry);
      }
      if (!entry.parts[c.index]) {
        entry.parts[c.index] = c.data;
        entry.received += 1;
      }
      if (entry.received >= entry.total) {
        const fullJson = entry.parts.join("");
        pendingChunks.delete(c.transferId);
        try {
          const inner = JSON.parse(fullJson) as SyncEnvelope;
          processEnvelope(inner);
        } catch {
          // Ignore malformed chunked envelope
        }
      }
      return;
    }

    if (msg.kind === "bye") {
      peersMap.delete(msg.senderId);
      emitPeers();
      return;
    }

    if (msg.kind === "hello") {
      const info = (msg.payload || {}) as { name?: string };
      upsertPeer(msg.senderId, { name: info.name });

      // Respond with our presence + current notebook state if we have content
      dispatchEnvelope("presence", { name: getDisplayName().trim() || "ฉัน" });
      const nb = getCurrentNotebook();
      if (hasNotebookContent(nb)) {
        const delay = 60 + Math.floor(Math.random() * 80);
        const t = setTimeout(() => {
          pendingTimers.delete(t);
          if (!closed) {
            const latest = getCurrentNotebook();
            if (hasNotebookContent(latest)) {
              dispatchEnvelope("full", latest);
            }
          }
        }, delay);
        pendingTimers.add(t);
      }
      return;
    }

    if (msg.kind === "presence") {
      const info = (msg.payload || {}) as { name?: string };
      upsertPeer(msg.senderId, { name: info.name });
      return;
    }

    if (msg.kind === "cursor" && msg.payload) {
      const c = msg.payload as {
        name?: string;
        x: number;
        y: number;
        tool: NotebookTool;
      };
      upsertPeer(msg.senderId, {
        name: c.name,
        x: c.x,
        y: c.y,
        tool: c.tool,
      });
      return;
    }

    if (msg.kind === "full" && msg.payload) {
      upsertPeer(msg.senderId, {});
      onFullState(msg.payload as ShootNotebook);
      return;
    }

    if (msg.kind === "delta" && msg.payload) {
      upsertPeer(msg.senderId, {});
      onDelta(msg.payload as NotebookDelta);
      return;
    }

    if (msg.kind === "media" && msg.payload) {
      upsertPeer(msg.senderId, {});
      handleMediaPacket(msg.payload as MediaChunkPacket);
    }
  };

  // 1. BroadcastChannel for instant same-browser multi-tab sync
  if (typeof window !== "undefined" && "BroadcastChannel" in window) {
    try {
      bc = new BroadcastChannel(`shootnote-room-v2-${roomId}`);
      bc.onmessage = (event) => {
        processEnvelope(event.data as SyncEnvelope);
      };
      updateConnectionStatus();
    } catch {
      bc = null;
    }
  }

  // 2. Dual-broker MQTT over WSS (cross-device across Safari, iPad, 4G/5G NAT, desktop)
  if (typeof window !== "undefined" && typeof WebSocket !== "undefined") {
    DEFAULT_MQTT_BROKERS.forEach((brokerUrl, idx) => {
      const client = createMqttWsClient({
        url: brokerUrl,
        clientId: `${localClientId}-b${idx}`,
        topic,
        onConnect: () => {
          connectedBrokers += 1;
          updateConnectionStatus();
          // Announce presence & sync with everyone in the room as soon as connected
          dispatchEnvelope("hello", { name: getDisplayName().trim() || "ฉัน" });
          const nb = getCurrentNotebook();
          if (hasNotebookContent(nb)) {
            const t = setTimeout(() => {
              pendingTimers.delete(t);
              if (!closed) {
                const latest = getCurrentNotebook();
                if (hasNotebookContent(latest)) {
                  dispatchEnvelope("full", latest);
                }
              }
            }, 140);
            pendingTimers.add(t);
          }
        },
        onDisconnect: () => {
          connectedBrokers = Math.max(0, connectedBrokers - 1);
          updateConnectionStatus();
        },
        onMessage: (rawPayload) => {
          try {
            const parsed = JSON.parse(rawPayload) as SyncEnvelope;
            processEnvelope(parsed);
          } catch {
            // Ignore malformed message
          }
        },
      });
      mqttClients.push(client);
    });
  }

  // Initial local hello & periodic presence heartbeat (keeps online friend list steady)
  dispatchEnvelope("hello", { name: getDisplayName().trim() || "ฉัน" });

  const heartbeatInterval = setInterval(() => {
    if (closed) return;
    dispatchEnvelope("presence", { name: getDisplayName().trim() || "ฉัน" });

    // Prune stale chunks > 30s
    const now = Date.now();
    for (const [txId, entry] of pendingChunks.entries()) {
      if (now - entry.createdAt > 30_000) {
        pendingChunks.delete(txId);
      }
    }
    emitPeers();
  }, 3500);

  return {
    broadcastFullState(nb: ShootNotebook) {
      if (closed) return;
      dispatchEnvelope("full", nb);
    },

    broadcastDelta(delta: NotebookDelta) {
      if (closed) return;
      dispatchEnvelope("delta", delta);
    },

    async broadcastMediaBlob(
      mediaId: string,
      blob: Blob,
      mimeType: string,
      fileName: string
    ) {
      if (closed || blob.size > MAX_SYNC_MEDIA_BYTES) return;
      const b64 = await blobToBase64(blob);
      const total = Math.max(1, Math.ceil(b64.length / MEDIA_PACKET_CHARS));
      for (let i = 0; i < total; i += 1) {
        if (closed) break;
        const packet: MediaChunkPacket = {
          mediaId,
          mimeType,
          fileName,
          index: i,
          total,
          chunk: b64.slice(i * MEDIA_PACKET_CHARS, (i + 1) * MEDIA_PACKET_CHARS),
        };
        dispatchEnvelope("media", packet);
        if (i % 3 === 2) {
          await new Promise((r) => setTimeout(r, 15));
        }
      }
    },

    broadcastCursor(x: number, y: number, tool: NotebookTool) {
      if (closed) return;
      dispatchEnvelope("cursor", {
        name: getDisplayName().trim() || "ฉัน",
        x,
        y,
        tool,
      });
    },

    requestSync() {
      if (closed) return;
      dispatchEnvelope("hello", { name: getDisplayName().trim() || "ฉัน" });
      const nb = getCurrentNotebook();
      if (hasNotebookContent(nb)) {
        dispatchEnvelope("full", nb);
      }
    },

    announcePresence() {
      if (closed) return;
      dispatchEnvelope("presence", { name: getDisplayName().trim() || "ฉัน" });
    },

    leave() {
      closed = true;
      dispatchEnvelope("bye");
      clearInterval(heartbeatInterval);
      for (const timer of pendingTimers) {
        clearTimeout(timer);
      }
      pendingTimers.clear();
      bc?.close();
      bc = null;
      for (const client of mqttClients) {
        client.close();
      }
      mqttClients.length = 0;
      peersMap.clear();
      onPeersChange([]);
    },
  };
}
