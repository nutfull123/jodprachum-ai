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

export type RoomSyncStatus = "connecting" | "connected" | "offline";

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
  displayName: string;
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

const MAX_SYNC_MEDIA_BYTES = 10 * 1024 * 1024; // 10 MB per shared clip over P2P
const MEDIA_PACKET_CHARS = 32 * 1024;

function colorForPeer(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i += 1) {
    hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  }
  return PEER_COLORS[hash % PEER_COLORS.length];
}

export async function createRoomSyncSession(
  opts: RoomSyncCallbacks
): Promise<RoomSyncSession> {
  const {
    roomId,
    displayName,
    onFullState,
    onDelta,
    onMediaBlob,
    onPeersChange,
    onStatusChange,
    getCurrentNotebook,
  } = opts;

  const localClientId =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID().slice(0, 8)
      : `p-${Math.floor(Math.random() * 100000)}`;

  const peersMap = new Map<string, PeerPresence>();
  const incomingMedia = new Map<
    string,
    { mimeType: string; fileName: string; total: number; chunks: string[]; received: number }
  >();

  let closed = false;
  onStatusChange("connecting");

  const emitPeers = () => {
    const now = Date.now();
    for (const [pid, peer] of peersMap.entries()) {
      if (now - peer.lastSeen > 8000) {
        peersMap.delete(pid);
      }
    }
    onPeersChange(Array.from(peersMap.values()));
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

  // 1. BroadcastChannel for instant zero-latency same-browser / multi-tab sync
  let bc: BroadcastChannel | null = null;
  if (typeof window !== "undefined" && "BroadcastChannel" in window) {
    try {
      bc = new BroadcastChannel(`shootnote-room-${roomId}`);
      bc.onmessage = (event) => {
        const msg = event.data as {
          senderId?: string;
          kind?: string;
          payload?: unknown;
        };
        if (!msg || msg.senderId === localClientId) return;

        if (msg.kind === "hello") {
          const nb = getCurrentNotebook();
          if (nb) {
            bc?.postMessage({
              senderId: localClientId,
              kind: "full",
              payload: nb,
            });
          }
        } else if (msg.kind === "full" && msg.payload) {
          onFullState(msg.payload as ShootNotebook);
        } else if (msg.kind === "delta" && msg.payload) {
          onDelta(msg.payload as NotebookDelta);
        } else if (msg.kind === "cursor" && msg.payload) {
          const c = msg.payload as {
            name: string;
            x: number;
            y: number;
            tool: NotebookTool;
          };
          const pid = msg.senderId || "tab";
          peersMap.set(pid, {
            peerId: pid,
            name: c.name || "เพื่อนร่วมงาน",
            color: colorForPeer(pid),
            x: c.x,
            y: c.y,
            tool: c.tool,
            lastSeen: Date.now(),
          });
          emitPeers();
        } else if (msg.kind === "media" && msg.payload) {
          handleMediaPacket(msg.payload as MediaChunkPacket);
        }
      };

      bc.postMessage({ senderId: localClientId, kind: "hello" });
    } catch {
      bc = null;
    }
  }

  // 2. Trystero P2P WebRTC over Nostr relays (100% free, cross-device)
  interface TrysteroRoomHandle {
    leave: () => void;
    makeAction: <T>(
      name: string
    ) => [
      (data: T, targetPeers?: string | string[]) => void,
      (cb: (data: T, peerId: string) => void) => void
    ];
    onPeerJoin: (cb: (peerId: string) => void) => void;
    onPeerLeave: (cb: (peerId: string) => void) => void;
  }

  let trysteroRoom: TrysteroRoomHandle | null = null;

  let sendFullP2P: ((nb: ShootNotebook, target?: string) => void) | null = null;
  let sendDeltaP2P: ((delta: NotebookDelta) => void) | null = null;
  let sendCursorP2P: ((c: { name: string; x: number; y: number; tool: NotebookTool }) => void) | null = null;
  let sendMediaP2P: ((p: MediaChunkPacket) => void) | null = null;

  try {
    const mod = await import("trystero");
    if (closed) {
      return {
        broadcastFullState: () => undefined,
        broadcastDelta: () => undefined,
        broadcastMediaBlob: async () => undefined,
        broadcastCursor: () => undefined,
        leave: () => bc?.close(),
      };
    }

    const room = mod.joinRoom(
      { appId: "shootnote-live-v1" },
      roomId
    ) as unknown as TrysteroRoomHandle;
    trysteroRoom = room;

    if (room) {
      const [sFull, rFull] = room.makeAction<ShootNotebook>("full");
      const [sDelta, rDelta] = room.makeAction<NotebookDelta>("delta");
      const [sCursor, rCursor] = room.makeAction<{
        name: string;
        x: number;
        y: number;
        tool: NotebookTool;
      }>("cursor");
      const [sMedia, rMedia] = room.makeAction<MediaChunkPacket>("media");

      sendFullP2P = sFull;
      sendDeltaP2P = sDelta;
      sendCursorP2P = sCursor;
      sendMediaP2P = sMedia;

      onStatusChange("connected");

      rFull((nb) => {
        onFullState(nb);
      });

      rDelta((delta) => {
        onDelta(delta);
      });

      rCursor((c, peerId) => {
        peersMap.set(peerId, {
          peerId,
          name: c.name || `เพื่อน (${peerId.slice(0, 4)})`,
          color: colorForPeer(peerId),
          x: c.x,
          y: c.y,
          tool: c.tool,
          lastSeen: Date.now(),
        });
        emitPeers();
      });

      rMedia((packet) => {
        handleMediaPacket(packet);
      });

      room.onPeerJoin((peerId) => {
        peersMap.set(peerId, {
          peerId,
          name: "เพื่อนร่วมห้อง",
          color: colorForPeer(peerId),
          x: -200,
          y: -200,
          tool: "pen",
          lastSeen: Date.now(),
        });
        emitPeers();
        const nb = getCurrentNotebook();
        if (nb) {
          sFull(nb, peerId);
        }
      });

      room.onPeerLeave((peerId) => {
        peersMap.delete(peerId);
        emitPeers();
      });
    }
  } catch {
    // WebRTC/Nostr unavailable (offline); BroadcastChannel + IndexedDB still active
    onStatusChange(bc ? "connected" : "offline");
  }

  const cleanupInterval = window.setInterval(emitPeers, 3500);

  return {
    broadcastFullState(nb: ShootNotebook) {
      if (closed) return;
      bc?.postMessage({ senderId: localClientId, kind: "full", payload: nb });
      try {
        sendFullP2P?.(nb);
      } catch {
        // Ignore transient P2P send errors
      }
    },

    broadcastDelta(delta: NotebookDelta) {
      if (closed) return;
      bc?.postMessage({ senderId: localClientId, kind: "delta", payload: delta });
      try {
        sendDeltaP2P?.(delta);
      } catch {
        // Ignore transient P2P send errors
      }
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
        bc?.postMessage({ senderId: localClientId, kind: "media", payload: packet });
        try {
          sendMediaP2P?.(packet);
        } catch {
          // Ignore transient send error
        }
      }
    },

    broadcastCursor(x: number, y: number, tool: NotebookTool) {
      if (closed) return;
      const payload = {
        name: displayName.trim() || "ฉัน",
        x,
        y,
        tool,
      };
      bc?.postMessage({ senderId: localClientId, kind: "cursor", payload });
      try {
        sendCursorP2P?.(payload);
      } catch {
        // Ignore
      }
    },

    leave() {
      closed = true;
      window.clearInterval(cleanupInterval);
      bc?.close();
      try {
        trysteroRoom?.leave();
      } catch {
        // Ignore
      }
      peersMap.clear();
      onPeersChange([]);
    },
  };
}
