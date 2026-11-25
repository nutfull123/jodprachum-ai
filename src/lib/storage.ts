import type { MeetingAnalysis, SavedMeeting } from "../types/meeting";

const DB_NAME = "jodprachum_local_v1";
const DB_VERSION = 1;
const STORE_MEETINGS = "meetings";
const STORE_AUDIO = "audio_blobs";

const LS_API_KEY = "jodprachum_gemini_key";
const LS_PASSCODE = "jodprachum_passcode";

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof window === "undefined" || !("indexedDB" in window)) {
      reject(new Error("เบราว์เซอร์ไม่รองรับการเก็บข้อมูลในเครื่อง (IndexedDB)"));
      return;
    }
    const request = window.indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_MEETINGS)) {
        db.createObjectStore(STORE_MEETINGS, { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains(STORE_AUDIO)) {
        db.createObjectStore(STORE_AUDIO, { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("เปิดฐานข้อมูลในเครื่องไม่สำเร็จ"));
  });
}

export async function listMeetings(): Promise<SavedMeeting[]> {
  if (typeof window === "undefined") return [];
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_MEETINGS, "readonly");
    const store = tx.objectStore(STORE_MEETINGS);
    const req = store.getAll();
    req.onsuccess = () => {
      const rows = (req.result || []) as SavedMeeting[];
      rows.sort((a, b) => b.createdAt - a.createdAt);
      resolve(rows);
    };
    req.onerror = () => reject(req.error);
  });
}

export async function saveMeeting(
  meeting: SavedMeeting,
  audioBlob?: Blob
): Promise<void> {
  if (typeof window === "undefined") return;
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const stores = audioBlob ? [STORE_MEETINGS, STORE_AUDIO] : [STORE_MEETINGS];
    const tx = db.transaction(stores, "readwrite");
    tx.objectStore(STORE_MEETINGS).put(meeting);
    if (audioBlob) {
      tx.objectStore(STORE_AUDIO).put({ id: meeting.id, blob: audioBlob });
    }
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function updateMeetingAnalysis(
  id: string,
  analysis: MeetingAnalysis
): Promise<SavedMeeting | null> {
  if (typeof window === "undefined") return null;
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_MEETINGS, "readwrite");
    const store = tx.objectStore(STORE_MEETINGS);
    const getReq = store.get(id);
    getReq.onsuccess = () => {
      const existing = getReq.result as SavedMeeting | undefined;
      if (!existing) {
        resolve(null);
        return;
      }
      const updated: SavedMeeting = {
        ...existing,
        updatedAt: Date.now(),
        analysis,
      };
      store.put(updated);
      tx.oncomplete = () => resolve(updated);
    };
    getReq.onerror = () => reject(getReq.error);
    tx.onerror = () => reject(tx.error);
  });
}

export async function getAudioBlob(id: string): Promise<Blob | null> {
  if (typeof window === "undefined") return null;
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_AUDIO, "readonly");
    const req = tx.objectStore(STORE_AUDIO).get(id);
    req.onsuccess = () => {
      const row = req.result as { id: string; blob?: Blob } | undefined;
      resolve(row?.blob ?? null);
    };
    req.onerror = () => reject(req.error);
  });
}

export async function deleteMeeting(id: string): Promise<void> {
  if (typeof window === "undefined") return;
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction([STORE_MEETINGS, STORE_AUDIO], "readwrite");
    tx.objectStore(STORE_MEETINGS).delete(id);
    tx.objectStore(STORE_AUDIO).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function clearAllMeetings(): Promise<void> {
  if (typeof window === "undefined") return;
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction([STORE_MEETINGS, STORE_AUDIO], "readwrite");
    tx.objectStore(STORE_MEETINGS).clear();
    tx.objectStore(STORE_AUDIO).clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export function getStoredApiKey(): string {
  if (typeof window === "undefined") return "";
  return window.localStorage.getItem(LS_API_KEY) || "";
}

export function setStoredApiKey(key: string): void {
  if (typeof window === "undefined") return;
  const trimmed = key.trim();
  if (trimmed) {
    window.localStorage.setItem(LS_API_KEY, trimmed);
  } else {
    window.localStorage.removeItem(LS_API_KEY);
  }
}

export function getStoredPasscode(): string {
  if (typeof window === "undefined") return "";
  return window.localStorage.getItem(LS_PASSCODE) || "";
}

export function setStoredPasscode(code: string): void {
  if (typeof window === "undefined") return;
  const trimmed = code.trim();
  if (trimmed) {
    window.localStorage.setItem(LS_PASSCODE, trimmed);
  } else {
    window.localStorage.removeItem(LS_PASSCODE);
  }
}
