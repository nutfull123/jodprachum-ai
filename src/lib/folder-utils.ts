import type { NotebookFolder, ShootNotebook } from "../types/notebook.ts";

/** Create a new folder record with sensible defaults. */
export function createFolder(
  name: string,
  color: string = "#0F766E",
  parentId: string | null = null
): NotebookFolder {
  const now = Date.now();
  const id =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? `folder-${crypto.randomUUID().slice(0, 8)}`
      : `folder-${now}-${Math.floor(Math.random() * 1000)}`;

  return {
    id,
    name: name.trim() || "โฟลเดอร์ใหม่",
    color,
    parentId,
    createdAt: now,
    updatedAt: now,
  };
}

/** Move a single notebook into targetFolderId (or null for root/Home). */
export function moveNotebookToFolder(
  notebooks: ShootNotebook[],
  notebookId: string,
  targetFolderId: string | null
): { updatedNotebook: ShootNotebook | null; notebooks: ShootNotebook[] } {
  let updatedNotebook: ShootNotebook | null = null;
  const now = Date.now();

  const next = notebooks.map((nb) => {
    if (nb.id !== notebookId) return nb;
    updatedNotebook = {
      ...nb,
      folderId: targetFolderId,
      updatedAt: now,
    };
    return updatedNotebook;
  });

  return { updatedNotebook, notebooks: next };
}

/**
 * Delete a folder without deleting any notebooks inside it.
 * Contained notebooks and child folders move up to the deleted folder's parentId (or root null).
 */
export function removeFolderAndUnfileNotebooks(
  folders: NotebookFolder[],
  notebooks: ShootNotebook[],
  folderId: string
): {
  folders: NotebookFolder[];
  notebooks: ShootNotebook[];
  affectedNotebooks: ShootNotebook[];
  affectedFolders: NotebookFolder[];
} {
  const target = folders.find((f) => f.id === folderId);
  const fallbackParentId = target?.parentId ?? null;
  const now = Date.now();

  const affectedFolders: NotebookFolder[] = [];
  const nextFolders = folders
    .filter((f) => f.id !== folderId)
    .map((f) => {
      if ((f.parentId ?? null) === folderId) {
        const updated: NotebookFolder = {
          ...f,
          parentId: fallbackParentId === f.id ? null : fallbackParentId,
          updatedAt: now,
        };
        affectedFolders.push(updated);
        return updated;
      }
      return f;
    });

  const affectedNotebooks: ShootNotebook[] = [];
  const nextNotebooks = notebooks.map((nb) => {
    if ((nb.folderId ?? null) === folderId) {
      const updated: ShootNotebook = {
        ...nb,
        folderId: fallbackParentId,
        updatedAt: now,
      };
      affectedNotebooks.push(updated);
      return updated;
    }
    return nb;
  });

  return {
    folders: nextFolders,
    notebooks: nextNotebooks,
    affectedNotebooks,
    affectedFolders,
  };
}

/** Count notebooks inside a folder (recursively including nested subfolders, with cycle guard). */
export function countNotebooksInFolder(
  notebooks: ShootNotebook[],
  folders: NotebookFolder[],
  folderId: string
): number {
  const descendantIds = new Set<string>();
  const stack = [folderId];

  while (stack.length > 0) {
    const curr = stack.pop()!;
    if (descendantIds.has(curr)) continue;
    descendantIds.add(curr);
    for (const f of folders) {
      if ((f.parentId ?? null) === curr && !descendantIds.has(f.id)) {
        stack.push(f.id);
      }
    }
  }

  return notebooks.filter((nb) =>
    nb.folderId ? descendantIds.has(nb.folderId) : false
  ).length;
}

/** Return root-to-current breadcrumb list for a folder, guarding against parent cycles. */
export function getFolderBreadcrumbs(
  folders: NotebookFolder[],
  folderId: string | null
): NotebookFolder[] {
  if (!folderId) return [];
  const byId = new Map(folders.map((f) => [f.id, f]));
  const chain: NotebookFolder[] = [];
  const visited = new Set<string>();

  let currId: string | null | undefined = folderId;
  while (currId && !visited.has(currId)) {
    const folder = byId.get(currId);
    if (!folder) break;
    visited.add(currId);
    chain.unshift(folder);
    currId = folder.parentId ?? null;
  }

  return chain;
}

/** Return true if moving folderId under targetParentId will not create a cycle. */
export function canMoveFolderInto(
  folders: NotebookFolder[],
  folderId: string,
  targetParentId: string | null
): boolean {
  if (targetParentId === null) return true;
  if (targetParentId === folderId) return false;
  const breadcrumbs = getFolderBreadcrumbs(folders, targetParentId);
  return !breadcrumbs.some((f) => f.id === folderId);
}
