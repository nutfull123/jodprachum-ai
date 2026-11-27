import type { MeetingAnalysis, SavedMeeting } from "../types/meeting";
import type {
  CustomPaperTemplate,
  NotebookFolder,
  ShootNotebook,
} from "../types/notebook";

const DB_NAME = "jodprachum_local_v1";
const DB_VERSION = 4;
const STORE_MEETINGS = "meetings";
const STORE_AUDIO = "audio_blobs";
const STORE_NOTEBOOKS = "notebooks";
const STORE_MEDIA = "media_blobs";
const STORE_FOLDERS = "folders";
const STORE_TEMPLATES = "custom_templates";

const LS_API_KEY = "jodprachum_gemini_key";
const LS_PASSCODE = "jodprachum_passcode";
const LS_DISPLAY_NAME = "shootnote_display_name";
const LS_THEME = "shootnote_theme";

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
      if (!db.objectStoreNames.contains(STORE_NOTEBOOKS)) {
        db.createObjectStore(STORE_NOTEBOOKS, { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains(STORE_MEDIA)) {
        db.createObjectStore(STORE_MEDIA, { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains(STORE_FOLDERS)) {
        db.createObjectStore(STORE_FOLDERS, { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains(STORE_TEMPLATES)) {
        db.createObjectStore(STORE_TEMPLATES, { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(request.error || new Error("เปิดฐานข้อมูลในเครื่องไม่สำเร็จ"));
  });
}

// =========================================================================
// Meetings & Audio Blobs
// =========================================================================

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

// =========================================================================
// ShootNote Notebooks & Media Blobs
// =========================================================================

export async function listNotebooks(): Promise<ShootNotebook[]> {
  if (typeof window === "undefined") return [];
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NOTEBOOKS, "readonly");
    const req = tx.objectStore(STORE_NOTEBOOKS).getAll();
    req.onsuccess = () => {
      const rows = (req.result || []) as ShootNotebook[];
      rows.sort((a, b) => b.updatedAt - a.updatedAt);
      resolve(rows);
    };
    req.onerror = () => reject(req.error);
  });
}

export async function getNotebook(id: string): Promise<ShootNotebook | null> {
  if (typeof window === "undefined") return null;
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NOTEBOOKS, "readonly");
    const req = tx.objectStore(STORE_NOTEBOOKS).get(id);
    req.onsuccess = () => resolve((req.result as ShootNotebook | undefined) ?? null);
    req.onerror = () => reject(req.error);
  });
}

export async function saveNotebook(notebook: ShootNotebook): Promise<void> {
  if (typeof window === "undefined") return;
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NOTEBOOKS, "readwrite");
    tx.objectStore(STORE_NOTEBOOKS).put(notebook);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function deleteNotebook(id: string): Promise<void> {
  if (typeof window === "undefined") return;
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NOTEBOOKS, "readwrite");
    tx.objectStore(STORE_NOTEBOOKS).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function saveMediaBlob(
  id: string,
  blob: Blob,
  mimeType: string,
  fileName: string
): Promise<void> {
  if (typeof window === "undefined") return;
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_MEDIA, "readwrite");
    tx.objectStore(STORE_MEDIA).put({ id, blob, mimeType, fileName });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function getMediaBlob(
  id: string
): Promise<{ id: string; blob: Blob; mimeType: string; fileName: string } | null> {
  if (typeof window === "undefined") return null;
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_MEDIA, "readonly");
    const req = tx.objectStore(STORE_MEDIA).get(id);
    req.onsuccess = () =>
      resolve(
        (req.result as
          | { id: string; blob: Blob; mimeType: string; fileName: string }
          | undefined) ?? null
      );
    req.onerror = () => reject(req.error);
  });
}

export async function deleteMediaBlob(id: string): Promise<void> {
  if (typeof window === "undefined") return;
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_MEDIA, "readwrite");
    tx.objectStore(STORE_MEDIA).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// =========================================================================
// Notebook Folders
// =========================================================================

export async function listFolders(): Promise<NotebookFolder[]> {
  if (typeof window === "undefined") return [];
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_FOLDERS, "readonly");
    const req = tx.objectStore(STORE_FOLDERS).getAll();
    req.onsuccess = () => {
      const rows = (req.result || []) as NotebookFolder[];
      rows.sort((a, b) => a.createdAt - b.createdAt || a.name.localeCompare(b.name, "th"));
      resolve(rows);
    };
    req.onerror = () => reject(req.error);
  });
}

export async function saveFolder(folder: NotebookFolder): Promise<void> {
  if (typeof window === "undefined") return;
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_FOLDERS, "readwrite");
    tx.objectStore(STORE_FOLDERS).put(folder);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function deleteFolder(id: string): Promise<void> {
  if (typeof window === "undefined") return;
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_FOLDERS, "readwrite");
    tx.objectStore(STORE_FOLDERS).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// =========================================================================
// Custom Paper Templates
// =========================================================================

export async function listCustomTemplates(): Promise<CustomPaperTemplate[]> {
  if (typeof window === "undefined") return [];
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_TEMPLATES, "readonly");
    const req = tx.objectStore(STORE_TEMPLATES).getAll();
    req.onsuccess = () => {
      const rows = (req.result || []) as CustomPaperTemplate[];
      rows.sort((a, b) => b.createdAt - a.createdAt);
      resolve(rows);
    };
    req.onerror = () => reject(req.error);
  });
}

export async function saveCustomTemplate(
  tpl: CustomPaperTemplate
): Promise<void> {
  if (typeof window === "undefined") return;
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_TEMPLATES, "readwrite");
    tx.objectStore(STORE_TEMPLATES).put(tpl);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function deleteCustomTemplate(id: string): Promise<void> {
  if (typeof window === "undefined") return;
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_TEMPLATES, "readwrite");
    tx.objectStore(STORE_TEMPLATES).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// =========================================================================
// LocalStorage Settings
// =========================================================================

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

export function getDisplayName(): string {
  if (typeof window === "undefined") return "ฉัน";
  return window.localStorage.getItem(LS_DISPLAY_NAME) || "";
}

export function setDisplayName(name: string): void {
  if (typeof window === "undefined") return;
  const trimmed = name.trim();
  if (trimmed) {
    window.localStorage.setItem(LS_DISPLAY_NAME, trimmed);
  } else {
    window.localStorage.removeItem(LS_DISPLAY_NAME);
  }
}

export function getStoredTheme(): "light" | "dark" {
  if (typeof window === "undefined") return "light";
  return window.localStorage.getItem(LS_THEME) === "dark" ? "dark" : "light";
}

export function setStoredTheme(theme: "light" | "dark"): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(LS_THEME, theme);
}
