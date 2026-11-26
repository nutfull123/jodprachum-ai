const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

export const DEFAULT_MQTT_BROKERS = [
  "wss://broker.emqx.io:8084/mqtt",
  "wss://broker.hivemq.com:8884/mqtt",
] as const;

export type MqttIncomingPacket =
  | { type: "connack"; returnCode: number }
  | { type: "suback"; packetId: number }
  | { type: "pingresp" }
  | { type: "publish"; topic: string; payload: string }
  | { type: "other"; packetType: number };

function encodeUtf8String(value: string): Uint8Array {
  const bytes = textEncoder.encode(value);
  const out = new Uint8Array(2 + bytes.length);
  out[0] = (bytes.length >> 8) & 0xff;
  out[1] = bytes.length & 0xff;
  out.set(bytes, 2);
  return out;
}

function concatBytes(parts: Uint8Array[]): Uint8Array {
  let total = 0;
  for (const part of parts) {
    total += part.length;
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

export function encodeRemainingLength(len: number): number[] {
  const out: number[] = [];
  let x = Math.max(0, Math.floor(len));
  do {
    let encodedByte = x % 128;
    x = Math.floor(x / 128);
    if (x > 0) {
      encodedByte |= 128;
    }
    out.push(encodedByte);
  } while (x > 0);
  return out;
}

export function decodeRemainingLength(
  buf: Uint8Array,
  offset: number
): { value: number; bytesUsed: number } | null {
  let multiplier = 1;
  let value = 0;
  let bytesUsed = 0;

  while (true) {
    if (offset + bytesUsed >= buf.length) {
      return null;
    }
    const encodedByte = buf[offset + bytesUsed];
    bytesUsed += 1;
    value += (encodedByte & 127) * multiplier;
    if ((encodedByte & 128) === 0) {
      return { value, bytesUsed };
    }
    multiplier *= 128;
    if (multiplier > 128 * 128 * 128) {
      throw new Error("Malformed MQTT remaining length");
    }
  }
}

function buildPacket(fixedHeaderByte: number, body: Uint8Array): Uint8Array {
  const rem = encodeRemainingLength(body.length);
  const out = new Uint8Array(1 + rem.length + body.length);
  out[0] = fixedHeaderByte;
  out.set(rem, 1);
  out.set(body, 1 + rem.length);
  return out;
}

export function encodeMqttConnect(
  clientId: string,
  keepAliveSec: number = 25
): Uint8Array {
  const protocolName = encodeUtf8String("MQTT");
  const headerRest = new Uint8Array([
    0x04, // Protocol Level 4 (MQTT 3.1.1)
    0x02, // Clean Session
    (keepAliveSec >> 8) & 0xff,
    keepAliveSec & 0xff,
  ]);
  const clientIdBytes = encodeUtf8String(clientId);
  return buildPacket(0x10, concatBytes([protocolName, headerRest, clientIdBytes]));
}

export function encodeMqttSubscribe(
  packetId: number,
  topic: string
): Uint8Array {
  const pidBytes = new Uint8Array([(packetId >> 8) & 0xff, packetId & 0xff]);
  const topicBytes = encodeUtf8String(topic);
  const qosByte = new Uint8Array([0x00]); // QoS 0
  return buildPacket(0x82, concatBytes([pidBytes, topicBytes, qosByte]));
}

export function encodeMqttPublish(topic: string, payload: string): Uint8Array {
  const topicBytes = encodeUtf8String(topic);
  const payloadBytes = textEncoder.encode(payload);
  return buildPacket(0x30, concatBytes([topicBytes, payloadBytes]));
}

export function encodeMqttPingreq(): Uint8Array {
  return new Uint8Array([0xc0, 0x00]);
}

export function encodeMqttDisconnect(): Uint8Array {
  return new Uint8Array([0xe0, 0x00]);
}

export function decodeMqttPackets(buffer: Uint8Array): {
  packets: MqttIncomingPacket[];
  remaining: Uint8Array;
} {
  const packets: MqttIncomingPacket[] = [];
  let offset = 0;

  while (offset < buffer.length) {
    if (offset + 2 > buffer.length) break;

    const fixedHeader = buffer[offset];
    const packetType = (fixedHeader >> 4) & 0x0f;
    const flags = fixedHeader & 0x0f;

    let rem: { value: number; bytesUsed: number } | null;
    try {
      rem = decodeRemainingLength(buffer, offset + 1);
    } catch {
      // Skip malformed byte to recover stream
      offset += 1;
      continue;
    }

    if (!rem) break;

    const bodyStart = offset + 1 + rem.bytesUsed;
    const bodyEnd = bodyStart + rem.value;
    if (bodyEnd > buffer.length) break;

    const body = buffer.subarray(bodyStart, bodyEnd);

    if (packetType === 2 && body.length >= 2) {
      packets.push({ type: "connack", returnCode: body[1] });
    } else if (packetType === 9 && body.length >= 2) {
      const packetId = (body[0] << 8) | body[1];
      packets.push({ type: "suback", packetId });
    } else if (packetType === 13) {
      packets.push({ type: "pingresp" });
    } else if (packetType === 3 && body.length >= 2) {
      const topicLen = (body[0] << 8) | body[1];
      let pos = 2 + topicLen;
      if (pos <= body.length) {
        const topic = textDecoder.decode(body.subarray(2, pos));
        const qos = (flags >> 1) & 0x03;
        if (qos > 0) {
          pos += 2;
        }
        const payload =
          pos <= body.length ? textDecoder.decode(body.subarray(pos)) : "";
        packets.push({ type: "publish", topic, payload });
      }
    } else {
      packets.push({ type: "other", packetType });
    }

    offset = bodyEnd;
  }

  return {
    packets,
    remaining: offset === 0 ? buffer : buffer.slice(offset),
  };
}

export interface MqttWsClientOptions {
  url: string;
  clientId: string;
  topic: string;
  onConnect: () => void;
  onDisconnect: () => void;
  onMessage: (payload: string) => void;
}

export interface MqttWsClientHandle {
  publish: (payload: string) => boolean;
  isConnected: () => boolean;
  close: () => void;
}

export function createMqttWsClient(
  opts: MqttWsClientOptions
): MqttWsClientHandle {
  const { url, clientId, topic, onConnect, onDisconnect, onMessage } = opts;

  let ws: WebSocket | null = null;
  let rxBuffer: Uint8Array = new Uint8Array(0);
  let connected = false;
  let manuallyClosed = false;
  let pingTimer: ReturnType<typeof setInterval> | null = null;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let reconnectAttempt = 0;

  const clearTimers = () => {
    if (pingTimer) {
      clearInterval(pingTimer);
      pingTimer = null;
    }
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
  };

  const scheduleReconnect = () => {
    if (manuallyClosed || reconnectTimer) return;
    const delayMs = Math.min(10_000, 1500 * Math.pow(2, reconnectAttempt));
    reconnectAttempt = Math.min(reconnectAttempt + 1, 4);
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      connectSocket();
    }, delayMs);
  };

  const connectSocket = () => {
    if (manuallyClosed || typeof WebSocket === "undefined") return;
    clearTimers();
    rxBuffer = new Uint8Array(0);

    try {
      ws = new WebSocket(url, "mqtt");
    } catch {
      scheduleReconnect();
      return;
    }

    ws.binaryType = "arraybuffer";

    ws.onopen = () => {
      if (manuallyClosed || !ws || ws.readyState !== WebSocket.OPEN) return;
      try {
        ws.send(encodeMqttConnect(clientId, 25));
      } catch {
        // Ignore send error; onclose will trigger reconnect
      }
    };

    ws.onmessage = (event) => {
      if (manuallyClosed) return;
      let incoming: Uint8Array | null = null;
      if (event.data instanceof ArrayBuffer) {
        incoming = new Uint8Array(event.data);
      } else if (ArrayBuffer.isView(event.data)) {
        incoming = new Uint8Array(
          event.data.buffer,
          event.data.byteOffset,
          event.data.byteLength
        );
      }
      if (!incoming || incoming.length === 0) return;

      rxBuffer =
        rxBuffer.length === 0 ? incoming : concatBytes([rxBuffer, incoming]);

      const decoded = decodeMqttPackets(rxBuffer);
      rxBuffer = decoded.remaining;

      for (const pkt of decoded.packets) {
        if (pkt.type === "connack") {
          if (pkt.returnCode === 0) {
            reconnectAttempt = 0;
            try {
              ws?.send(encodeMqttSubscribe(1, topic));
            } catch {
              // Ignore
            }
            if (!connected) {
              connected = true;
              onConnect();
            }
            if (!pingTimer) {
              pingTimer = setInterval(() => {
                if (ws && ws.readyState === WebSocket.OPEN) {
                  try {
                    ws.send(encodeMqttPingreq());
                  } catch {
                    // Ignore
                  }
                }
              }, 20_000);
            }
          } else {
            ws?.close();
          }
        } else if (pkt.type === "publish") {
          if (pkt.topic === topic && pkt.payload) {
            onMessage(pkt.payload);
          }
        }
      }
    };

    ws.onerror = () => {
      // onclose handles cleanup & reconnect
    };

    ws.onclose = () => {
      const wasConnected = connected;
      connected = false;
      clearTimers();
      ws = null;
      if (wasConnected && !manuallyClosed) {
        onDisconnect();
      }
      if (!manuallyClosed) {
        scheduleReconnect();
      }
    };
  };

  connectSocket();

  return {
    publish(payload: string): boolean {
      if (
        manuallyClosed ||
        !connected ||
        !ws ||
        ws.readyState !== WebSocket.OPEN
      ) {
        return false;
      }
      try {
        ws.send(encodeMqttPublish(topic, payload));
        return true;
      } catch {
        return false;
      }
    },

    isConnected(): boolean {
      return connected && Boolean(ws && ws.readyState === WebSocket.OPEN);
    },

    close(): void {
      manuallyClosed = true;
      const wasConnected = connected;
      connected = false;
      clearTimers();
      if (ws) {
        try {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(encodeMqttDisconnect());
          }
        } catch {
          // Ignore
        }
        try {
          ws.onopen = null;
          ws.onmessage = null;
          ws.onerror = null;
          ws.onclose = null;
          ws.close();
        } catch {
          // Ignore
        }
        ws = null;
      }
      if (wasConnected) {
        onDisconnect();
      }
    },
  };
}
