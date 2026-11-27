"use client";

import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Archive, BookOpen, Bookmark, ChevronRight, Download, Folder, FolderOpen, FolderPlus, GripVertical, NotebookPen, Pencil, Plus, Search, Sparkles, Tag, Trash2, Upload, X } from "lucide-react";
import { Brand } from "./brand";
import { deleteFolderAndUnfileNotes, emptyTrash, moveNotesToTrash, moveNotesToFolder, newPage, nextUntitledNoteName, readEditorSettings, readLibrary, restoreTrashedNote, saveFolder, saveNote, type Library, type Note, type PaperType, type StudyItem } from "../lib/notebooks";
import { standardPaperSpacing } from "../lib/paper";
import { PaperControls, PaperPreview, paperStyle } from "./paper-controls";
import { createLibraryBackup, inspectLibraryBackup, restoreLibraryBackup, type RestoreChoice, type RestorePreview } from "../lib/backup";
import { downloadBlob } from "../lib/files";

type CreateMode = "folder" | "note";
type LibraryViewMode = "all" | "tags" | "study" | "trash";
type SortMode = "recent" | "name";
type ManageDialog = { kind: "rename-note" | "rename-folder" | "edit-tags"; id: string } | { kind: "delete-notes"; ids: string[] } | { kind: "delete-folder"; id: string } | { kind: "empty-trash" };
type ListedStudyItem = { note: Note; item: StudyItem; pageNumber: number | undefined };

function NoteCardTitle({ name }: { name: string }) {
  const title = useRef<HTMLElement>(null);
  const [truncated, setTruncated] = useState(false);

  useEffect(() => {
    const element = title.current;
    if (!element) return;
    const measure = () => setTruncated(element.scrollWidth > element.clientWidth);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    void document.fonts.ready.then(measure);
    return () => observer.disconnect();
  }, [name]);

  return <div className="note-card-title">
    <strong ref={title}>{name}</strong>
    {truncated && <span className="note-title-tooltip" aria-hidden="true">{name}</span>}
  </div>;
}

