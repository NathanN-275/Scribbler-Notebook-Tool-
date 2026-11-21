import { defaultEditorSettings, type EditorSettings, type Folder, type Library, type Note, type Page } from "./notebooks";

export type BackupPage = Omit<Page, "background"> & { background?: string };
export type BackupNote = Omit<Note, "pages"> & { pages: BackupPage[] };
export type LibraryBackup = {
  format: "scribbler-backup";
  version: 1;
  backupId: string;
  createdAt: string;
  folders: Folder[];
  notes: BackupNote[];
  trash?: Array<{ id: string; deletedAt: number; note: BackupNote }>;
  editorSettings: EditorSettings;
};
export type RestoreChoice = "local" | "backup" | "both";
export type RestorePreview = {
  backup: LibraryBackup;
  additions: number;
  trashAdditions: number;
  exactDuplicates: number;
  exactDuplicateIds: string[];
  conflicts: Array<{ id: string; name: string }>;
};

function bytesToBase64(bytes: Uint8Array) {
  let binary = "";
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return btoa(binary);
}

function base64ToBytes(value: string) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

async function blobToDataUrl(blob: Blob) {
  return `data:${blob.type || "application/octet-stream"};base64,${bytesToBase64(new Uint8Array(await blob.arrayBuffer()))}`;
}

function dataUrlToBlob(value: string) {
  const match = /^data:([^;,]+)?;base64,([\s\S]*)$/.exec(value);
  if (!match) throw new Error("A page image in this backup is invalid.");
  return new Blob([base64ToBytes(match[2])], { type: match[1] || "application/octet-stream" });
}

async function encodeNote(note: Note): Promise<BackupNote> {
  return {
    ...note,
    pages: await Promise.all(note.pages.map(async ({ background, ...page }) => ({
      ...page,
      ...(background ? { background: await blobToDataUrl(background) } : {}),
    }))),
  };
}

