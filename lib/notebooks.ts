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
export type Page = { id: string; strokes: Stroke[] };
export type Note = {
  id: string;
  name: string;
  folderId: string | null;
  paper: PaperType;
  pages: Page[];
  createdAt: number;
};
export type Folder = { id: string; name: string; createdAt: number };
export type Library = { folders: Folder[]; notes: Note[] };

let connection: Promise<IDBDatabase> | undefined;

function database() {
  connection ??= new Promise<IDBDatabase>((resolve, reject) => {
    const open = indexedDB.open("scribbler", 1);
    open.onupgradeneeded = () => {
      open.result.createObjectStore("folders", { keyPath: "id" });
      open.result.createObjectStore("notes", { keyPath: "id" });
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
    notes: notes.sort((a, b) => b.createdAt - a.createdAt),
  };
}

export async function readNote(id: string) {
  const db = await database();
  return read<Note | undefined>(db.transaction("notes").objectStore("notes").get(id));
}

async function write(store: "notes" | "folders", item: Note | Folder) {
  const db = await database();
  return new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(store, "readwrite");
    transaction.oncomplete = () => resolve();
    transaction.onabort = () => reject(transaction.error);
    transaction.objectStore(store).put(item);
  });
}

export function saveNote(note: Note) {
  return write("notes", note);
}

export function saveFolder(folder: Folder) {
  return write("folders", folder);
}

export function newPage(): Page {
  return { id: crypto.randomUUID(), strokes: [] };
}
