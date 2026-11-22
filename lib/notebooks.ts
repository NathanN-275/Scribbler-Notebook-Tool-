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
  name: string;
  folderId: string | null;
  paper: PaperType;
  paperSpacing: number;
  pages: Page[];
  createdAt: number;
  updatedAt: number;
};
export type Folder = { id: string; name: string; createdAt: number };
export type Library = { folders: Folder[]; notes: Note[] };
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
    const open = indexedDB.open("scribbler", 2);
    open.onupgradeneeded = () => {
      const db = open.result;
      if (!db.objectStoreNames.contains("folders")) db.createObjectStore("folders", { keyPath: "id" });
      if (!db.objectStoreNames.contains("notes")) db.createObjectStore("notes", { keyPath: "id" });
      if (!db.objectStoreNames.contains("settings")) db.createObjectStore("settings", { keyPath: "id" });
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
  const transaction = db.transaction(["folders", "notes"], "readonly");
  const [folders, notes] = await Promise.all([
    read<Folder[]>(transaction.objectStore("folders").getAll()),
    read<Note[]>(transaction.objectStore("notes").getAll()),
  ]);
  return {
    folders: folders.sort((a, b) => a.name.localeCompare(b.name)),
    notes: notes.map(normalizeNote).sort((a, b) => b.createdAt - a.createdAt),
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

export async function moveNote(id: string, folderId: string | null) {
  const db = await database();
  return new Promise<void>((resolve, reject) => {
    // Read and update together so moving a note preserves its latest page content.
    const transaction = db.transaction(["notes", "folders"], "readwrite");
    let failure: Error | undefined;
    transaction.oncomplete = () => resolve();
    transaction.onabort = () => reject(failure ?? transaction.error);
    const notes = transaction.objectStore("notes");
    const request = notes.get(id);
    request.onsuccess = () => {
      const note = request.result as Note | undefined;
      if (!note) {
        failure = new Error("This note no longer exists. Refresh the library.");
        transaction.abort();
        return;
      }
      const update = () => {
        if (note.folderId !== folderId) notes.put({ ...note, folderId, updatedAt: Date.now() });
      };
      if (folderId === null) update();
      else {
        const folder = transaction.objectStore("folders").get(folderId);
        folder.onsuccess = () => {
          if (folder.result) update();
          else {
            failure = new Error("That folder no longer exists. Choose another folder.");
            transaction.abort();
          }
        };
      }
    };
  });
}

export async function renameFolder(id: string, enteredName: string) {
  const name = enteredName.trim();
  if (!name || name.length > 80) throw new Error("Enter a folder name between 1 and 80 characters.");
  const db = await database();
  return new Promise<void>((resolve, reject) => {
    const transaction = db.transaction("folders", "readwrite");
    let failure: Error | undefined;
    transaction.oncomplete = () => resolve();
    transaction.onabort = () => reject(failure ?? transaction.error);
    const folders = transaction.objectStore("folders");
    const request = folders.get(id);
    request.onsuccess = () => {
      const folder = request.result as Folder | undefined;
      if (!folder) {
        failure = new Error("This folder no longer exists. Refresh the library.");
        transaction.abort();
        return;
      }
      // Notes refer to the folder's ID, so only its display name needs to change.
      if (folder.name !== name) folders.put({ ...folder, name });
    };
  });
}

export async function deleteNote(id: string) {
  const db = await database();
  return new Promise<void>((resolve, reject) => {
    const transaction = db.transaction("notes", "readwrite");
    // Report success after the deletion is committed, not just requested.
    transaction.oncomplete = () => resolve();
    transaction.onabort = () => reject(transaction.error);
    transaction.objectStore("notes").delete(id);
  });
}

export function newPage(): Page {
  return { id: crypto.randomUUID(), strokes: [], textBoxes: [] };
}
