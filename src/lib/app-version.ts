export const APP_RELEASE_VERSION = "3.0.0";

export const APP_UPDATE_HIGHLIGHTS: string[] = [
  "แถบเครื่องมือปักหมุดตามหน้าจอตลอดเวลา เลื่อนลงยาวแค่ไหนก็สลับปากกา/เพิ่มหน้าได้ทันที",
  "คลาวด์ Live 24 ชม. + แนบไฟล์วิจัย (PDF/Office/YouTube/Drive) + บีบอัดรูปคมชัดอัตโนมัติ",
  "วาดลากค้างแปลงเป็นเส้นตรง/รูปทรง + ซูม 2 นิ้ว + ตาราง + ทำสไลด์พรีเซนต์ + เครื่องคิดเลขเขียนมือ",
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
