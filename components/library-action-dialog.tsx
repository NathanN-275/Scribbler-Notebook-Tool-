import { useEffect, useRef, useState, type FormEvent } from "react";
import { X } from "lucide-react";
import { deleteNote, moveNote, renameFolder, type Folder, type Note } from "../lib/notebooks";

export type LibraryAction = { type: "move" | "delete"; note: Note } | { type: "rename"; folder: Folder };

export function LibraryActionDialog({ action, folders, onClose, onSaved }: {
  action: LibraryAction;
  folders: Folder[];
  onClose: () => void;
  onSaved: (message: string) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const submitting = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const title = action.type === "rename" ? "Rename folder" : action.type === "move" ? "Move note" : "Delete note";

  useEffect(() => {
    dialog.current?.showModal();
    // Put the safe option first for deletion; otherwise focus the editable field.
    dialog.current?.querySelector<HTMLElement>(action.type === "delete" ? "[data-cancel]" : "input, select")?.focus();
  }, [action.type]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current) return;
    const form = new FormData(event.currentTarget);
    submitting.current = true;
    setBusy(true);
    setError("");
    try {
      if (action.type === "rename") await renameFolder(action.folder.id, String(form.get("name")));
      else if (action.type === "move") await moveNote(action.note.id, String(form.get("folderId")) || null);
      else await deleteNote(action.note.id);
      // Refresh separately so a refresh failure never looks like a failed mutation.
      onSaved(action.type === "rename" ? "Folder renamed." : action.type === "move" ? "Note moved." : "Note deleted.");
      dialog.current?.close();
    } catch (error) {
      setError(error instanceof Error ? error.message : "Couldn’t save this change. Try again.");
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  }

  return <dialog ref={dialog} className="create-dialog" aria-labelledby="library-action-title" onClose={onClose}
    onCancel={(event) => { if (submitting.current) event.preventDefault(); }}>
    <form onSubmit={submit}>
      <div className="dialog-header"><h2 id="library-action-title">{title}</h2>
        <button type="button" className="icon-button" aria-label="Close" disabled={busy} onClick={() => dialog.current?.close()}><X size={21} /></button>
      </div>
      {action.type === "rename" ? <label className="field">Folder name
        <input name="name" defaultValue={action.folder.name} required maxLength={80} disabled={busy} />
      </label> : action.type === "move" ? <label className="field">Move “{action.note.name}” to
        <select name="folderId" defaultValue={action.note.folderId ?? ""} disabled={busy}>
          <option value="">No folder</option>
          {folders.map((folder) => <option key={folder.id} value={folder.id}>{folder.name}</option>)}
        </select>
      </label> : <p>Delete “{action.note.name}” and all {action.note.pages.length} of its pages from this browser? This can’t be undone.</p>}
      {error && <p className="error-text" role="alert">{error}</p>}
      <div className="dialog-actions">
        <button data-cancel type="button" className="button button-outline" disabled={busy} onClick={() => dialog.current?.close()}>Cancel</button>
        <button className={`button ${action.type === "delete" ? "button-danger" : "button-primary"}`} disabled={busy}>
          {busy ? "Saving…" : action.type === "rename" ? "Save name" : title}
        </button>
      </div>
    </form>
  </dialog>;
}
