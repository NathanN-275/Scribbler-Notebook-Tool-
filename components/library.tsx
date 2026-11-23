"use client";

import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Archive, BookOpen, ChevronRight, Download, Folder, FolderOpen, FolderPlus, NotebookPen, Plus, Upload, X } from "lucide-react";
import { Brand } from "./brand";
import { newPage, nextUntitledNoteName, readEditorSettings, readLibrary, saveFolder, saveNote, type Library, type PaperType } from "../lib/notebooks";
import { standardPaperSpacing } from "../lib/paper";
import { PaperControls, PaperPreview, paperStyle } from "./paper-controls";
import { createLibraryBackup, inspectLibraryBackup, restoreLibraryBackup, type RestoreChoice, type RestorePreview } from "../lib/backup";
import { downloadBlob } from "../lib/files";

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
  const notes = library?.notes.filter((note) => folder ? note.folderId === folder.id : true);

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
              <button className="button button-outline" disabled={!library || backupBusy} onClick={() => void createBackup()}>
                <Download size={18} /> {backupBusy ? "Preparing…" : "Back up"}
              </button>
              <button className="button button-outline" disabled={!library || backupBusy} onClick={() => restoreInput.current?.click()}>
                <Upload size={18} /> Restore
              </button>
              <input ref={restoreInput} className="backup-input" type="file" accept=".scribbler,application/json" aria-label="Choose a Scribbler backup" onChange={(event) => void inspectRestoreFile(event)} />
              {!folder && <button className="button button-outline" disabled={!library} onClick={() => showCreate("folder")}><FolderPlus size={18} /> New folder</button>}
              <button className="button button-primary" disabled={!library} onClick={() => showCreate("note")}><Plus size={18} /> New note</button>
            </div>
          </div>
          {backupError && <p className="error-text library-backup-error" role="alert">{backupError}</p>}
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
                      <Link className="note-card" key={note.id} href={`/notes/${note.id}`}>
                        <div className="note-cover"><div className={`paper-sample ${note.paper}`} style={paperStyle(note.paperSpacing)}><NotebookPen size={26} /></div></div>
                        <div className="note-info"><strong>{note.name}</strong><span>{note.paper} · {note.pages.length} {note.pages.length === 1 ? "page" : "pages"}</span></div>
                      </Link>
                    ))}
                  </div>
                ) : (
                  <div className="empty-library">
                    <span className="empty-icon"><NotebookPen size={30} /></span>
                    <h3>No notes yet</h3>
                    <p>Start with a blank page and make it yours.</p>
                    <button className="button button-primary" onClick={() => showCreate("note")}><Plus size={18} /> Create a note</button>
                  </div>
                )}
              </section>
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
      <dialog ref={restoreDialog} className="create-dialog restore-dialog" aria-labelledby="restore-title" onClose={() => { if (!restoreBusy) { setRestorePreview(undefined); setRestoreChoices({}); setRestoreError(""); } }} onCancel={(event) => { if (restoreBusy) event.preventDefault(); }}>
        {restorePreview && <div>
          <div className="dialog-header"><div><h2 id="restore-title">Restore backup</h2><p>Review what will be added before it reaches your library.</p></div>
            <button type="button" className="icon-button" aria-label="Close" disabled={restoreBusy} onClick={() => restoreDialog.current?.close()}><X size={21} /></button></div>
          <div className="restore-summary" role="status">
            <Archive size={19} />
            <span>{restorePreview.additions} {restorePreview.additions === 1 ? "new note" : "new notes"} · {restorePreview.exactDuplicates} already in this library · {restorePreview.conflicts.length} {restorePreview.conflicts.length === 1 ? "conflict" : "conflicts"}</span>
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
