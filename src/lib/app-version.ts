export const APP_RELEASE_VERSION = "2.3.0";

export const APP_UPDATE_HIGHLIGHTS: string[] = [
  "กรอกชื่อผู้ใช้งานก่อนเข้าห้องแชร์สดทุกครั้ง เพื่อให้เพื่อนเห็นชื่อจริงทันที",
  "รองรับการรวมสมุดที่ปิด Live ไปแยกทำกลับเข้าห้องแชร์ได้โดยข้อมูลไม่หาย",
  "ปรับปรุงการเขียน Apple Pencil บน iPad และการซิงก์สดข้ามอุปกรณ์",
];

export const CLIENT_BUILD_ID =
  process.env.NEXT_PUBLIC_APP_BUILD_ID || "dev";

export const CLIENT_BUILT_AT =
  process.env.NEXT_PUBLIC_APP_BUILT_AT || "";

export interface AppVersionPayload {
  buildId: string;
  version: string;
  builtAt: string;
  highlights: string[];
}

export const UPDATE_SNOOZE_MS = 10 * 60 * 1000;

export function shouldPromptAppUpdate(opts: {
  clientBuildId: string;
  serverBuildId: string;
  snoozedBuildId?: string | null;
  snoozedUntil?: number;
  now?: number;
}): boolean {
  const { clientBuildId, serverBuildId, snoozedBuildId, snoozedUntil } = opts;
  if (
    !clientBuildId ||
    !serverBuildId ||
    clientBuildId === "dev" ||
    serverBuildId === "dev"
  ) {
    return false;
  }
  if (clientBuildId === serverBuildId) {
    return false;
  }
  const now = opts.now ?? Date.now();
  if (
    snoozedBuildId === serverBuildId &&
    typeof snoozedUntil === "number" &&
    now < snoozedUntil
  ) {
    return false;
  }
  return true;
}
