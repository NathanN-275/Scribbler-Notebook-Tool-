"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { BookOpen, ChevronRight, Folder, FolderOpen, FolderPlus, NotebookPen, Plus, X } from "lucide-react";
import { Brand } from "./brand";
import { newPage, nextUntitledNoteName, readLibrary, saveFolder, saveNote, type Library, type PaperType } from "../lib/notebooks";
import { standardPaperSpacing } from "../lib/paper";
import { PaperControls, PaperPreview, paperStyle } from "./paper-controls";
import { visibleNotes, type NoteSort } from "../lib/library-view";
import { LibraryActionDialog, type LibraryAction } from "./library-action-dialog";

type CreateMode = "folder" | "note";

export function LibraryView() {
  const router = useRouter();
  const [library, setLibrary] = useState<Library>();
  const [folderId, setFolderId] = useState<string | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [request, setRequest] = useState(0);
  const [create, setCreate] = useState<CreateMode>();
  const [paper, setPaper] = useState<PaperType>("lined");
  const [paperSpacing, setPaperSpacing] = useState(standardPaperSpacing);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const isSubmitting = useRef(false);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<NoteSort>("created");
  const [action, setAction] = useState<LibraryAction>();
  const [status, setStatus] = useState("");

  useEffect(() => {
    let active = true;
    readLibrary().then(
      (value) => { if (active) { setLibrary(value); setLoadError(false); } },
      () => { if (active) setLoadError(true); },
    );
    return () => { active = false; };
  }, [request]);

  const folder = library?.folders.find((item) => item.id === folderId);
  // Search and sorting only affect the view; saved notes keep their original data.
  const notes = library && visibleNotes(library.notes, folder?.id ?? null, query, sort);

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

  return (
    <div className="library-shell">
      <header className="site-header library-header">
        <Brand />
        <span className="local-caption"><span /> Stored in this browser</span>
      </header>
      <div className="library-layout">
        <aside className="library-sidebar">
          <nav aria-label="Library folders">
            <button className={!folder ? "sidebar-link current" : "sidebar-link"} onClick={() => setFolderId(null)} aria-current={!folder ? "page" : undefined}>
              <BookOpen size={19} /> All notes
            </button>
            <div className="sidebar-heading"><span>Folders</span>
              <button type="button" className="icon-button" aria-label="Create folder" title="Create folder" disabled={!library} onClick={() => showCreate("folder")}><Plus size={17} /></button>
            </div>
            {library?.folders.map((item) => (
              <button key={item.id} className={folderId === item.id ? "sidebar-link current" : "sidebar-link"} onClick={() => setFolderId(item.id)} aria-current={folderId === item.id ? "page" : undefined}>
                <Folder size={18} /><span>{item.name}</span>
              </button>
            ))}
          </nav>
        </aside>
        <main className="library-main">
          <div className="library-topline">
            {folder && <div className="breadcrumbs"><button onClick={() => setFolderId(null)}>Library</button><ChevronRight size={14} /><span>Folder</span></div>}
          </div>
          <div className="library-title">
            <div><h1>{folder?.name ?? "Your library"}</h1><p>{folder ? "Notes in this folder." : "Create, organize, and revisit your notes."}</p></div>
            <div className="library-actions">
              {folder && <button className="button button-outline" onClick={() => setAction({ type: "rename", folder })}>Rename folder</button>}
              {!folder && <button className="button button-outline" disabled={!library} onClick={() => showCreate("folder")}><FolderPlus size={18} /> New folder</button>}
              <button className="button button-primary" disabled={!library} onClick={() => showCreate("note")}><Plus size={18} /> New note</button>
            </div>
          </div>
          <div className="library-filters">
            <label className="field">Search notes
              <input type="search" placeholder="Search by title" value={query} onChange={(event) => setQuery(event.target.value)} />
            </label>
            <label className="field">Sort notes
              <select value={sort} onChange={(event) => setSort(event.target.value as NoteSort)}>
                <option value="created">Newest created</option><option value="edited">Recently edited</option><option value="title">Title A–Z</option>
              </select>
            </label>
          </div>
          <p className="library-status" role="status">{status}</p>
          {loadError ? (
            <div className="state-box" role="alert"><p>Couldn’t open your library. Make sure browser storage is available.</p>
              <button className="button button-outline" onClick={() => { setLoadError(false); setRequest(request + 1); }}>Retry</button>
            </div>
          ) : !library ? <p role="status">Loading your library…</p> : (
            <>
              {!folder && library.folders.length > 0 && (
                <section className="library-section" aria-labelledby="folders-heading">
                  <h2 id="folders-heading">Folders</h2>
                  <div className="folder-grid">
                    {library.folders.map((item) => <button key={item.id} className="folder-card" onClick={() => setFolderId(item.id)}>
                      <FolderOpen size={22} /><span>{item.name}</span><ChevronRight size={16} />
                    </button>)}
                  </div>
                </section>
              )}
              <section className="library-section" aria-labelledby="notes-heading">
                <h2 id="notes-heading">{folder ? "Notes" : "All notes"}</h2>
                {notes?.length ? (
                  <div className="note-grid">
                    {notes.map((note) => (
                      <article className="note-card" key={note.id}>
                        {/* Keep action buttons outside the link so they never open the editor. */}
                        <Link className="note-open" href={`/notes/${note.id}`}>
                        <div className="note-cover"><div className={`paper-sample ${note.paper}`} style={paperStyle(note.paperSpacing)}><NotebookPen size={26} /></div></div>
                        <div className="note-info"><strong>{note.name}</strong><span>{note.paper} · {note.pages.length} {note.pages.length === 1 ? "page" : "pages"}</span></div>
                        </Link>
                        <div className="note-actions">
                          <button type="button" aria-label={`Move ${note.name}`} onClick={() => setAction({ type: "move", note })}>Move</button>
                          <button type="button" aria-label={`Delete ${note.name}`} onClick={() => setAction({ type: "delete", note })}>Delete</button>
                        </div>
                      </article>
                    ))}
                  </div>
                ) : (
                  <div className="empty-library">
                    <span className="empty-icon"><NotebookPen size={30} /></span>
                    <h3>{query.trim() ? "No matching notes" : "No notes yet"}</h3>
                    <p>{query.trim() ? "Try another title or clear your search." : "Start with a blank page and make it yours."}</p>
                    {query.trim() ? <button className="button button-outline" onClick={() => setQuery("")}>Clear search</button> :
                      <button className="button button-primary" onClick={() => showCreate("note")}><Plus size={18} /> Create a note</button>}
                  </div>
                )}
              </section>
            </>
          )}
        </main>
      </div>
      {action && library && <LibraryActionDialog action={action} folders={library.folders} onClose={() => setAction(undefined)}
        onSaved={(message) => { setStatus(message); setRequest((value) => value + 1); }} />}
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
    </div>
  );
}
