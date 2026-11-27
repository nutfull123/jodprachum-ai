export const APP_RELEASE_VERSION = "3.2.0";

export const APP_UPDATE_HIGHLIGHTS: string[] = [
  "นำเข้าไฟล์ PDF มาเขียนโน้ตทับได้ทันที พร้อมส่งออกทุกหน้าเป็น PDF คมชัด",
  "สร้างเทมเพลตสมุดเองได้ + กระดาษแนวนอน/หลายขนาด (A4, A5, A3, B5, Letter, จัตุรัส)",
  "แยกโหมด Apple Pencil (1 นิ้วเลื่อนหน้าจอ) กับนิ้วเขียน + 16 รูปทรง + ยางลบลบเฉพาะส่วน/ทั้งเส้น",
  "คิดเลข & แก้สมการอัตโนมัติ (เช่น 5x+3=y, x², ระบบ 2 สมการ) พร้อมแนบรูปสมการได้ทันที",
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
