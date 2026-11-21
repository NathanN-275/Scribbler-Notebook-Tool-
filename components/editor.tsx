"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import Link from "next/link";
import { BookOpen, Check, ChevronLeft, ChevronRight, Download, Eraser, FileText, Hand, Lasso, Pencil, PenTool, Plus, Redo2, Settings, Sparkles, Type, Undo2, Upload, X, ZoomIn, ZoomOut } from "lucide-react";
import { defaultEditorSettings, newPage, nextUntitledNoteName, readEditorSettings, readLibrary, readNote, saveEditorSettings, saveNote, type EditorSettings, type Note, type Page } from "../lib/notebooks";
import { downloadBlob, makePdf, prepareFilePages, renderPageBlob } from "../lib/files";
import { InkCanvas, type DrawingTool } from "./ink-canvas";
import { InkPalette } from "./ink-palette";
import { PaperControls, PaperPreview } from "./paper-controls";

const tools = [
  { id: "pan", label: "Pan", Icon: Hand },
  { id: "pen", label: "Pen", Icon: PenTool },
  { id: "pencil", label: "Pencil", Icon: Pencil },
  { id: "text", label: "Text", Icon: Type },
  { id: "eraser", label: "Eraser", Icon: Eraser },
  { id: "lasso", label: "Lasso", Icon: Lasso },
] as const;
const colors = [
  { name: "Charcoal", value: "#24332d" },
  { name: "Forest", value: "#287556" },
  { name: "Blue", value: "#3768af" },
  { name: "Red", value: "#ae4547" },
  { name: "Purple", value: "#7753a5" },
];
const sizeLabels = ["Fine", "Medium", "Bold"];
const sizeWidths = [2, 4, 8];
const eraserRadii = [8, 16, 28];

function availableSwatches(settings: EditorSettings) {
  return [
    ...colors.filter((color) => !settings.hiddenDefaultColors.includes(color.value)),
    ...settings.customColors.filter((value) => !colors.some((color) => color.value === value))
      .map((value) => ({ name: `Custom color ${value}`, value })),
  ];
}

type Tool = (typeof tools)[number]["id"];
type SizedTool = "pen" | "pencil" | "eraser";
type PaperSettings = Pick<Note, "paper" | "paperSpacing">;
type PageSnapshot = Pick<Page, "strokes" | "textBoxes">;
type History = { undo: PageSnapshot[]; redo: PageSnapshot[] };
type PreparedPage = { id: string; filename: string; pageNumber: number; background: Blob };

function ToolButton({ label, children, active, onClick, disabled }: {
  label: string; children: ReactNode; active?: boolean; onClick: () => void; disabled?: boolean;
}) {
  return <button type="button" className={active ? "editor-tool active" : "editor-tool"} aria-label={label} data-tooltip={label}
    aria-pressed={active} onClick={onClick} disabled={disabled}>{children}</button>;
}

