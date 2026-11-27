export const APP_RELEASE_VERSION = "3.1.0";

export const APP_UPDATE_HIGHLIGHTS: string[] = [
  "หน้าแรกแบบคลังโฟลเดอร์สไตล์ GoodNotes สร้าง/แก้ไขสีโฟลเดอร์ และย้ายสมุดข้ามโฟลเดอร์ได้ (ลากวางหรือกดย้าย)",
  "พับเก็บแถบซ้ายและแถบด้านบนได้ เพื่อขยายพื้นที่กระดาษเขียนบน iPad และหน้าจอใหญ่ให้กว้างเต็มตา",
  "คลาวด์ Live 24 ชม. + แนบไฟล์วิจัย (PDF/Office/YouTube/Drive) + ดัดทรงเส้น + เครื่องคิดเลขเขียนมือ",
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