export function LibraryView() {
  const router = useRouter();
  const [library, setLibrary] = useState<Library>();
  const [folderId, setFolderId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<LibraryViewMode>("all");
  const [query, setQuery] = useState("");
  const [sortMode, setSortMode] = useState<SortMode>("recent");
  const [bookmarkedOnly, setBookmarkedOnly] = useState(false);
  const [activeStudyTag, setActiveStudyTag] = useState("");
  const [reviewQueue, setReviewQueue] = useState<ListedStudyItem[]>([]);
  const [reviewIndex, setReviewIndex] = useState(0);
  const [reviewRevealed, setReviewRevealed] = useState(false);
  const [reviewTotals, setReviewTotals] = useState({ again: 0, gotIt: 0 });
  const [reviewOpen, setReviewOpen] = useState(false);
  const [selectedNotes, setSelectedNotes] = useState<string[]>([]);
  const [manageDialog, setManageDialog] = useState<ManageDialog>();
  const [manageName, setManageName] = useState("");
  const [manageError, setManageError] = useState("");
  const [manageBusy, setManageBusy] = useState(false);
  const [actionError, setActionError] = useState("");
  const [draggedNoteId, setDraggedNoteId] = useState<string>();
  const [loadError, setLoadError] = useState(false);
  const [request, setRequest] = useState(0);
  const [create, setCreate] = useState<CreateMode>();
  const [paper, setPaper] = useState<PaperType>("lined");
  const [paperSpacing, setPaperSpacing] = useState(standardPaperSpacing);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState(false);
  const [backupError, setBackupError] = useState("");
  const [backupBusy, setBackupBusy] = useState(false);
  const [restorePreview, setRestorePreview] = useState<RestorePreview>();
  const [restoreChoices, setRestoreChoices] = useState<Record<string, RestoreChoice>>({});
  const [restoreSettings, setRestoreSettings] = useState(false);
  const [restoreBusy, setRestoreBusy] = useState(false);
  const [restoreError, setRestoreError] = useState("");
  const dialog = useRef<HTMLDialogElement>(null);
  const restoreDialog = useRef<HTMLDialogElement>(null);
  const restoreInput = useRef<HTMLInputElement>(null);
  const manageDialogRef = useRef<HTMLDialogElement>(null);
  const reviewDialogRef = useRef<HTMLDialogElement>(null);
  const isSubmitting = useRef(false);

  useEffect(() => {
    let active = true;
    readLibrary().then(
      (value) => { if (active) setLibrary(value); },
      () => { if (active) setLoadError(true); },
    );
    return () => { active = false; };
  }, [request]);

  const folder = library?.folders.find((item) => item.id === folderId);
  const search = query.trim().toLocaleLowerCase();
  const filteredFolders = library?.folders.filter((item) => !search || item.name.toLocaleLowerCase().includes(search)) ?? [];
  const matchingNotes = (library?.notes ?? []).filter((note) => !search || [note.name, ...(note.tags ?? []), ...(note.studyItems ?? []).flatMap((item) => [item.prompt, item.answer])].some((text) => text.toLocaleLowerCase().includes(search)));
  const notes = (matchingNotes.filter((note) => folder ? note.folderId === folder.id : true))
    .filter((note) => !bookmarkedOnly || note.bookmarked)
    .sort(sortMode === "name" ? (a, b) => a.name.localeCompare(b.name) : (a, b) => b.updatedAt - a.updatedAt);
  const trashedNotes = (library?.trash ?? []).filter((entry) => !search || entry.note.name.toLocaleLowerCase().includes(search));
  const allTags = [...new Set((library?.notes ?? []).flatMap((note) => note.tags ?? []))].sort((a, b) => a.localeCompare(b));
  const visibleTags = allTags.filter((tag) => !search || tag.toLocaleLowerCase().includes(search));
  const taggedNotes = (library?.notes ?? []).filter((note) => (note.tags?.length ?? 0) > 0 && (!activeStudyTag || note.tags?.includes(activeStudyTag)) &&
    (!search || note.name.toLocaleLowerCase().includes(search) || note.tags?.some((tag) => tag.toLocaleLowerCase().includes(search))));
  const studyItems: ListedStudyItem[] = (library?.notes ?? []).flatMap((note) => (note.studyItems ?? []).map((item) => ({
    note, item, pageNumber: note.pages.findIndex((page) => page.id === item.pageId) + 1 || undefined,
  }))).filter(({ note, item }) => !search || [note.name, ...(note.tags ?? []), item.prompt, item.answer].some((text) => text.toLocaleLowerCase().includes(search)));

  function openView(mode: LibraryViewMode) {
    setViewMode(mode);
    setFolderId(null);
    setSelectedNotes([]);
    if (mode !== "tags") setActiveStudyTag("");
  }

  async function refreshLibrary() {
    setLibrary(await readLibrary());
    setSelectedNotes([]);
  }

  async function moveNotes(noteIds: string[], targetFolderId: string | null) {
    if (!library || !noteIds.length) return;
    try {
      await moveNotesToFolder(noteIds, targetFolderId);
      await refreshLibrary();
      setActionError("");
    } catch {
      setActionError("Couldn’t move the selected notes. Check browser storage and try again.");
    }
  }

  function noteDropTarget(targetFolderId: string | null) {
    return {
      onDragOver: (event: React.DragEvent) => { event.preventDefault(); event.dataTransfer.dropEffect = "move"; },
      onDrop: (event: React.DragEvent) => {
        event.preventDefault();
        const id = event.dataTransfer.getData("text/plain") || draggedNoteId;
        setDraggedNoteId(undefined);
        if (id) void moveNotes([id], targetFolderId);
      },
    };
  }

  function openManage(item: ManageDialog) {
    setManageError("");
    if (item.kind === "rename-note") setManageName(library?.notes.find((note) => note.id === item.id)?.name ?? "");
    else if (item.kind === "rename-folder") setManageName(library?.folders.find((candidate) => candidate.id === item.id)?.name ?? "");
    else if (item.kind === "edit-tags") setManageName(library?.notes.find((note) => note.id === item.id)?.tags?.join(", ") ?? "");
    setManageDialog(item);
  }

  function appendTagSuggestion(tag: string) {
    const tags = manageName.split(",").map((value) => value.trim()).filter(Boolean);
    if (!tags.includes(tag)) tags.push(tag);
    setManageName(tags.join(", "));
  }

  useEffect(() => {
    if (!manageDialog || !manageDialogRef.current || manageDialogRef.current.open) return;
    manageDialogRef.current.showModal();
    manageDialogRef.current.querySelector<HTMLInputElement>("input[name=managed-name]")?.focus();
  }, [manageDialog]);

  useEffect(() => {
    if (reviewOpen && reviewDialogRef.current && !reviewDialogRef.current.open) reviewDialogRef.current.showModal();
  }, [reviewOpen]);

  function toggleBookmark(note: Note) {
    const updated = { ...note, bookmarked: !note.bookmarked, updatedAt: Date.now() };
    void saveNote(updated).then(() => setLibrary((current) => current && ({ ...current, notes: current.notes.map((item) => item.id === note.id ? updated : item) })), () => setActionError("Couldn’t save this bookmark. Check browser storage and try again."));
  }

  function startReview(items = studyItems) {
    setReviewQueue(items);
    setReviewIndex(0);
    setReviewRevealed(false);
    setReviewTotals({ again: 0, gotIt: 0 });
    setReviewOpen(true);
  }

  async function markReviewed(result: "again" | "gotIt") {
    const entry = reviewQueue[reviewIndex];
    if (!entry) return;
    const currentNote = library?.notes.find((note) => note.id === entry.note.id) ?? entry.note;
    const currentItem = currentNote.studyItems?.find((item) => item.id === entry.item.id) ?? entry.item;
    const item = { ...currentItem, againCount: (currentItem.againCount ?? 0) + (result === "again" ? 1 : 0), gotItCount: (currentItem.gotItCount ?? 0) + (result === "gotIt" ? 1 : 0), lastReviewedAt: Date.now() };
    const updated = { ...currentNote, studyItems: (currentNote.studyItems ?? []).map((current) => current.id === item.id ? item : current) };
    try {
      await saveNote(updated);
      setLibrary((current) => current && ({ ...current, notes: current.notes.map((note) => note.id === updated.id ? updated : note) }));
      setReviewTotals((current) => ({ ...current, [result]: current[result] + 1 }));
      setReviewIndex((current) => current + 1);
      setReviewRevealed(false);
    } catch {
      setActionError("Couldn’t save this review. Check browser storage and try again.");
    }
  }

  async function submitManage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!manageDialog || !library || manageBusy) return;
    setManageBusy(true);
    setManageError("");
    try {
      if (manageDialog.kind === "rename-note") {
        const note = library.notes.find((item) => item.id === manageDialog.id);
        const name = manageName.trim();
        if (!note || !name) { setManageError("Enter a name."); return; }
        await saveNote({ ...note, name, updatedAt: Date.now() });
      } else if (manageDialog.kind === "rename-folder") {
        const item = library.folders.find((candidate) => candidate.id === manageDialog.id);
        const name = manageName.trim();
        if (!item || !name) { setManageError("Enter a name."); return; }
        await saveFolder({ ...item, name });
      } else if (manageDialog.kind === "edit-tags") {
        const note = library.notes.find((item) => item.id === manageDialog.id);
        if (!note) return;
        const tags = [...new Set(manageName.split(",").map((tag) => tag.trim()).filter(Boolean))];
        await saveNote({ ...note, tags, updatedAt: Date.now() });
      } else if (manageDialog.kind === "delete-notes") await moveNotesToTrash(manageDialog.ids);
      else if (manageDialog.kind === "delete-folder") {
        await deleteFolderAndUnfileNotes(manageDialog.id);
        if (folderId === manageDialog.id) setFolderId(null);
      } else if (manageDialog.kind === "empty-trash") await emptyTrash();
      await refreshLibrary();
      manageDialogRef.current?.close();
      setActionError("");
    } catch {
      setManageError("Couldn’t save this change. Check browser storage and try again.");
    } finally {
      setManageBusy(false);
    }
  }

  async function restoreNote(id: string) {
    try { await restoreTrashedNote(id); await refreshLibrary(); setActionError(""); }
    catch { setActionError("Couldn’t restore this note. Check browser storage and try again."); }
  }

  async function removeStudyItem(noteId: string, itemId: string) {
    const note = library?.notes.find((item) => item.id === noteId);
    if (!note) return;
    const updated = { ...note, studyItems: (note.studyItems ?? []).filter((item) => item.id !== itemId), updatedAt: Date.now() };
    try {
      await saveNote(updated);
      setLibrary((current) => current && ({ ...current, notes: current.notes.map((item) => item.id === noteId ? updated : item) }));
      setActionError("");
    } catch {
      setActionError("Couldn’t remove this study item. Check browser storage and try again.");
    }
  }

  function showCreate(mode: CreateMode) {
    setCreateError(false);
    setPaper("lined");
    setPaperSpacing(standardPaperSpacing);
    setCreate(mode);
  }

  useEffect(() => {
    if (!create || !dialog.current || dialog.current.open) return;
    dialog.current.showModal();
    dialog.current.querySelector<HTMLInputElement>('input[name="name"]')?.focus();
  }, [create]);

  useEffect(() => {
    if (!restorePreview || !restoreDialog.current || restoreDialog.current.open) return;
    restoreDialog.current.showModal();
    restoreDialog.current.querySelector<HTMLInputElement>("input[type=radio]")?.focus();
  }, [restorePreview]);

  async function createBackup() {
    if (backupBusy || !library) return;
    setBackupBusy(true);
    setBackupError("");
    try {
      const settings = await readEditorSettings();
      const blob = await createLibraryBackup(library, settings);
      const date = new Date().toISOString().slice(0, 10);
      downloadBlob(blob, `scribbler-backup-${date}.scribbler`);
    } catch {
      setBackupError("Couldn’t create the backup. Check that browser storage is available and try again.");
    } finally {
      setBackupBusy(false);
    }
  }

  async function inspectRestoreFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    if (!file || !library) return;
    setBackupError("");
    setRestoreError("");
    try {
      const preview = await inspectLibraryBackup(file, library);
      setRestoreChoices({});
      setRestoreSettings(false);
      setRestorePreview(preview);
    } catch (error) {
      setBackupError(error instanceof Error ? error.message : "Couldn’t read this backup.");
    }
  }

  async function confirmRestore() {
    if (!restorePreview || restoreBusy || restorePreview.conflicts.some(({ id }) => !restoreChoices[id])) return;
    setRestoreBusy(true);
    setRestoreError("");
    try {
      await restoreLibraryBackup(restorePreview, restoreChoices, restoreSettings);
      const updated = await readLibrary();
      setLibrary(updated);
      restoreDialog.current?.close();
      setRestorePreview(undefined);
    } catch {
      setRestoreError("Couldn’t restore this backup. Check available browser storage and try again.");
    } finally {
      setRestoreBusy(false);
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!create || isSubmitting.current) return;
    const form = new FormData(event.currentTarget);
    const enteredName = (form.get("name") as string).trim();
    if (create === "folder" && !enteredName) {
      const input = event.currentTarget.elements.namedItem("name") as HTMLInputElement;
      input.setCustomValidity("Enter a name.");
      input.reportValidity();
      return;
    }
    isSubmitting.current = true;
    setCreating(true);
    setCreateError(false);
    const createdAt = Date.now();
    const name = enteredName || nextUntitledNoteName(library?.notes ?? [], new Date(createdAt));
    const item = { id: crypto.randomUUID(), name, createdAt };
    try {
      if (create === "folder") {
        await saveFolder(item);
        setLibrary((previous) => previous && ({
          ...previous,
          folders: [...previous.folders, item].sort((a, b) => a.name.localeCompare(b.name)),
        }));
      } else {
        await saveNote({ ...item, updatedAt: createdAt, folderId: (form.get("folderId") as string) || null, paper, paperSpacing, pages: [newPage()] });
        router.push(`/notes/${item.id}`);
      }
      dialog.current?.close();
    } catch {
      setCreateError(true);
    } finally {
      isSubmitting.current = false;
      setCreating(false);
    }
  }

  const reviewItem = reviewQueue[reviewIndex];
  return (
    <div className="library-shell">
      <header className="site-header library-header">
        <Brand />
        <span className="local-caption"><span /> Stored in this browser</span>
      </header>
      <div className="library-layout">
        <aside className="library-sidebar">
          <nav aria-label="Library folders">
            <button className={viewMode === "all" && !folder ? "sidebar-link current" : "sidebar-link"} onClick={() => openView("all")} aria-current={viewMode === "all" && !folder ? "page" : undefined}>
              <BookOpen size={19} /> All notes
            </button>
            <button className={viewMode === "tags" ? "sidebar-link current" : "sidebar-link"} onClick={() => openView("tags")} aria-current={viewMode === "tags" ? "page" : undefined}>
              <Tag size={18} /> Study tags
            </button>
            <button className={viewMode === "study" ? "sidebar-link current" : "sidebar-link"} onClick={() => openView("study")} aria-current={viewMode === "study" ? "page" : undefined}>
              <NotebookPen size={18} /> Study material
            </button>
            <button className={viewMode === "trash" ? "sidebar-link current" : "sidebar-link"} onClick={() => openView("trash")} aria-current={viewMode === "trash" ? "page" : undefined}>
              <Trash2 size={18} /> Trash {library?.trash.length ? `(${library.trash.length})` : ""}
            </button>
            <div className="sidebar-heading"><span>Folders</span>
              <button type="button" className="icon-button" aria-label="Create folder" title="Create folder" disabled={!library} onClick={() => showCreate("folder")}><Plus size={17} /></button>
            </div>
            {library?.folders.map((item) => (
              <div className="sidebar-folder" key={item.id} {...noteDropTarget(item.id)}>
                <button className={viewMode === "all" && folderId === item.id ? "sidebar-link current" : "sidebar-link"} onClick={() => { setViewMode("all"); setFolderId(item.id); }} aria-current={folderId === item.id ? "page" : undefined}>
                  <Folder size={18} /><span>{item.name}</span>
                </button>
                <button type="button" className="icon-button sidebar-folder-edit" aria-label={`Manage folder ${item.name}`} title={`Manage ${item.name}`} onClick={() => openManage({ kind: "rename-folder", id: item.id })}><Pencil size={14} /></button>
                <button type="button" className="icon-button sidebar-folder-edit" aria-label={`Delete folder ${item.name}`} title={`Delete ${item.name}`} onClick={() => openManage({ kind: "delete-folder", id: item.id })}><Trash2 size={14} /></button>
              </div>
            ))}
          </nav>
        </aside>
        <main className="library-main">
          <div className="library-topline">
            {folder && <div className="breadcrumbs"><button onClick={() => setFolderId(null)}>Library</button><ChevronRight size={14} /><span>Folder</span></div>}
          </div>
          <div className="library-title">
            <div><h1>{folder?.name ?? (viewMode === "tags" ? "Study tags" : viewMode === "study" ? "Study material" : viewMode === "trash" ? "Trash" : "Your library")}</h1><p>{folder ? "Notes in this folder." : viewMode === "trash" ? "Deleted notes stay here until you empty Trash." : "Create, organize, and revisit your notes."}</p></div>
            <div className="library-actions">
              <button className="button button-outline" disabled={!library || backupBusy} onClick={() => void createBackup()}>
                <Download size={18} /> {backupBusy ? "Preparing…" : "Back up"}
              </button>
              <button className="button button-outline" disabled={!library || backupBusy} onClick={() => restoreInput.current?.click()}>
                <Upload size={18} /> Restore
              </button>
              <input ref={restoreInput} className="backup-input" type="file" accept=".scribbler,application/json" aria-label="Choose a Scribbler backup" onChange={(event) => void inspectRestoreFile(event)} />
              {viewMode === "trash" && library?.trash.length ? <button className="button button-outline" onClick={() => openManage({ kind: "empty-trash" })}><Trash2 size={17} /> Empty Trash</button> : null}
              {viewMode === "all" && !folder && <button className="button button-outline" disabled={!library} onClick={() => showCreate("folder")}><FolderPlus size={18} /> New folder</button>}
              {viewMode === "all" && <button className="button button-primary" disabled={!library} onClick={() => showCreate("note")}><Plus size={18} /> New note</button>}
            </div>
          </div>
          {backupError && <p className="error-text library-backup-error" role="alert">{backupError}</p>}
          {actionError && <p className="error-text library-backup-error" role="alert">{actionError}</p>}
          {loadError ? (
            <div className="state-box" role="alert"><p>Couldn’t open your library. Make sure browser storage is available.</p>
              <button className="button button-outline" onClick={() => { setLoadError(false); setRequest(request + 1); }}>Retry</button>
            </div>
          ) : !library ? <p role="status">Loading your library…</p> : (
            <>
              <div className="library-browser-controls">
                <nav className="library-view-tabs" aria-label="Library views">
                  {([ ["all", "All notes"], ["tags", "Study tags"], ["study", "Study material"], ["trash", "Trash"] ] as const).map(([mode, label]) => <button type="button" key={mode} className={viewMode === mode ? "library-view-tab current" : "library-view-tab"} aria-current={viewMode === mode ? "page" : undefined} onClick={() => openView(mode)}>{label}{mode === "trash" && library.trash.length ? ` (${library.trash.length})` : ""}</button>)}
                </nav>
                <label className="library-search"><Search size={17} /><span className="sr-only">Search this view</span><input type="search" value={query} placeholder={viewMode === "study" ? "Search study material" : viewMode === "tags" ? "Search study tags" : "Search notes and folders"} onChange={(event) => setQuery(event.currentTarget.value)} /></label>
                {viewMode === "all" && <label className="library-sort">Sort
                  <select value={sortMode} onChange={(event) => setSortMode(event.currentTarget.value as SortMode)} aria-label="Sort notes">
                    <option value="recent">Recently updated</option><option value="name">Name A–Z</option>
                  </select>
                </label>}
                {viewMode === "all" && <label className="bookmark-filter"><input type="checkbox" checked={bookmarkedOnly} onChange={(event) => setBookmarkedOnly(event.currentTarget.checked)} /> Bookmarked</label>}
              </div>
              {viewMode === "all" && selectedNotes.length > 0 && <div className="bulk-note-actions" role="group" aria-label="Selected note actions">
                <span>{selectedNotes.length} selected</span>
                <label>Move to <select aria-label="Move selected notes to folder" value="" onChange={(event) => { if (event.currentTarget.value === "__unfiled") void moveNotes(selectedNotes, null); else if (event.currentTarget.value) void moveNotes(selectedNotes, event.currentTarget.value); }}>
                  <option value="" disabled>Choose folder</option><option value="__unfiled">No folder</option>{library.folders.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}
                </select></label>
                <button type="button" className="button button-outline" onClick={() => setSelectedNotes([])}>Clear selection</button>
                <button type="button" className="button button-primary danger-button bulk-note-delete"
                  onClick={() => openManage({ kind: "delete-notes", ids: selectedNotes })}><Trash2 size={16} /> Delete</button>
              </div>}
              {viewMode === "all" && !folder && filteredFolders.length > 0 && (
                <section className="library-section" aria-labelledby="folders-heading">
                  <h2 id="folders-heading">Folders</h2>
                  <div className="folder-grid">
                    {filteredFolders.map((item) => <div key={item.id} className="folder-card-wrap" {...noteDropTarget(item.id)}>
                      <button className="folder-card" onClick={() => setFolderId(item.id)}>
                        <FolderOpen size={22} /><span>{item.name}</span><ChevronRight size={16} />
                      </button>
                      <button type="button" className="icon-button" aria-label={`Rename folder ${item.name}`} title="Rename folder" onClick={() => openManage({ kind: "rename-folder", id: item.id })}><Pencil size={15} /></button>
                    </div>)}
                  </div>
                </section>
              )}
              {viewMode === "all" && <section className="library-section" aria-labelledby="notes-heading">
                <div className="library-section-heading"><h2 id="notes-heading">{folder ? "Notes" : "All notes"}</h2>{folder && <button type="button" className="button button-outline" onClick={() => openManage({ kind: "delete-folder", id: folder.id })}>Delete folder</button>}</div>
                {notes.length ? <div className="note-grid">
                  {notes.map((note) => <article className="note-card" key={note.id} draggable onDragStart={(event) => { event.dataTransfer.effectAllowed = "move"; event.dataTransfer.setData("text/plain", note.id); setDraggedNoteId(note.id); }} onDragEnd={() => setDraggedNoteId(undefined)}>
                    <label className="note-select"><input type="checkbox" checked={selectedNotes.includes(note.id)} aria-label={`Select ${note.name}`} onChange={(event) => { const checked = event.currentTarget.checked; setSelectedNotes((current) => checked ? [...current, note.id] : current.filter((id) => id !== note.id)); }} /></label>
                    <span className="note-drag-handle" aria-hidden="true"><GripVertical size={16} /></span>
                    <button type="button" className={note.bookmarked ? "note-bookmark saved" : "note-bookmark"} aria-label={note.bookmarked ? `Remove bookmark from ${note.name}` : `Bookmark ${note.name}`} aria-pressed={!!note.bookmarked} title={note.bookmarked ? "Remove bookmark" : "Bookmark note"} onClick={() => toggleBookmark(note)}><Bookmark size={16} fill={note.bookmarked ? "currentColor" : "none"} /></button>
                    <Link className="note-card-link" href={`/notes/${note.id}`}>
                      <div className="note-cover"><div className={`paper-sample ${note.paper}`} style={paperStyle(note.paperSpacing)}><NotebookPen size={26} /></div></div>
                      <div className="note-info"><NoteCardTitle name={note.name} /><span>{note.paper} · {note.pages.length} {note.pages.length === 1 ? "page" : "pages"}</span>{note.tags?.length ? <span className="note-tag-list">{note.tags.map((tag) => <span className="note-tag" key={tag}>{tag}</span>)}</span> : null}</div>
                    </Link>
                    <div className="note-card-actions">
                      <button type="button" className="icon-button" aria-label={`Rename note ${note.name}`} title="Rename" onClick={() => openManage({ kind: "rename-note", id: note.id })}><Pencil size={15} /></button>
                      <button type="button" className="icon-button" aria-label={`Edit study tags for ${note.name}`} title="Study tags" onClick={() => openManage({ kind: "edit-tags", id: note.id })}><Tag size={15} /></button>
                      <label className="note-move"><select aria-label={`Move ${note.name}`} value={note.folderId ?? "__unfiled"} onChange={(event) => void moveNotes([note.id], event.currentTarget.value === "__unfiled" ? null : event.currentTarget.value)}><option value="__unfiled">No folder</option>{library.folders.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label>
                      <button type="button" className="icon-button note-delete" aria-label={`Delete note ${note.name}`} title="Move to Trash" onClick={() => openManage({ kind: "delete-notes", ids: [note.id] })}><Trash2 size={15} /></button>
                    </div>
                  </article>)}
                </div> : <div className="empty-library">
                  <span className="empty-icon"><NotebookPen size={30} /></span><h3>{search ? "No matching notes" : "No notes yet"}</h3>
                  <p>{search ? "Try another search or clear the search field." : "Start with a blank page and make it yours."}</p>
                  {!search && <button className="button button-primary" onClick={() => showCreate("note")}><Plus size={18} /> Create a note</button>}
                </div>}
              </section>}
              {viewMode === "tags" && <section className="library-section" aria-labelledby="tags-heading"><h2 id="tags-heading">Tags across your notes</h2>
                {visibleTags.length || taggedNotes.length ? <>
                  {visibleTags.length > 0 && <div className="study-tag-filters">{visibleTags.map((tag) => <button type="button" key={tag} className={activeStudyTag === tag ? "study-tag-filter current" : "study-tag-filter"} aria-pressed={activeStudyTag === tag} onClick={() => setActiveStudyTag((current) => current === tag ? "" : tag)}>{tag}<span>{library.notes.filter((note) => note.tags?.includes(tag)).length}</span></button>)}</div>}
                  {taggedNotes.length > 0 && <div className="note-grid study-tag-notes">{taggedNotes.map((note) => <Link className="study-source-card" key={note.id} href={`/notes/${note.id}`}><strong>{note.name}</strong><span>{note.tags?.map((tag) => `#${tag}`).join(" · ")}</span></Link>)}</div>}
                </> : <div className="empty-library"><span className="empty-icon"><Tag size={30} /></span><h3>{search ? "No matching tags or notes" : "No study tags yet"}</h3><p>Add tags to notes with the tag button in All notes.</p></div>}
              </section>}
              {viewMode === "study" && <section className="library-section" aria-labelledby="study-heading"><div className="library-section-heading"><h2 id="study-heading">Study material</h2><button type="button" className="button button-primary" disabled={!studyItems.length} onClick={() => startReview()}><Sparkles size={16} /> Review material</button></div>
                {studyItems.length ? <div className="study-material-list">{studyItems.map(({ note, item, pageNumber }) => <article className="study-material-card" key={item.id}>
                  <div className="study-material-meta"><span>{item.type === "flashcard" ? "Flashcard" : "Practice question"}</span><span>{note.name}</span><span>{pageNumber ? `Page ${pageNumber}` : "Source page deleted"}</span></div>
                  <p>{item.prompt}</p>{pageNumber ? <Link href={`/notes/${note.id}?page=${encodeURIComponent(item.pageId)}`}>Open source page</Link> : <Link href={`/notes/${note.id}`}>Open note</Link>}
                  <div className="study-history">Again {item.againCount ?? 0} · Got it {item.gotItCount ?? 0}{item.lastReviewedAt ? ` · Reviewed ${new Date(item.lastReviewedAt).toLocaleDateString()}` : ""}</div>
                  <button type="button" className="study-item-remove" aria-label={`Remove study item from ${note.name}`} onClick={() => void removeStudyItem(note.id, item.id)}>Remove item</button>
                </article>)}</div> : <div className="empty-library"><span className="empty-icon"><NotebookPen size={30} /></span><h3>{search ? "No matching study material" : "No study material yet"}</h3><p>Open a note page and add a flashcard or practice question.</p></div>}
              </section>}
              {viewMode === "trash" && <section className="library-section" aria-labelledby="trash-heading"><h2 id="trash-heading">Deleted notes</h2>{trashedNotes.length ? <div className="note-grid">{trashedNotes.map((entry) => <article className="trash-note-card" key={entry.id}><div><strong>{entry.note.name}</strong><span>Deleted {new Date(entry.deletedAt).toLocaleDateString()}</span></div><button type="button" className="button button-outline" onClick={() => void restoreNote(entry.id)}>Restore</button></article>)}</div> : <div className="empty-library"><span className="empty-icon"><Trash2 size={30} /></span><h3>Trash is empty</h3><p>Notes you delete will stay here until you empty Trash.</p></div>}</section>}
            </>
          )}
        </main>
      </div>
      <dialog ref={dialog} className={create === "note" ? "create-dialog create-note-dialog" : "create-dialog"} aria-labelledby="create-title" onClose={() => setCreate(undefined)} onCancel={(event) => { if (creating) event.preventDefault(); }}>
        {create && <form onSubmit={submit}>
          <div className="dialog-header">
            <h2 id="create-title">New {create}</h2>
            <button type="button" className="icon-button" aria-label="Close" disabled={creating} onClick={() => dialog.current?.close()}><X size={21} /></button>
          </div>
          {create === "folder" ? <label className="field">Folder name
            <input name="name" placeholder="e.g. Calculus" required maxLength={80} onInput={(event) => event.currentTarget.setCustomValidity("")} />
          </label> : <div className="create-note-layout">
            <div className="create-note-options">
              <label className="field">Note name <span className="optional-label">(optional)</span>
                <input name="name" placeholder="Untitled Note" maxLength={80} onInput={(event) => event.currentTarget.setCustomValidity("")} />
              </label>
              <label className="field">Folder
                <select name="folderId" defaultValue={folder?.id ?? ""}>
                  <option value="">No folder</option>
                  {library?.folders.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                </select>
              </label>
              <PaperControls paper={paper} spacing={paperSpacing} onPaperChange={setPaper} onSpacingChange={setPaperSpacing} />
            </div>
            <PaperPreview paper={paper} spacing={paperSpacing} />
          </div>}
          {createError && <p className="error-text" role="alert">Couldn’t save this {create}. Try again.</p>}
          <div className="dialog-actions">
            <button type="button" className="button button-outline" disabled={creating} onClick={() => dialog.current?.close()}>Cancel</button>
            <button className="button button-primary" disabled={creating}>{creating ? "Creating…" : `Create ${create}`}</button>
          </div>
        </form>}
      </dialog>
      <dialog ref={manageDialogRef} className="create-dialog" aria-labelledby="manage-title" onClose={() => { if (!manageBusy) { setManageDialog(undefined); setManageError(""); } }} onCancel={(event) => { if (manageBusy) event.preventDefault(); }}>
        {manageDialog && <form onSubmit={(event) => void submitManage(event)}>
          <div className="dialog-header"><h2 id="manage-title">{manageDialog.kind === "rename-note" ? "Rename note" : manageDialog.kind === "rename-folder" ? "Rename folder" : manageDialog.kind === "edit-tags" ? "Edit study tags" : manageDialog.kind === "delete-notes" ? `Move ${manageDialog.ids.length} ${manageDialog.ids.length === 1 ? "note" : "notes"} to Trash?` : manageDialog.kind === "delete-folder" ? "Delete folder?" : "Empty Trash?"}</h2>
            <button type="button" className="icon-button" aria-label="Close" disabled={manageBusy} onClick={() => manageDialogRef.current?.close()}><X size={21} /></button></div>
          {(manageDialog.kind === "rename-note" || manageDialog.kind === "rename-folder" || manageDialog.kind === "edit-tags") ? <>
            <label className="field">{manageDialog.kind === "edit-tags" ? "Tags, separated by commas" : "Name"}
              <input name="managed-name" value={manageName} maxLength={manageDialog.kind === "edit-tags" ? 400 : 80} required={manageDialog.kind !== "edit-tags"} onChange={(event) => setManageName(event.currentTarget.value)} />
            </label>
            {manageDialog.kind === "edit-tags" && <div className="tag-suggestion-list"><span>Suggestions</span>{allTags.filter((tag) => !manageName.split(",").map((value) => value.trim()).includes(tag)).map((tag) => <button type="button" key={tag} onClick={() => appendTagSuggestion(tag)}>{tag}</button>)}</div>}
          </> : <p>{manageDialog.kind === "delete-notes" ? "You can restore these notes and their imported pages from Trash until you empty it." : manageDialog.kind === "delete-folder" ? "Notes in this folder will be moved to All notes. The folder will be removed." : "This permanently removes all notes in Trash, including their imported pages. This cannot be undone."}</p>}
          {manageError && <p className="error-text" role="alert">{manageError}</p>}
          <div className="dialog-actions"><button type="button" className="button button-outline" disabled={manageBusy} onClick={() => manageDialogRef.current?.close()}>Cancel</button>
            <button className={manageDialog.kind === "delete-notes" || manageDialog.kind === "delete-folder" || manageDialog.kind === "empty-trash" ? "button button-primary danger-button" : "button button-primary"} disabled={manageBusy}>{manageBusy ? "Saving…" : manageDialog.kind === "rename-note" || manageDialog.kind === "rename-folder" || manageDialog.kind === "edit-tags" ? "Save" : manageDialog.kind === "delete-notes" ? "Move to Trash" : manageDialog.kind === "delete-folder" ? "Delete folder" : "Empty Trash"}</button></div>
        </form>}
      </dialog>
      <dialog ref={reviewDialogRef} className="create-dialog review-dialog" aria-labelledby="review-title" onClose={() => setReviewOpen(false)}>
        <div className="dialog-header"><div><h2 id="review-title">{reviewItem ? "Review material" : "Review complete"}</h2>{reviewItem && <p>{reviewIndex + 1} of {reviewQueue.length}</p>}</div>
          <button type="button" className="icon-button" aria-label="Close review" onClick={() => reviewDialogRef.current?.close()}><X size={21} /></button></div>
        {reviewItem ? <div className="review-card">
          <div className="study-material-meta"><span>{reviewItem.item.type === "flashcard" ? "Flashcard" : "Practice question"}</span><span>{reviewItem.note.name}</span><span>{reviewItem.pageNumber ? `Page ${reviewItem.pageNumber}` : "Source page deleted"}</span></div>
          <h3>{reviewItem.item.prompt}</h3>
          {reviewRevealed ? <div className="review-answer" aria-live="polite"><span>{reviewItem.item.type === "flashcard" ? "Back" : "Answer"}</span><p>{reviewItem.item.answer}</p></div> : <button type="button" className="button button-outline" onClick={() => setReviewRevealed(true)}>Reveal answer</button>}
          {reviewRevealed && <div className="review-rating"><button type="button" className="button button-outline" onClick={() => void markReviewed("again")}>Again</button><button type="button" className="button button-primary" onClick={() => void markReviewed("gotIt")}>Got it</button></div>}
          {reviewItem.pageNumber ? <Link href={`/notes/${reviewItem.note.id}?page=${encodeURIComponent(reviewItem.item.pageId)}`}>Open source page</Link> : <Link href={`/notes/${reviewItem.note.id}`}>Open note</Link>}
        </div> : <div className="review-complete" role="status"><p>Again: {reviewTotals.again} · Got it: {reviewTotals.gotIt}</p><button type="button" className="button button-primary" onClick={() => reviewDialogRef.current?.close()}>Done</button></div>}
      </dialog>
      <dialog ref={restoreDialog} className="create-dialog restore-dialog" aria-labelledby="restore-title" onClose={() => { if (!restoreBusy) { setRestorePreview(undefined); setRestoreChoices({}); setRestoreError(""); } }} onCancel={(event) => { if (restoreBusy) event.preventDefault(); }}>
        {restorePreview && <div>
          <div className="dialog-header"><div><h2 id="restore-title">Restore backup</h2><p>Review what will be added before it reaches your library.</p></div>
            <button type="button" className="icon-button" aria-label="Close" disabled={restoreBusy} onClick={() => restoreDialog.current?.close()}><X size={21} /></button></div>
          <div className="restore-summary" role="status">
            <Archive size={19} />
            <span>{restorePreview.additions} {restorePreview.additions === 1 ? "new note" : "new notes"} · {restorePreview.trashAdditions} Trash {restorePreview.trashAdditions === 1 ? "item" : "items"} to add · {restorePreview.exactDuplicates} already in this library · {restorePreview.conflicts.length} {restorePreview.conflicts.length === 1 ? "conflict" : "conflicts"}</span>
          </div>
          {restorePreview.conflicts.length > 0 && <fieldset className="restore-conflicts">
            <legend>Choose what to do with each note that has changed</legend>
            {restorePreview.conflicts.map(({ id, name }) => <fieldset className="restore-conflict" key={id}>
              <legend>{name}</legend>
              <div className="restore-choice-list">
                {([ ["local", "Keep local"], ["backup", "Replace with backup"], ["both", "Keep both"] ] as const).map(([choice, label]) => <label key={choice}>
                  <input type="radio" name={`conflict-${id}`} value={choice} checked={restoreChoices[id] === choice} disabled={restoreBusy} onChange={() => setRestoreChoices((current) => ({ ...current, [id]: choice }))} /> {label}
                </label>)}
              </div>
            </fieldset>)}
          </fieldset>}
          <label className="restore-settings"><input type="checkbox" checked={restoreSettings} disabled={restoreBusy} onChange={(event) => setRestoreSettings(event.currentTarget.checked)} /> Also restore editor settings from this backup</label>
          {restoreError && <p className="error-text" role="alert">{restoreError}</p>}
          <div className="dialog-actions"><button type="button" className="button button-outline" disabled={restoreBusy} onClick={() => restoreDialog.current?.close()}>Cancel</button>
            <button type="button" className="button button-primary" disabled={restoreBusy || restorePreview.conflicts.some(({ id }) => !restoreChoices[id])} onClick={() => void confirmRestore()}>{restoreBusy ? "Restoring…" : "Restore backup"}</button></div>
        </div>}
      </dialog>
    </div>
  );
}