function BlobPreview({ blob, label }: { blob: Blob; label: string }) {
  const [url, setUrl] = useState("");
  useEffect(() => {
    const objectUrl = URL.createObjectURL(blob);
    setUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [blob]);
  return url ? <img src={url} alt={label} /> : <span className="page-thumbnail-loading" />;
}

function NotePagePreview({ note, page, label }: { note: Note; page: Page; label: string }) {
  const [blob, setBlob] = useState<Blob>();
  useEffect(() => {
    let active = true;
    renderPageBlob(note, page).then((rendered) => { if (active) setBlob(rendered); }).catch(() => undefined);
    return () => { active = false; };
  }, [note, page]);
  return blob ? <BlobPreview blob={blob} label={label} /> : <span className="page-thumbnail-loading" />;
}

function dateText(timestamp: number) {
  return new Date(timestamp).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
}

export function NoteEditor({ noteId }: { noteId: string }) {
  const [note, setNote] = useState<Note | null>();
  const [loadError, setLoadError] = useState(false);
  const [loadRequest, setLoadRequest] = useState(0);
  const [saveStatus, setSaveStatus] = useState<"saved" | "saving" | "error">("saved");
  const [pageIndex, setPageIndex] = useState(0);
  const [tool, setTool] = useState<Tool>("pen");
  const [inkColors, setInkColors] = useState({ pen: colors[0].value, pencil: colors[0].value });
  const [settings, setSettings] = useState(defaultEditorSettings);
  const [settingsError, setSettingsError] = useState(false);
  const [widthSlider, setWidthSlider] = useState<{ tool: SizedTool; preset: number }>();
  const [aiOpen, setAiOpen] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [renameOpen, setRenameOpen] = useState(false);
  const [renameValue, setRenameValue] = useState("");
  const [renameError, setRenameError] = useState("");
  const [renameBusy, setRenameBusy] = useState(false);
  const [paperDraft, setPaperDraft] = useState<PaperSettings>();
  const [uploadPages, setUploadPages] = useState<PreparedPage[]>([]);
  const [uploadSelection, setUploadSelection] = useState<string[]>([]);
  const [uploadErrors, setUploadErrors] = useState<string[]>([]);
  const [uploadBusy, setUploadBusy] = useState(false);
  const [exportSelection, setExportSelection] = useState<string[]>([]);
  const [exportBusy, setExportBusy] = useState(false);
  const [fileActionError, setFileActionError] = useState("");
  const histories = useRef(new Map<string, History>());
  const latestSave = useRef(0);
  const noteRef = useRef<Note | null | undefined>(undefined);
  const eraserDialog = useRef<HTMLDialogElement>(null);
  const paperDialog = useRef<HTMLDialogElement>(null);
  const uploadInput = useRef<HTMLInputElement>(null);
  const renameDialog = useRef<HTMLDialogElement>(null);
  const uploadDialog = useRef<HTMLDialogElement>(null);
  const exportDialog = useRef<HTMLDialogElement>(null);
  const page: Page | undefined = note?.pages[pageIndex];
  noteRef.current = note;
  const history = page && histories.current.get(page.id);
  const sizedTool = tool === "pen" || tool === "pencil" || tool === "eraser" ? tool : null;
  const sizeKey = tool === "eraser" ? "eraserRadius" : tool === "pencil" ? "pencilWidth" : "penWidth";
  const size = settings[sizeKey];
  const presets = tool === "eraser" ? eraserRadii : sizeWidths;
  const sizeSliderOpen = widthSlider && widthSlider.tool === sizedTool;
  const activePreset = sizeSliderOpen ? widthSlider.preset :
    presets.reduce((closest, preset) => Math.abs(preset - size) < Math.abs(closest - size) ? preset : closest);
  const drawingTool: DrawingTool = tool === "pen" || tool === "pencil"
    ? { type: tool, color: inkColors[tool], width: size }
    : tool === "eraser" ? { type: tool, radius: size, mode: settings.eraserMode }
      : { type: tool };

  useEffect(() => {
    let active = true;
    readNote(noteId).then((stored) => { if (active) setNote(stored ?? null); }, () => { if (active) setLoadError(true); });
    readEditorSettings().then((stored) => {
      if (!active) return;
      setSettings(stored);
      const fallback = availableSwatches(stored)[0]?.value ?? colors[0].value;
      setInkColors({ pen: fallback, pencil: fallback });
    }, () => { if (active) setSettingsError(true); });
    return () => { active = false; };
  }, [noteId, loadRequest]);

  useEffect(() => {
    if (!renameOpen || !renameDialog.current || renameDialog.current.open) return;
    renameDialog.current.showModal();
    renameDialog.current.querySelector<HTMLInputElement>("input[name=note-name]")?.focus();
  }, [renameOpen]);

  useEffect(() => {
    if (!uploadPages.length || !uploadDialog.current || uploadDialog.current.open) return;
    uploadDialog.current.showModal();
  }, [uploadPages, uploadErrors]);

  useEffect(() => {
    if (!exportSelection.length || !exportDialog.current || exportDialog.current.open) return;
    exportDialog.current.showModal();
  }, [exportSelection]);

  useEffect(() => {
    if (saveStatus === "saved") return;
    function warn(event: BeforeUnloadEvent) { event.preventDefault(); event.returnValue = true; }
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [saveStatus]);

  const persist = useCallback(async (updated: Note) => {
    const saved = { ...updated, updatedAt: Date.now() };
    noteRef.current = saved;
    setNote(saved);
    setSaveStatus("saving");
    const request = ++latestSave.current;
    try {
      await saveNote(saved);
      if (request === latestSave.current) setSaveStatus("saved");
    } catch (error) {
      if (request === latestSave.current) setSaveStatus("error");
      throw error;
    }
  }, []);

  const editPage = useCallback((pageId: string, update: (current: Page) => Page) => {
    const currentNote = noteRef.current;
    const currentPage = currentNote?.pages.find((item) => item.id === pageId);
    if (!currentNote || !currentPage) return;
    const before: PageSnapshot = { strokes: currentPage.strokes, textBoxes: currentPage.textBoxes };
    const existing = histories.current.get(pageId) ?? { undo: [], redo: [] };
    const updatedPage = update(currentPage);
    const changed = updatedPage.strokes !== currentPage.strokes || updatedPage.textBoxes !== currentPage.textBoxes;
    if (!changed) return;
    histories.current.set(pageId, { undo: [...existing.undo, before].slice(-60), redo: [] });
    void persist({ ...currentNote, pages: currentNote.pages.map((current) => current.id === pageId ? updatedPage : current) }).catch(() => undefined);
  }, [persist]);

  const stepHistory = useCallback((direction: "undo" | "redo") => {
    if (!note || !page) return;
    const entry = histories.current.get(page.id);
    const target = entry?.[direction].pop();
    if (!entry || !target) return;
    const current: PageSnapshot = { strokes: page.strokes, textBoxes: page.textBoxes };
    entry[direction === "undo" ? "redo" : "undo"].push(current);
    void persist({ ...note, pages: note.pages.map((item) => item.id === page.id ? { ...item, ...target } : item) }).catch(() => undefined);
  }, [note, page, persist]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.defaultPrevented || !(event.target instanceof HTMLElement) || event.target.closest("input, textarea, select, [contenteditable]")) return;
      if ((event.metaKey || event.ctrlKey) && ["z", "y"].includes(event.key.toLowerCase())) {
        if (!page) return;
        event.preventDefault();
        stepHistory(event.shiftKey || event.key.toLowerCase() === "y" ? "redo" : "undo");
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [page, stepHistory]);

  function addPage() {
    if (!note) return;
    const pageItem = newPage();
    void persist({ ...note, pages: [...note.pages, pageItem] }).then(() => setPageIndex(note.pages.length)).catch(() => undefined);
  }

  async function saveSettings(updated: EditorSettings) {
    setSettings(updated);
    setSettingsError(false);
    try { await saveEditorSettings(updated); } catch { setSettingsError(true); }
  }

  function selectColor(value: string) {
    if (tool !== "pen" && tool !== "pencil") return;
    setInkColors((current) => ({ ...current, [tool]: value }));
  }

  function addColor(value: string) {
    if (settings.hiddenDefaultColors.includes(value)) {
      void saveSettings({ ...settings, hiddenDefaultColors: settings.hiddenDefaultColors.filter((color) => color !== value) });
    } else if (!availableSwatches(settings).some((color) => color.value === value)) {
      void saveSettings({ ...settings, customColors: [...settings.customColors, value] });
    }
    selectColor(value);
  }

  function removeColors(value?: string) {
    const hidden = colors.filter((color) => !value || color.value === value).map((color) => color.value);
    const updated = {
      ...settings,
      hiddenDefaultColors: [...new Set([...settings.hiddenDefaultColors, ...hidden])],
      customColors: value ? settings.customColors.filter((color) => color !== value) : [],
    };
    const remaining = availableSwatches(updated);
    const fallback = remaining[0]?.value ?? colors[0].value;
    setInkColors((current) => ({
      pen: remaining.some((color) => color.value === current.pen) ? current.pen : fallback,
      pencil: remaining.some((color) => color.value === current.pencil) ? current.pencil : fallback,
    }));
    void saveSettings(updated);
  }

  function submitPaper(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const current = noteRef.current;
    if (!current || !paperDraft) return;
    if (paperDraft.paper !== current.paper || paperDraft.paperSpacing !== current.paperSpacing) {
      void persist({ ...current, ...paperDraft }).catch(() => undefined);
    }
    paperDialog.current?.close();
  }

  async function submitRename(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!note || renameBusy) return;
    setRenameBusy(true);
    setRenameError("");
    try {
      const entered = renameValue.trim();
      const name = entered || nextUntitledNoteName((await readLibrary()).notes.filter((item) => item.id !== note.id));
      await persist({ ...note, name });
      renameDialog.current?.close();
    } catch {
      setRenameError("Couldn’t save the new note name. Try again.");
    } finally { setRenameBusy(false); }
  }

  async function uploadFiles(files: FileList | null) {
    if (!files?.length) return;
    setFileActionError("");
    setUploadPages([]);
    setUploadErrors([]);
    setUploadSelection([]);
    const prepared: PreparedPage[] = [];
    const errors: string[] = [];
    for (const file of Array.from(files)) {
      try {
        const blobs = await prepareFilePages(file);
        blobs.forEach((background, index) => prepared.push({ id: crypto.randomUUID(), filename: file.name, pageNumber: index + 1, background }));
      } catch (error) {
        errors.push(`${file.name}: ${error instanceof Error ? error.message : "Couldn’t read this file."}`);
      }
    }
    setUploadPages(prepared);
    setUploadErrors(errors);
    setUploadSelection(prepared.map((item) => item.id));
    if (!prepared.length && !errors.length) setFileActionError("Choose a PDF, DOCX, PNG, or JPEG file under 20 MB.");
  }

  async function confirmUpload() {
    if (!note || !uploadSelection.length || uploadBusy) return;
    setUploadBusy(true);
    try {
      const selected = uploadPages.filter((item) => uploadSelection.includes(item.id));
      const imported: Page[] = selected.map((item) => ({ id: item.id, strokes: [], textBoxes: [], background: item.background }));
      await persist({ ...note, pages: [...note.pages, ...imported] });
      setPageIndex(note.pages.length);
      uploadDialog.current?.close();
      setUploadPages([]);
      setUploadSelection([]);
    } catch {
      noteRef.current = note;
      setNote(note);
      setFileActionError("Couldn’t store these pages in this browser. Free browser storage and try again.");
    } finally { setUploadBusy(false); }
  }

  function openExport() {
    if (!note) return;
    setFileActionError("");
    setExportSelection(note.pages.map((item) => item.id));
  }

  async function confirmExport() {
    if (!note || !exportSelection.length || exportBusy) return;
    setExportBusy(true);
    setFileActionError("");
    try {
      const selected = note.pages.filter((item) => exportSelection.includes(item.id));
      const pdf = await makePdf(note, selected);
      const filename = `${note.name.replace(/[\\/:*?"<>|]/g, "-") || "Untitled Note"}.pdf`;
      downloadBlob(pdf, filename);
      exportDialog.current?.close();
    } catch {
      setFileActionError("Couldn’t create the PDF. Keep this note open and try again.");
    } finally { setExportBusy(false); }
  }

  if (loadError || !note || !page) {
    return <main className="editor-state">
      <Link href="/library" className="button button-outline"><BookOpen size={18} /> Library</Link>
      {loadError ? <div className="state-box" role="alert"><p>Couldn’t load this note from browser storage.</p>
        <button className="button button-outline" onClick={() => { setLoadError(false); setLoadRequest(loadRequest + 1); }}>Retry</button>
      </div> : note === null ? <p>This note couldn’t be found in this browser.</p> : <p role="status">Loading your note…</p>}
    </main>;
  }

  const selectedForExport = note.pages.filter((item) => exportSelection.includes(item.id));
  return <div className="editor">
    <header className="editor-topbar">
      <Link href="/library" className="editor-back" aria-label="Library"><BookOpen size={18} /><span>Library</span></Link>
      <button type="button" className="editor-title" onClick={() => { setRenameValue(note.name); setRenameError(""); setRenameOpen(true); }} aria-label={`Rename note ${note.name}`}>
        <FileText size={16} /><h1>{note.name}</h1>
      </button>
      <div className="editor-top-actions">
        <span className="save-indicator" role="status">{saveStatus === "saved" ? <><Check size={15} /><span>Saved</span></> : saveStatus === "saving" ? "Saving…" : "Unsaved"}</span>
        <button type="button" className="file-action" onClick={() => uploadInput.current?.click()} aria-label="Upload pages" data-tooltip="Upload"><Upload size={17} /><span>Upload</span></button>
        <button type="button" className="file-action" onClick={openExport} aria-label="Export PDF" data-tooltip="Export PDF"><Download size={17} /><span>Export</span></button>
        <input ref={uploadInput} hidden type="file" multiple accept=".pdf,.docx,.png,.jpg,.jpeg,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,image/png,image/jpeg"
          onChange={(event) => { void uploadFiles(event.currentTarget.files); event.currentTarget.value = ""; }} />
        <button type="button" className="assistant-toggle" aria-label="AI tutor" aria-expanded={aiOpen} aria-controls={aiOpen ? "ai-panel" : undefined} onClick={() => setAiOpen(!aiOpen)}><Sparkles size={17} /><span>AI tutor</span></button>
      </div>
    </header>
    <div className="editor-toolbar" role="group" aria-label="Drawing tools">
      <div className="tool-group">
        {tools.map(({ id, label, Icon }) => <ToolButton key={id} label={label} active={tool === id} onClick={() => {
          if (id === "eraser" && tool === "eraser") {
            eraserDialog.current?.showModal();
            return;
          }
          setTool(id);
          setWidthSlider(undefined);
        }}><Icon size={20} /></ToolButton>)}
      </div>
      {(tool === "pen" || tool === "pencil") && <InkPalette tool={tool} swatches={availableSwatches(settings)} selected={inkColors[tool]}
        onSelect={selectColor} onSave={addColor} onRemove={removeColors} />}
      {sizedTool && <div className="tool-group size-buttons" role="group" aria-label={`${sizedTool} sizes`}>
        {presets.map((preset, index) => <ToolButton key={preset} label={`${sizeLabels[index]} ${sizedTool}`} active={activePreset === preset} onClick={() => {
          if (activePreset === preset) {
            setWidthSlider(sizeSliderOpen ? undefined : { tool: sizedTool, preset });
          } else {
            void saveSettings({ ...settings, [sizeKey]: preset });
            setWidthSlider(undefined);
          }
        }}><span className="size-dot" style={{ "--dot-size": `${5 + (sizedTool !== "eraser" && activePreset === preset ? size : index * 4)}px` } as React.CSSProperties} /></ToolButton>)}
      </div>}
      {sizedTool && sizeSliderOpen && <label className="width-slider">{size}px
        <input type="range" min={tool === "eraser" ? 8 : 1} max={tool === "eraser" ? 28 : 20} step="1" value={size}
          aria-label={tool === "eraser" ? "Eraser size" : `${tool} width`} aria-valuetext={`${size} pixels`}
          onChange={(event) => void saveSettings({ ...settings, [sizeKey]: event.currentTarget.valueAsNumber })} />
      </label>}
      <div className="tool-group history-buttons">
        <ToolButton label="Undo" disabled={!history?.undo.length} onClick={() => stepHistory("undo")}><Undo2 size={20} /></ToolButton>
        <ToolButton label="Redo" disabled={!history?.redo.length} onClick={() => stepHistory("redo")}><Redo2 size={20} /></ToolButton>
      </div>
      <div className="tool-group">
        <button type="button" className="editor-tool" aria-label="Paper settings" aria-haspopup="dialog" data-tooltip="Paper settings" onClick={() => {
          setPaperDraft({ paper: note.paper, paperSpacing: note.paperSpacing });
          paperDialog.current?.showModal();
        }}><Settings size={20} /></button>
      </div>
      <div className="zoom-controls" role="group" aria-label="Page zoom">
        <button type="button" aria-label="Zoom out" data-tooltip="Zoom out" disabled={zoom <= .5} onClick={() => setZoom((value) => Math.max(.5, Math.round((value - .1) * 10) / 10))}><ZoomOut size={19} /></button>
        <span>{Math.round(zoom * 100)}%</span>
        <button type="button" aria-label="Zoom in" data-tooltip="Zoom in" disabled={zoom >= 2} onClick={() => setZoom((value) => Math.min(2, Math.round((value + .1) * 10) / 10))}><ZoomIn size={19} /></button>
      </div>
    </div>
    {(saveStatus === "error" || settingsError || fileActionError) && <div className="save-error" role="alert">
      {fileActionError || (settingsError ? "Couldn’t save your editor settings in this browser." : "Couldn’t save your changes. Keep this note open and try again.")}
      {saveStatus === "error" && <button className="button button-outline" onClick={() => void persist(note).catch(() => undefined)}>Retry save</button>}
      {fileActionError && <button type="button" className="icon-button" aria-label="Dismiss" onClick={() => setFileActionError("")}><X size={16} /></button>}
    </div>}
    <div className="editor-body">
      <main className="editor-workspace">
        <InkCanvas key={page.id} page={page} pageNumber={pageIndex + 1} paper={note.paper} paperSpacing={note.paperSpacing} tool={drawingTool} zoom={zoom} onEdit={editPage} />
        <nav className="editor-pagination" aria-label="Note pages">
          <ToolButton label="Previous page" disabled={pageIndex === 0} onClick={() => setPageIndex(pageIndex - 1)}><ChevronLeft size={20} /></ToolButton>
          <span aria-live="polite">Page {pageIndex + 1} of {note.pages.length}</span>
          <ToolButton label="Next page" disabled={pageIndex + 1 === note.pages.length} onClick={() => setPageIndex(pageIndex + 1)}><ChevronRight size={20} /></ToolButton>
          <button type="button" className="add-page" onClick={addPage}><Plus size={18} /> Add page</button>
        </nav>
      </main>
      {aiOpen && <aside className="ai-panel" id="ai-panel" aria-labelledby="ai-title">
        <div className="ai-panel-title"><Sparkles size={19} /><h2 id="ai-title">AI tutor</h2>
          <ToolButton label="Close AI tutor" onClick={() => setAiOpen(false)}><X size={19} /></ToolButton>
        </div>
        <div className="ai-empty"><strong>Coming later</strong><p>The tutor will help you work through handwritten problems, get hints, and practice.</p></div>
      </aside>}
    </div>
    <dialog ref={paperDialog} className="create-dialog create-note-dialog" aria-labelledby="paper-title">
      <form onSubmit={submitPaper}>
        <div className="dialog-header"><h2 id="paper-title">Paper settings</h2>
          <button type="button" className="icon-button" aria-label="Close paper settings" onClick={() => paperDialog.current?.close()}><X size={21} /></button>
        </div>
        {paperDraft && <div className="create-note-layout">
          <div className="create-note-options">
            <PaperControls paper={paperDraft.paper} spacing={paperDraft.paperSpacing}
              onPaperChange={(paper) => setPaperDraft({ ...paperDraft, paper })}
              onSpacingChange={(paperSpacing) => setPaperDraft({ ...paperDraft, paperSpacing })} />
          </div>
          <PaperPreview paper={paperDraft.paper} spacing={paperDraft.paperSpacing} />
        </div>}
        <div className="dialog-actions">
          <button type="button" className="button button-outline" onClick={() => paperDialog.current?.close()}>Cancel</button>
          <button className="button button-primary">Save paper settings</button>
        </div>
      </form>
    </dialog>
    <dialog ref={eraserDialog} className="create-dialog" aria-labelledby="eraser-title">
      <div className="dialog-header"><h2 id="eraser-title">Eraser mode</h2>
        <button type="button" className="icon-button" aria-label="Close eraser settings" onClick={() => eraserDialog.current?.close()}><X size={21} /></button>
      </div>
      <div className="eraser-options" role="group" aria-label="Eraser modes">
        <button type="button" className="button button-outline" aria-pressed={settings.eraserMode === "stroke"} onClick={() => {
          void saveSettings({ ...settings, eraserMode: "stroke" });
          eraserDialog.current?.close();
        }}><strong>Stroke eraser</strong><span>Erase an entire stroke.</span></button>
        <button type="button" className="button button-outline" aria-pressed={settings.eraserMode === "point"} onClick={() => {
          void saveSettings({ ...settings, eraserMode: "point" });
          eraserDialog.current?.close();
        }}><strong>Point eraser</strong><span>Erase only the part you touch.</span></button>
      </div>
    </dialog>
    <dialog ref={renameDialog} className="create-dialog rename-dialog" aria-labelledby="rename-title" onClose={() => setRenameOpen(false)}>
      <form onSubmit={submitRename}>
        <div className="dialog-header"><h2 id="rename-title">Note details</h2>
          <button type="button" className="icon-button" aria-label="Close" onClick={() => renameDialog.current?.close()}><X size={21} /></button>
        </div>
        <label className="field">Note name
          <input name="note-name" value={renameValue} maxLength={80} onChange={(event) => setRenameValue(event.currentTarget.value)} />
        </label>
        <dl className="note-metadata"><div><dt>Created</dt><dd>{dateText(note.createdAt)}</dd></div><div><dt>Last edited</dt><dd>{dateText(note.updatedAt)}</dd></div><div><dt>Pages</dt><dd>{note.pages.length}</dd></div></dl>
        {renameError && <p className="error-text" role="alert">{renameError}</p>}
        <div className="dialog-actions"><button type="button" className="button button-outline" disabled={renameBusy} onClick={() => renameDialog.current?.close()}>Cancel</button>
          <button className="button button-primary" disabled={renameBusy}>{renameBusy ? "Saving…" : "Save"}</button></div>
      </form>
    </dialog>
    <dialog ref={uploadDialog} className="page-picker-dialog" aria-labelledby="upload-title" onClose={() => { setUploadPages([]); setUploadErrors([]); }}>
      <div className="dialog-header"><div><h2 id="upload-title">Add pages</h2><p>Select the document pages to add to this note.</p></div>
        <button type="button" className="icon-button" aria-label="Close" onClick={() => uploadDialog.current?.close()}><X size={21} /></button></div>
      {uploadErrors.length > 0 && <div className="upload-errors" role="alert">{uploadErrors.map((error) => <p key={error}>{error}</p>)}</div>}
      {uploadPages.length > 0 && <>
        <div className="picker-actions"><button type="button" onClick={() => setUploadSelection(uploadPages.map((item) => item.id))}>Select all</button><button type="button" onClick={() => setUploadSelection([])}>Clear</button>
          <span>{uploadSelection.length} of {uploadPages.length} pages</span></div>
        <div className="page-picker-grid">{uploadPages.map((item) => <label className="page-picker-item" key={item.id}>
          <input type="checkbox" checked={uploadSelection.includes(item.id)} onChange={(event) => {
            const checked = event.currentTarget.checked;
            setUploadSelection((current) => checked ? [...current, item.id] : current.filter((id) => id !== item.id));
          }} />
          <BlobPreview blob={item.background} label={`${item.filename}, page ${item.pageNumber}`} />
          <span>{item.filename} · {item.pageNumber}</span>
        </label>)}</div>
      </>}
      <p className="file-limit-note">PDF, DOCX, PNG, or JPEG · up to 20 MB per file</p>
      <div className="dialog-actions"><button type="button" className="button button-outline" onClick={() => uploadDialog.current?.close()}>Cancel</button>
        {uploadPages.length > 0 && <button type="button" className="button button-primary" disabled={!uploadSelection.length || uploadBusy} onClick={() => void confirmUpload()}>{uploadBusy ? "Adding…" : `Add ${uploadSelection.length} pages`}</button>}</div>
    </dialog>
    <dialog ref={exportDialog} className="page-picker-dialog" aria-labelledby="export-title" onClose={() => setExportSelection([])}>
      <div className="dialog-header"><div><h2 id="export-title">Export PDF</h2><p>Choose the pages to include.</p></div>
        <button type="button" className="icon-button" aria-label="Close" onClick={() => exportDialog.current?.close()}><X size={21} /></button></div>
      <div className="picker-actions"><button type="button" onClick={() => setExportSelection(note.pages.map((item) => item.id))}>Select all</button><button type="button" onClick={() => setExportSelection([])}>Clear</button>
        <span>{selectedForExport.length} of {note.pages.length} pages</span></div>
      <div className="page-picker-grid">{note.pages.map((item, index) => <label className="page-picker-item" key={item.id}>
        <input type="checkbox" checked={exportSelection.includes(item.id)} onChange={(event) => {
          const checked = event.currentTarget.checked;
          setExportSelection((current) => checked ? [...current, item.id] : current.filter((id) => id !== item.id));
        }} />
        <NotePagePreview note={note} page={item} label={`Page ${index + 1}`} />
        <span>Page {index + 1}</span>
      </label>)}</div>
      <div className="dialog-actions"><button type="button" className="button button-outline" onClick={() => exportDialog.current?.close()}>Cancel</button>
        <button type="button" className="button button-primary" disabled={!exportSelection.length || exportBusy} onClick={() => void confirmExport()}>{exportBusy ? "Preparing…" : `Download ${exportSelection.length} pages`}</button></div>
    </dialog>
  </div>;
}
