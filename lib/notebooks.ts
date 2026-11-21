import { standardPaperSpacing } from "./paper";

export const paperTypes = ["plain", "lined", "graph", "dotted"] as const;
export type PaperType = (typeof paperTypes)[number];
export type Point = { x: number; y: number };
export type Stroke = {
  id: string;
  tool: "pen" | "pencil";
  color: string;
  width: number;
  points: Point[];
};
export type TextBox = {
  id: string; x: number; y: number; width: number; height: number; text: string;
  rotation?: number;
  textScale?: number;
};
export type Page = { id: string; strokes: Stroke[]; textBoxes: TextBox[]; background?: Blob };
export type Note = {
  id: string;
  restoredFromId?: string;
  name: string;
  folderId: string | null;
  paper: PaperType;
  paperSpacing: number;
  pages: Page[];
  createdAt: number;
  updatedAt: number;
};
export type Folder = { id: string; name: string; createdAt: number };
export type DeletedNote = { id: string; deletedAt: number; note: Note };
export type Library = { folders: Folder[]; notes: Note[]; trash: DeletedNote[] };
export type EraserMode = "stroke" | "point";
export type EditorSettings = {
  id: "editor";
  customColors: string[];
  hiddenDefaultColors: string[];
  penWidth: number;
  pencilWidth: number;
  eraserRadius: number;
  eraserMode: EraserMode;
};

export const defaultEditorSettings: EditorSettings = {
  id: "editor", customColors: [], hiddenDefaultColors: [], penWidth: 4, pencilWidth: 2, eraserRadius: 16, eraserMode: "stroke",
};

function normalizeNote(note: Note): Note {
  return {
    ...note,
    paperSpacing: note.paperSpacing ?? standardPaperSpacing,
    updatedAt: note.updatedAt ?? note.createdAt,
    pages: note.pages.map((page) => ({ ...page, textBoxes: page.textBoxes ?? [] })),
  };
}

let connection: Promise<IDBDatabase> | undefined;

function database() {
  connection ??= new Promise<IDBDatabase>((resolve, reject) => {
    const open = indexedDB.open("scribbler", 3);
    open.onupgradeneeded = () => {
      const db = open.result;
      if (!db.objectStoreNames.contains("folders")) db.createObjectStore("folders", { keyPath: "id" });
      if (!db.objectStoreNames.contains("notes")) db.createObjectStore("notes", { keyPath: "id" });
      if (!db.objectStoreNames.contains("settings")) db.createObjectStore("settings", { keyPath: "id" });
      if (!db.objectStoreNames.contains("trash")) db.createObjectStore("trash", { keyPath: "id" });
    };
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const db = open.result;
      db.onversionchange = () => {
        db.close();
        connection = undefined;
      };
      resolve(db);
    };
  }).catch((error) => {
    connection = undefined;
    throw error;
  });
  return connection;
}

function read<T>(request: IDBRequest<T>) {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function readLibrary(): Promise<Library> {
  const db = await database();
  const transaction = db.transaction(["folders", "notes", "trash"], "readonly");
  const [folders, notes, trash] = await Promise.all([
    read<Folder[]>(transaction.objectStore("folders").getAll()),
    read<Note[]>(transaction.objectStore("notes").getAll()),
    read<DeletedNote[]>(transaction.objectStore("trash").getAll()),
  ]);
  return {
    folders: folders.sort((a, b) => a.name.localeCompare(b.name)),
    notes: notes.map(normalizeNote).sort((a, b) => b.createdAt - a.createdAt),
    trash: trash.map((entry) => ({ ...entry, note: normalizeNote(entry.note) })).sort((a, b) => b.deletedAt - a.deletedAt),
  };
}

export async function readNote(id: string) {
  const db = await database();
  const note = await read<Note | undefined>(db.transaction("notes").objectStore("notes").get(id));
  return note ? normalizeNote(note) : undefined;
}

async function write(store: "notes" | "folders" | "settings", item: Note | Folder | EditorSettings) {
  const db = await database();
  return new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(store, "readwrite");
    transaction.oncomplete = () => resolve();
    transaction.onabort = () => reject(transaction.error);
    transaction.objectStore(store).put(item);
  });
}

export function saveNote(note: Note) {
  return write("notes", normalizeNote(note));
}

