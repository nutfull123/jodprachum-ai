import { NextResponse } from "next/server";
import {
  APP_RELEASE_VERSION,
  APP_UPDATE_HIGHLIGHTS,
  CLIENT_BUILD_ID,
  CLIENT_BUILT_AT,
  type AppVersionPayload,
} from "../../../lib/app-version";

export const dynamic = "force-dynamic";

export async function GET() {
  const serverBuildId =
    process.env.SHOOTNOTE_SERVER_BUILD_ID?.trim() || CLIENT_BUILD_ID;

  const payload: AppVersionPayload = {
    buildId: serverBuildId,
    version: APP_RELEASE_VERSION,
    builtAt: CLIENT_BUILT_AT,
    highlights: APP_UPDATE_HIGHLIGHTS,
  };

  return NextResponse.json(payload, {
    headers: {
      "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
    },
  });
}
