import type { Note } from "./notebooks";

export type NoteSort = "created" | "edited" | "title";

export function visibleNotes(notes: Note[], folderId: string | null, query: string, sort: NoteSort) {
  const search = query.trim().toLocaleLowerCase();
  // Filter first, then sort the new array without changing the stored library.
  return notes.filter((note) => (!folderId || note.folderId === folderId) &&
    note.name.toLocaleLowerCase().includes(search)).sort((a, b) => {
    const order = sort === "title" ? a.name.localeCompare(b.name, undefined, { sensitivity: "base" }) :
      sort === "edited" ? (b.updatedAt ?? b.createdAt) - (a.updatedAt ?? a.createdAt) : b.createdAt - a.createdAt;
    return order || a.id.localeCompare(b.id);
  });
}
