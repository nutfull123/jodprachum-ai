import { createHash } from "crypto";
import type { ShootNotebook } from "../types/notebook";

export interface CloudRoomRecord {
  notebook: ShootNotebook;
  pinHash?: string;
  updatedAt: number;
}

function getRedisCredentials(): { url: string; token: string } | null {
  const url = (
    process.env.UPSTASH_REDIS_REST_URL ||
    process.env.KV_REST_API_URL ||
    ""
  )
    .trim()
    .replace(/\/+$/, "");
  const token = (
    process.env.UPSTASH_REDIS_REST_TOKEN ||
    process.env.KV_REST_API_TOKEN ||
    ""
  ).trim();

  if (!url || !token) return null;
  return { url, token };
}

export function isCloudRoomsConfigured(): boolean {
  return Boolean(getRedisCredentials());
}

export function isCloudFilesConfigured(): boolean {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN?.trim());
}

export function hashRoomPin(roomId: string, pin: string): string {
  return createHash("sha256")
    .update(`shootnote-room-pin:${roomId.trim().toUpperCase()}:${pin.trim()}`)
    .digest("hex");
}

function roomStorageKey(roomId: string): string {
  return `shootnote:room:v1:${roomId.trim().toUpperCase()}`;
}

export async function getCloudRoom(
  roomId: string
): Promise<CloudRoomRecord | null> {
  const creds = getRedisCredentials();
  if (!creds) return null;

  const key = encodeURIComponent(roomStorageKey(roomId));
  const res = await fetch(`${creds.url}/get/${key}`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${creds.token}`,
    },
    cache: "no-store",
  });

  if (!res.ok) {
    throw new Error(`Upstash GET failed (${res.status})`);
  }

  const data = (await res.json()) as { result?: string | null };
  if (!data?.result) return null;

  try {
    return JSON.parse(data.result) as CloudRoomRecord;
  } catch {
    return null;
  }
}

export async function saveCloudRoom(
  roomId: string,
  record: CloudRoomRecord
): Promise<void> {
  const creds = getRedisCredentials();
  if (!creds) return;

  const res = await fetch(creds.url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${creds.token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(["SET", roomStorageKey(roomId), JSON.stringify(record)]),
    cache: "no-store",
  });

  if (!res.ok) {
    throw new Error(`Upstash SET failed (${res.status})`);
  }
}
