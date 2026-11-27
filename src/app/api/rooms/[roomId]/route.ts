import { NextResponse } from "next/server";
import {
  getCloudRoom,
  hashRoomPin,
  isCloudRoomsConfigured,
  saveCloudRoom,
} from "../../../../lib/cloud-store";
import { mergeNotebook } from "../../../../lib/notebook-crdt";
import type { ShootNotebook } from "../../../../types/notebook";

export const dynamic = "force-dynamic";

function sanitizeRoomId(raw: string): string {
  return raw.trim().toUpperCase().replace(/[^A-Z0-9_-]/g, "").slice(0, 32);
}

export async function GET(
  req: Request,
  context: { params: Promise<{ roomId: string }> }
) {
  if (!isCloudRoomsConfigured()) {
    return NextResponse.json({
      configured: false,
      notebook: null,
      hasPin: false,
    });
  }

  const { roomId: rawRoom } = await context.params;
  const roomId = sanitizeRoomId(rawRoom);
  if (!roomId) {
    return NextResponse.json({ error: "Invalid room ID" }, { status: 400 });
  }

  try {
    const record = await getCloudRoom(roomId);
    if (!record) {
      return NextResponse.json({
        configured: true,
        notebook: null,
        hasPin: false,
      });
    }

    if (record.pinHash) {
      const providedPin = req.headers.get("x-room-pin")?.trim() || "";
      if (!providedPin || hashRoomPin(roomId, providedPin) !== record.pinHash) {
        return NextResponse.json(
          {
            configured: true,
            requiresPin: true,
            hasPin: true,
            error: "ห้องนี้ตั้งรหัส PIN ล็อกไว้ กรุณากรอก PIN เพื่อเข้าดูและแก้ไข",
          },
          { status: 401 }
        );
      }
    }

    return NextResponse.json({
      configured: true,
      notebook: {
        ...record.notebook,
        roomPinProtected: Boolean(record.pinHash),
      },
      hasPin: Boolean(record.pinHash),
    });
  } catch (err) {
    return NextResponse.json(
      {
        configured: true,
        error:
          err instanceof Error ? err.message : "เชื่อมต่อห้องคลาวด์ไม่สำเร็จ",
      },
      { status: 500 }
    );
  }
}

export async function POST(
  req: Request,
  context: { params: Promise<{ roomId: string }> }
) {
  if (!isCloudRoomsConfigured()) {
    return NextResponse.json({
      configured: false,
      notebook: null,
      hasPin: false,
    });
  }

  const { roomId: rawRoom } = await context.params;
  const roomId = sanitizeRoomId(rawRoom);
  if (!roomId) {
    return NextResponse.json({ error: "Invalid room ID" }, { status: 400 });
  }

  try {
    const body = (await req.json()) as {
      notebook?: ShootNotebook;
      pin?: string;
      setPin?: string | null;
    };

    if (!body?.notebook) {
      return NextResponse.json(
        { error: "Missing notebook payload" },
        { status: 400 }
      );
    }

    const existing = await getCloudRoom(roomId);
    const providedPin =
      (body.pin ?? req.headers.get("x-room-pin") ?? "").trim();

    if (existing?.pinHash) {
      if (!providedPin || hashRoomPin(roomId, providedPin) !== existing.pinHash) {
        return NextResponse.json(
          {
            configured: true,
            requiresPin: true,
            hasPin: true,
            error: "รหัส PIN ห้องไม่ถูกต้อง",
          },
          { status: 401 }
        );
      }
    }

    const incoming: ShootNotebook = {
      ...body.notebook,
      roomId,
    };

    const merged = existing?.notebook
      ? mergeNotebook(existing.notebook, incoming)
      : incoming;

    let nextPinHash = existing?.pinHash;
    if (body.setPin !== undefined) {
      const cleanedNewPin = (body.setPin || "").trim();
      nextPinHash = cleanedNewPin ? hashRoomPin(roomId, cleanedNewPin) : undefined;
    }

    const finalNotebook: ShootNotebook = {
      ...merged,
      roomId,
      roomPinProtected: Boolean(nextPinHash),
    };

    await saveCloudRoom(roomId, {
      notebook: finalNotebook,
      pinHash: nextPinHash,
      updatedAt: Date.now(),
    });

    return NextResponse.json({
      configured: true,
      notebook: finalNotebook,
      hasPin: Boolean(nextPinHash),
    });
  } catch (err) {
    return NextResponse.json(
      {
        configured: true,
        error:
          err instanceof Error ? err.message : "บันทึกห้องขึ้นคลาวด์ไม่สำเร็จ",
      },
      { status: 500 }
    );
  }
}