export async function readEditorSettings(): Promise<EditorSettings> {
  const db = await database();
  const settings = await read<EditorSettings | undefined>(db.transaction("settings").objectStore("settings").get("editor"));
  return { ...defaultEditorSettings, ...settings };
}

export function saveEditorSettings(settings: EditorSettings) {
  return write("settings", settings);
}

export function nextUntitledNoteName(notes: Note[], date = new Date()) {
  const dateKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  const pattern = new RegExp(`^Untitled Note (\\d{3}) ${dateKey}$`);
  const next = notes.reduce((maximum, note) => Math.max(maximum, Number(pattern.exec(note.name)?.[1] ?? 0)), 0) + 1;
  return `Untitled Note ${String(next).padStart(3, "0")} ${dateKey}`;
}

export function saveFolder(folder: Folder) {
  return write("folders", folder);
}

export async function moveNotesToFolder(noteIds: string[], folderId: string | null) {
  const db = await database();
  return new Promise<void>((resolve, reject) => {
    const transaction = db.transaction("notes", "readwrite");
    const store = transaction.objectStore("notes");
    const updatedAt = Date.now();
    for (const id of new Set(noteIds)) {
      const request = store.get(id);
      request.onsuccess = () => {
        if (request.result) store.put({ ...request.result, folderId, updatedAt });
      };
    }
    transaction.oncomplete = () => resolve();
    transaction.onabort = () => reject(transaction.error ?? new Error("Couldn’t move these notes."));
    transaction.onerror = () => reject(transaction.error ?? new Error("Couldn’t move these notes."));
  });
}

export async function deleteFolderAndUnfileNotes(folderId: string) {
  const db = await database();
  return new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(["folders", "notes"], "readwrite");
    const folderStore = transaction.objectStore("folders");
    const noteStore = transaction.objectStore("notes");
    const request = noteStore.getAll();
    request.onsuccess = () => {
      for (const note of request.result as Note[]) {
        if (note.folderId === folderId) noteStore.put({ ...note, folderId: null, updatedAt: Date.now() });
      }
      folderStore.delete(folderId);
    };
    transaction.oncomplete = () => resolve();
    transaction.onabort = () => reject(transaction.error ?? new Error("Couldn’t delete this folder."));
    transaction.onerror = () => reject(transaction.error ?? new Error("Couldn’t delete this folder."));
  });
}

export async function moveNoteToTrash(noteId: string) {
  const db = await database();
  return new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(["notes", "trash"], "readwrite");
    const noteStore = transaction.objectStore("notes");
    const request = noteStore.get(noteId);
    request.onsuccess = () => {
      if (!request.result) { transaction.abort(); return; }
      transaction.objectStore("trash").put({ id: noteId, deletedAt: Date.now(), note: request.result as Note });
      noteStore.delete(noteId);
    };
    transaction.oncomplete = () => resolve();
    transaction.onabort = () => reject(transaction.error ?? new Error("Couldn’t move this note to Trash."));
    transaction.onerror = () => reject(transaction.error ?? new Error("Couldn’t move this note to Trash."));
  });
}

export async function restoreTrashedNote(noteId: string) {
  const db = await database();
  return new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(["notes", "trash"], "readwrite");
    const trashStore = transaction.objectStore("trash");
    const request = trashStore.get(noteId);
    request.onsuccess = () => {
      if (!request.result) { transaction.abort(); return; }
      const entry = request.result as DeletedNote;
      transaction.objectStore("notes").put(entry.note);
      trashStore.delete(noteId);
    };
    transaction.oncomplete = () => resolve();
    transaction.onabort = () => reject(transaction.error ?? new Error("Couldn’t restore this note."));
    transaction.onerror = () => reject(transaction.error ?? new Error("Couldn’t restore this note."));
  });
}

export async function emptyTrash() {
  const db = await database();
  return new Promise<void>((resolve, reject) => {
    const transaction = db.transaction("trash", "readwrite");
    transaction.objectStore("trash").clear();
    transaction.oncomplete = () => resolve();
    transaction.onabort = () => reject(transaction.error ?? new Error("Couldn’t empty Trash."));
    transaction.onerror = () => reject(transaction.error ?? new Error("Couldn’t empty Trash."));
  });
}

export function newPage(): Page {
  return { id: crypto.randomUUID(), strokes: [], textBoxes: [] };
}