async function decodeNote(note: BackupNote): Promise<Note> {
  return {
    ...note,
    pages: note.pages.map(({ background, ...page }) => ({
      ...page,
      ...(background ? { background: dataUrlToBlob(background) } : {}),
    })),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function validateBackup(value: unknown): LibraryBackup {
  if (!isRecord(value) || value.format !== "scribbler-backup" || value.version !== 1 || typeof value.backupId !== "string" ||
    !Array.isArray(value.folders) || !Array.isArray(value.notes) || (value.trash !== undefined && !Array.isArray(value.trash)) || !isRecord(value.editorSettings)) {
    throw new Error("This file is not a supported Scribbler backup.");
  }
  if (!value.folders.every((item) => isRecord(item) && typeof item.id === "string" && typeof item.name === "string" && typeof item.createdAt === "number")) {
    throw new Error("A folder in this backup is invalid.");
  }
  if (!value.notes.every((item) => isRecord(item) && typeof item.id === "string" && typeof item.name === "string" && Array.isArray(item.pages) &&
    item.pages.every((page) => isRecord(page) && typeof page.id === "string" && Array.isArray(page.strokes) && Array.isArray(page.textBoxes) &&
      (page.background === undefined || typeof page.background === "string")))) {
    throw new Error("A note or page in this backup is invalid.");
  }
  if (value.trash && !value.trash.every((entry) => isRecord(entry) && typeof entry.id === "string" && typeof entry.deletedAt === "number" &&
    isRecord(entry.note) && typeof entry.note.id === "string" && typeof entry.note.name === "string" && Array.isArray(entry.note.pages))) {
    throw new Error("A trashed note in this backup is invalid.");
  }
  const settings = { ...defaultEditorSettings, ...value.editorSettings, id: "editor" as const };
  return {
    format: "scribbler-backup",
    version: 1,
    backupId: value.backupId,
    createdAt: typeof value.createdAt === "string" ? value.createdAt : new Date().toISOString(),
    folders: value.folders as Folder[],
    notes: value.notes as BackupNote[],
    trash: (value.trash ?? []) as Array<{ id: string; deletedAt: number; note: BackupNote }>,
    editorSettings: settings,
  };
}

async function canonicalNote(note: Note | BackupNote) {
  const encoded = await Promise.all(note.pages.map(async ({ id: _pageId, ...page }) => {
    const { background, ...content } = page;
    return {
      ...content,
      strokes: page.strokes.map(({ id: _strokeId, ...stroke }) => stroke),
      textBoxes: page.textBoxes.map(({ id: _boxId, ...box }) => box),
      ...(background instanceof Blob ? { background: await blobToDataUrl(background) } : background ? { background } : {}),
    };
  }));
  const { id, restoredFromId, ...content } = note as Note;
  return JSON.stringify({ ...content, id: restoredFromId ?? id, pages: encoded });
}

export async function createLibraryBackup(library: Library, editorSettings: EditorSettings): Promise<Blob> {
  const backup: LibraryBackup = {
    format: "scribbler-backup",
    version: 1,
    backupId: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    folders: library.folders,
    notes: await Promise.all(library.notes.map(encodeNote)),
    trash: await Promise.all(library.trash.map(async (entry) => ({ ...entry, note: await encodeNote(entry.note) }))),
    editorSettings,
  };
  return new Blob([JSON.stringify(backup)], { type: "application/vnd.scribbler.backup+json" });
}

export async function inspectLibraryBackup(file: File, library: Library): Promise<RestorePreview> {
  let decoded: unknown;
  try {
    decoded = JSON.parse(await file.text());
  } catch {
    throw new Error("Couldn’t read this file. Choose a Scribbler backup and try again.");
  }
  const backup = validateBackup(decoded);
  const currentById = new Map(library.notes.map((note) => [note.id, note]));
  const currentTrashById = new Map(library.trash.map((entry) => [entry.id, entry]));
  const conflicts: RestorePreview["conflicts"] = [];
  const exactDuplicateIds: string[] = [];
  let additions = 0;
  let exactDuplicates = 0;
  for (const note of backup.notes) {
    const existing = currentById.get(note.id);
    const archivedCopies = library.notes.filter((candidate) => candidate.restoredFromId === note.id);
    const archivedContent = await canonicalNote(note);
    let matchingCopy = false;
    for (const copy of archivedCopies) {
      if (await canonicalNote(copy) === archivedContent) { matchingCopy = true; break; }
    }
    if (matchingCopy) { exactDuplicates += 1; exactDuplicateIds.push(note.id); continue; }
    if (existing) {
      if (await canonicalNote(existing) === await canonicalNote(note)) { exactDuplicates += 1; exactDuplicateIds.push(note.id); }
      else conflicts.push({ id: note.id, name: note.name });
      continue;
    }
    if (currentTrashById.has(note.id)) {
      conflicts.push({ id: note.id, name: note.name });
      continue;
    }
    if (archivedCopies.length) conflicts.push({ id: note.id, name: note.name });
    else additions += 1;
  }
  const currentTrashIds = new Set(library.trash.map((entry) => entry.id));
  const trashAdditions = (backup.trash ?? []).filter((entry) => !currentTrashIds.has(entry.id) && !currentById.has(entry.id)).length;
  return { backup, additions, trashAdditions, exactDuplicates, exactDuplicateIds, conflicts };
}

function cloneWithNewIds(note: Note): Note {
  return {
    ...note,
    id: crypto.randomUUID(),
    restoredFromId: note.id,
    pages: note.pages.map((page) => ({
      ...page,
      id: crypto.randomUUID(),
      strokes: page.strokes.map((stroke) => ({ ...stroke, id: crypto.randomUUID() })),
      textBoxes: page.textBoxes.map((box) => ({ ...box, id: crypto.randomUUID() })),
    })),
  };
}

export async function restoreLibraryBackup(
  preview: RestorePreview,
  choices: Record<string, RestoreChoice>,
  restoreEditorSettings: boolean,
) {
  const imported = await Promise.all(preview.backup.notes.map(decodeNote));
  const importedTrash = await Promise.all((preview.backup.trash ?? []).map(async (entry) => ({ ...entry, note: await decodeNote(entry.note) })));
  const importedById = new Map(imported.map((note) => [note.id, note]));
  const exactIds = new Set(preview.exactDuplicateIds);
  const conflictIds = new Set(preview.conflicts.map(({ id }) => id));

  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open("scribbler", 3);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  try {
    await new Promise<void>((resolve, reject) => {
      const stores = restoreEditorSettings ? ["folders", "notes", "trash", "settings"] : ["folders", "notes", "trash"];
      const transaction = db.transaction(stores, "readwrite");
      const folderStore = transaction.objectStore("folders");
      const noteStore = transaction.objectStore("notes");
      const trashStore = transaction.objectStore("trash");
      const localFolderIds = new Set<string>();
      const localNoteIds = new Set<string>();
      const localTrashIds = new Set<string>();
      let foldersRead = false;
      let notesRead = false;
      let trashRead = false;
      const writeWhenReady = () => {
        if (!foldersRead || !notesRead || !trashRead) return;
        for (const folder of preview.backup.folders) {
          if (!localFolderIds.has(folder.id)) folderStore.put(folder);
        }
        for (const note of importedById.values()) {
          if (!localNoteIds.has(note.id) && !conflictIds.has(note.id)) {
            noteStore.put(note);
            continue;
          }
          if (exactIds.has(note.id)) continue;
          const choice = choices[note.id];
          if (choice === "backup") {
            noteStore.put(note);
            if (localTrashIds.has(note.id)) trashStore.delete(note.id);
          }
          else if (choice === "both") noteStore.put(cloneWithNewIds(note));
        }
        for (const entry of importedTrash) {
          if (!localNoteIds.has(entry.id) && !importedById.has(entry.id) && !localTrashIds.has(entry.id)) {
            trashStore.put(entry);
            localTrashIds.add(entry.id);
          }
        }
        if (restoreEditorSettings) transaction.objectStore("settings").put({ ...preview.backup.editorSettings, id: "editor" });
      };
      const folderRequest = folderStore.getAllKeys();
      folderRequest.onsuccess = () => { folderRequest.result.forEach((id) => localFolderIds.add(String(id))); foldersRead = true; writeWhenReady(); };
      const noteRequest = noteStore.getAllKeys();
      noteRequest.onsuccess = () => { noteRequest.result.forEach((id) => localNoteIds.add(String(id))); notesRead = true; writeWhenReady(); };
      const trashRequest = trashStore.getAllKeys();
      trashRequest.onsuccess = () => { trashRequest.result.forEach((id) => localTrashIds.add(String(id))); trashRead = true; writeWhenReady(); };
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error ?? new Error("Couldn’t restore this backup."));
      transaction.onabort = () => reject(transaction.error ?? new Error("Couldn’t restore this backup."));
    });
  } finally {
    db.close();
  }
}
