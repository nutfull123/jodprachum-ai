import { NextResponse } from "next/server";
import {
  isCloudFilesConfigured,
  isCloudRoomsConfigured,
} from "../../../lib/cloud-store";

export const dynamic = "force-dynamic";

export async function GET() {
  const hasServerKey = Boolean(process.env.GEMINI_API_KEY?.trim());
  const requiresPasscode = Boolean(
    hasServerKey && process.env.ACCESS_PASSCODE?.trim()
  );

  return NextResponse.json({
    hasServerKey,
    requiresPasscode,
    hasCloudRooms: isCloudRoomsConfigured(),
    hasCloudFiles: isCloudFilesConfigured(),
  });
}
