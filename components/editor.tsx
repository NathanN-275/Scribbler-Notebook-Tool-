"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { BookOpen, Check, ChevronLeft, ChevronRight, Eraser, FileText, Lasso, Pencil, PenTool, Plus, Redo2, Sparkles, Undo2, X } from "lucide-react";
import { newPage, paperTypes, readNote, saveNote, type Note, type Page, type PaperType, type Stroke } from "../lib/notebooks";
import { InkCanvas, type DrawingTool } from "./ink-canvas";

const tools = [
  { id: "pen", label: "Pen", Icon: PenTool },
  { id: "pencil", label: "Pencil", Icon: Pencil },
  { id: "eraser", label: "Eraser", Icon: Eraser },
  { id: "lasso", label: "Lasso", Icon: Lasso },
] as const;
const colors = [
  { name: "Charcoal", value: "#24332d" },
  { name: "Forest", value: "#287556" },
  { name: "Blue", value: "#3768af" },
  { name: "Red", value: "#ae4547" },
  { name: "Purple", value: "#7753a5" },
  { name: "Ochre", value: "#a9641f" },
];
const sizes = ["Fine", "Medium", "Bold"];
const inkWidths = [2, 4, 8];
const eraserRadii = [8, 16, 28];

type Tool = (typeof tools)[number]["id"];
type InkSettings = { color: string; size: number };
type History = { undo: Stroke[][]; redo: Stroke[][] };
function ToolButton({ label, children, active, onClick, disabled }: {
  label: string; children: ReactNode; active?: boolean; onClick: () => void; disabled?: boolean;
}) {
  return <button type="button" className={active ? "editor-tool active" : "editor-tool"} aria-label={label} title={label} aria-pressed={active} onClick={onClick} disabled={disabled}>{children}</button>;
}

export function NoteEditor({ noteId }: { noteId: string }) {
  const [note, setNote] = useState<Note | null>();
  const [loadError, setLoadError] = useState(false);
  const [loadRequest, setLoadRequest] = useState(0);
  const [saveStatus, setSaveStatus] = useState<"saved" | "saving" | "error">("saved");
  const [pageIndex, setPageIndex] = useState(0);
  const [tool, setTool] = useState<Tool>("pen");
  const [settings, setSettings] = useState({
    pen: { color: colors[0].value, size: 1 },
    pencil: { color: colors[0].value, size: 0 },
  });
  const [eraserSize, setEraserSize] = useState(1);
  const [aiOpen, setAiOpen] = useState(false);
  const histories = useRef(new Map<string, History>());
  const latestSave = useRef(0);
  const [canvasReset, setCanvasReset] = useState(0);
  const page: Page | undefined = note?.pages[pageIndex];
  const history = page && histories.current.get(page.id);
  const ink = tool === "pen" || tool === "pencil" ? settings[tool] : null;
  const drawingTool: DrawingTool = tool === "pen" || tool === "pencil"
    ? { type: tool, color: settings[tool].color, width: inkWidths[settings[tool].size] }
    : tool === "eraser" ? { type: tool, radius: eraserRadii[eraserSize] } : { type: tool };

  useEffect(() => {
    let active = true;
    readNote(noteId).then(
      (stored) => { if (active) setNote(stored ?? null); },
      () => { if (active) setLoadError(true); },
    );
    return () => { active = false; };
  }, [noteId, loadRequest]);

  useEffect(() => {
    if (saveStatus === "saved") return;
    function warn(event: BeforeUnloadEvent) {
      event.preventDefault();
      event.returnValue = true;
    }
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [saveStatus]);

  const persist = useCallback((updated: Note) => {
    setNote(updated);
    setSaveStatus("saving");
    const save = ++latestSave.current;
    saveNote(updated).then(
      () => { if (save === latestSave.current) setSaveStatus("saved"); },
      () => { if (save === latestSave.current) setSaveStatus("error"); },
    );
  }, []);

  const replaceStrokes = useCallback((strokes: Stroke[]) => {
    if (!note || !page) return;
    persist({ ...note, pages: note.pages.map((item) => item.id === page.id ? { ...item, strokes } : item) });
  }, [note, page, persist]);

  const commit = useCallback((strokes: Stroke[]) => {
    if (!page) return;
    const previous = histories.current.get(page.id);
    histories.current.set(page.id, { undo: [...(previous?.undo ?? []), page.strokes].slice(-60), redo: [] });
    replaceStrokes(strokes);
  }, [page, replaceStrokes]);

  const stepHistory = useCallback((direction: "undo" | "redo") => {
    if (!page) return;
    const entry = histories.current.get(page.id);
    const strokes = entry?.[direction].pop();
    if (!entry || !strokes) return;
    entry[direction === "undo" ? "redo" : "undo"].push(page.strokes);
    setCanvasReset((value) => value + 1);
    replaceStrokes(strokes);
  }, [page, replaceStrokes]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.defaultPrevented || !(event.target instanceof HTMLElement) ||
        event.target.closest("input, textarea, select, [contenteditable]")) return;
      if ((event.metaKey || event.ctrlKey) && ["z", "y"].includes(event.key.toLowerCase())) {
        if (!page) return;
        event.preventDefault();
        stepHistory(event.shiftKey || event.key.toLowerCase() === "y" ? "redo" : "undo");
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [stepHistory, page]);

  function changePage(index: number) {
    setPageIndex(index);
  }

  function addPage() {
    if (!note) return;
    persist({ ...note, pages: [...note.pages, newPage()] });
    changePage(note.pages.length);
  }

  function updateInk(update: Partial<InkSettings>) {
    if (tool !== "pen" && tool !== "pencil") return;
    setSettings((previous) => ({ ...previous, [tool]: { ...previous[tool], ...update } }));
  }

  if (loadError || !note || !page) {
    return (
      <main className="editor-state">
        <Link href="/library" className="button button-outline"><BookOpen size={18} /> Library</Link>
        {loadError ? <div className="state-box" role="alert">
          <p>Couldn’t load this note from browser storage.</p>
          <button className="button button-outline" onClick={() => { setLoadError(false); setLoadRequest(loadRequest + 1); }}>Retry</button>
        </div> : note === null ? <p>This note couldn’t be found in this browser.</p> : <p role="status">Loading your note…</p>}
      </main>
    );
  }

  return (
    <div className="editor">
      <header className="editor-topbar">
        <Link href="/library" className="editor-back" aria-label="Library"><BookOpen size={18} /><span>Library</span></Link>
        <div className="editor-title"><FileText size={16} /><h1>{note.name}</h1></div>
        <div className="editor-top-actions">
          <span className="save-indicator" role="status">{saveStatus === "saved" ? <><Check size={15} /><span>Saved</span></> : saveStatus === "saving" ? "Saving…" : "Unsaved"}</span>
          <button type="button" className="assistant-toggle" aria-label="AI tutor" aria-expanded={aiOpen} aria-controls={aiOpen ? "ai-panel" : undefined} onClick={() => setAiOpen(!aiOpen)}><Sparkles size={17} /><span>AI tutor</span></button>
        </div>
      </header>
      <div className="editor-toolbar" role="group" aria-label="Drawing tools">
        <div className="tool-group">
          {tools.map(({ id, label, Icon }) => (
            <ToolButton key={id} label={label} active={tool === id} onClick={() => setTool(id)}><Icon size={20} /></ToolButton>
          ))}
        </div>
        {ink && <div className="tool-group swatches" role="group" aria-label={`${tool} colors`}>
          {colors.map(({ name, value }) => <button
            type="button" className="swatch" key={value} aria-label={name} title={name} aria-pressed={ink.color === value} onClick={() => updateInk({ color: value })}
          ><span style={{ backgroundColor: value }} /></button>)}
        </div>}
        {(ink || tool === "eraser") && <div className="tool-group size-buttons" role="group" aria-label={`${tool} sizes`}>
          {sizes.map((size, index) => (
            <ToolButton key={size} label={`${size} ${tool}`} active={(ink?.size ?? eraserSize) === index}
              onClick={() => { if (tool === "eraser") setEraserSize(index); else updateInk({ size: index }); }}>
              <span className="size-dot" style={{ width: 5 + index * 4, height: 5 + index * 4 }} />
            </ToolButton>
          ))}
        </div>}
        <div className="tool-group history-buttons">
          <ToolButton label="Undo" disabled={!history?.undo.length} onClick={() => stepHistory("undo")}><Undo2 size={20} /></ToolButton>
          <ToolButton label="Redo" disabled={!history?.redo.length} onClick={() => stepHistory("redo")}><Redo2 size={20} /></ToolButton>
        </div>
        <label className="paper-select"><span>Paper</span>
          <select aria-label="Paper type for all pages" value={note.paper} onChange={(event) => persist({ ...note, paper: event.currentTarget.value as PaperType })}>
            {paperTypes.map((paper) => <option key={paper} value={paper}>{paper[0].toUpperCase() + paper.slice(1)}</option>)}
          </select>
        </label>
      </div>
      {saveStatus === "error" && <div className="save-error" role="alert">Couldn’t save your changes. Keep this note open and try again.
        <button className="button button-outline" onClick={() => persist(note)}>Retry save</button>
      </div>}
      <div className="editor-body">
        <main className="editor-workspace">
          <InkCanvas
            key={`${page.id}-${tool}-${canvasReset}`}
            page={page}
            pageNumber={pageIndex + 1}
            paper={note.paper}
            tool={drawingTool}
            onEdit={commit}
          />
          <nav className="editor-pagination" aria-label="Note pages">
            <ToolButton label="Previous page" disabled={pageIndex === 0} onClick={() => changePage(pageIndex - 1)}><ChevronLeft size={20} /></ToolButton>
            <span aria-live="polite">Page {pageIndex + 1} of {note.pages.length}</span>
            <ToolButton label="Next page" disabled={pageIndex + 1 === note.pages.length} onClick={() => changePage(pageIndex + 1)}><ChevronRight size={20} /></ToolButton>
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
    </div>
  );
}
