"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent } from "react";
import { ClipboardPaste, Copy, RotateCw, Trash2 } from "lucide-react";
import type { EraserMode, Page, PaperType, Point, Stroke, TextBox } from "../lib/notebooks";
import { caughtByLasso, caughtPolygonByLasso, drawStroke, eraseStrokePoints, hitsStroke, pageHeight, pageWidth } from "../lib/ink";
import { boxCenter, hitsTextBox, selectionBounds, selectionTransform, textBoxCorners, transformBox, transformStroke, transformTextBox, type Bounds, type PageItems, type SelectionTransform } from "../lib/selection";
import { paperStyle } from "./paper-controls";

export type DrawingTool =
  | { type: "pen" | "pencil"; color: string; width: number }
  | { type: "eraser"; radius: number; mode: EraserMode }
  | { type: "lasso" | "pan" | "text" };

type EditPage = (pageId: string, update: (page: Page) => Page) => void;
type EraseGesture = { type: "erase"; radius: number; mode: EraserMode; edits: Map<string, Stroke[]> };
type TransformAction = "move" | "resize" | "rotate";
type TransformGesture = {
  type: "transform"; action: TransformAction; start: Point; ids: Set<string>; transform: SelectionTransform;
};
type Gesture = { pointerId: number; last: Point } & (
  | { type: "draw"; stroke: Stroke }
  | EraseGesture
  | { type: "lasso"; boundary: Point[] }
  | TransformGesture
  | { type: "pan"; start: Point; scrollLeft: number; scrollTop: number }
);

const textPlaceholder = "type something...";
const pasteOffset = 24;

function boxStyle(box: Bounds, angle = 0): CSSProperties {
  return {
    left: `${box.x / pageWidth * 100}%`, top: `${box.y / pageHeight * 100}%`,
    width: `${box.width / pageWidth * 100}%`, height: `${box.height / pageHeight * 100}%`,
    transform: angle ? `rotate(${angle}rad)` : undefined,
  };
}

function applyErasure(strokes: Stroke[], eraser: EraseGesture) {
  return strokes.flatMap((stroke) => eraser.edits.get(stroke.id) ?? stroke);
}

function commitInkGesture(current: Gesture | null, pageId: string, onEdit: EditPage) {
  if (current?.type === "draw") {
    onEdit(pageId, (page) => ({ ...page, strokes: [...page.strokes, current.stroke] }));
  } else if (current?.type === "erase" && current.edits.size) {
    onEdit(pageId, (page) => ({ ...page, strokes: applyErasure(page.strokes, current) }));
  }
}

export function InkCanvas({ page, pageNumber, paper, paperSpacing, tool, zoom, clipboard, onCopy, onEdit }: {
  page: Page;
  pageNumber: number;
  paper: PaperType;
  paperSpacing: number;
  tool: DrawingTool;
  zoom: number;
  clipboard?: PageItems;
  onCopy: (items: PageItems) => void;
  onEdit: EditPage;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const scroll = useRef<HTMLDivElement>(null);
  const gesture = useRef<Gesture | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [preview, setPreview] = useState<SelectionTransform>();
  const [focusedBoxId, setFocusedBoxId] = useState<string>();
  const selectable = tool.type === "lasso" || tool.type === "pan";
  const selection = useMemo(() => {
    const ids = new Set(selectable ? selectedIds : []);
    return {
      strokes: tool.type === "lasso" ? page.strokes.filter((stroke) => ids.has(stroke.id)) : [],
      textBoxes: page.textBoxes.filter((box) => ids.has(box.id)),
    };
  }, [page, selectable, selectedIds, tool.type]);
  const selected = useMemo(() => new Set([...selection.strokes, ...selection.textBoxes].map((item) => item.id)), [selection]);
  const bounds = useMemo(() => selectionBounds(selection), [selection]);
  const backgroundUrl = useMemo(() => page.background ? URL.createObjectURL(page.background) : undefined, [page.background]);

  useEffect(() => { setSelectedIds([]); }, [tool.type]);
  useEffect(() => () => { if (backgroundUrl) URL.revokeObjectURL(backgroundUrl); }, [backgroundUrl]);

  useLayoutEffect(() => {
    if (!focusedBoxId) return;
    canvas.current?.parentElement?.querySelector<HTMLTextAreaElement>(`textarea[data-text-box="${focusedBoxId}"]`)?.focus();
    setFocusedBoxId(undefined);
  }, [focusedBoxId]);

  useEffect(() => {
    const pageId = page.id;
    return () => {
      commitInkGesture(gesture.current, pageId, onEdit);
      gesture.current = null;
    };
  }, [onEdit, page.id]);

  const deleteSelection = useCallback(() => {
    if (!selected.size || gesture.current) return;
    onEdit(page.id, (current) => ({
      ...current,
      strokes: current.strokes.filter((stroke) => !selected.has(stroke.id)),
      textBoxes: current.textBoxes.filter((box) => !selected.has(box.id)),
    }));
    setSelectedIds([]);
  }, [onEdit, page.id, selected]);

  const copySelection = useCallback(() => {
    if (selected.size && !gesture.current) onCopy(selection);
  }, [onCopy, selected, selection]);

  const pasteSelection = useCallback(() => {
    if (!clipboard || gesture.current) return;
    const copiedBounds = selectionBounds(clipboard);
    if (!copiedBounds) return;
    const offset = {
      x: Math.max(-copiedBounds.x, Math.min(pasteOffset, pageWidth - copiedBounds.x - copiedBounds.width)),
      y: Math.max(-copiedBounds.y, Math.min(pasteOffset, pageHeight - copiedBounds.y - copiedBounds.height)),
    };
    const transform = { ...selectionTransform({ x: 0, y: 0 }), offset };
    const strokes = clipboard.strokes.map((stroke) => ({ ...transformStroke(stroke, transform), id: crypto.randomUUID() }));
    const textBoxes = clipboard.textBoxes.map((box) => ({ ...transformTextBox(box, transform), id: crypto.randomUUID() }));
    onEdit(page.id, (current) => ({ ...current, strokes: [...current.strokes, ...strokes], textBoxes: [...current.textBoxes, ...textBoxes] }));
    setSelectedIds([...strokes, ...textBoxes].map((item) => item.id));
  }, [clipboard, onEdit, page.id]);

  function applySelectionTransform(ids: Set<string>, transform: SelectionTransform) {
    if (transform.scale === 1 && !transform.angle && !transform.offset.x && !transform.offset.y) return;
    onEdit(page.id, (current) => ({
      ...current,
      strokes: current.strokes.map((stroke) => ids.has(stroke.id) ? transformStroke(stroke, transform) : stroke),
      textBoxes: current.textBoxes.map((box) => ids.has(box.id) ? transformTextBox(box, transform) : box),
    }));
  }

  useEffect(() => {
    if (!selectable) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.defaultPrevented || gesture.current || !(event.target instanceof HTMLElement) ||
        event.target.closest("input, textarea, select, [contenteditable], dialog")) return;
      if ((event.key === "Backspace" || event.key === "Delete") && selected.size) {
        event.preventDefault();
        deleteSelection();
      } else if (event.key === "Escape") setSelectedIds([]);
      else if (tool.type === "lasso" && (event.metaKey || event.ctrlKey)) {
        const key = event.key.toLowerCase();
        if (key === "c" && selected.size && !window.getSelection()?.toString()) {
          event.preventDefault();
          copySelection();
        } else if (key === "v" && clipboard) {
          event.preventDefault();
          pasteSelection();
        }
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [clipboard, copySelection, deleteSelection, pasteSelection, selectable, selected.size, tool.type]);

  const paint = useCallback(() => {
    const element = canvas.current;
    const ctx = element?.getContext("2d");
    if (!element || !ctx) return;
    ctx.setTransform(element.width / pageWidth, 0, 0, element.height / pageHeight, 0, 0);
    ctx.clearRect(0, 0, pageWidth, pageHeight);
    const current = gesture.current;
    const strokes = current?.type === "erase" ? applyErasure(page.strokes, current) : page.strokes;
    for (const stroke of strokes) {
      const displayed = current?.type === "transform" && current.ids.has(stroke.id) ? transformStroke(stroke, current.transform) : stroke;
      drawStroke(ctx, displayed, selected.has(stroke.id));
    }
    if (current?.type === "draw") drawStroke(ctx, current.stroke, false);
    if (current?.type === "lasso") {
      ctx.beginPath();
      current.boundary.forEach((point, index) => index === 0 ? ctx.moveTo(point.x, point.y) : ctx.lineTo(point.x, point.y));
      ctx.closePath();
      ctx.fillStyle = "rgba(59, 133, 98, .12)";
      ctx.fill();
      ctx.strokeStyle = "#397c5a";
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 4]);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }, [page, selected]);

  useLayoutEffect(() => {
    const element = canvas.current;
    if (!element) return;
    const resize = () => {
      const { width, height } = element.getBoundingClientRect();
      const scale = window.devicePixelRatio || 1;
      const nextWidth = Math.max(1, Math.round(width * scale));
      const nextHeight = Math.max(1, Math.round(height * scale));
      if (element.width !== nextWidth) element.width = nextWidth;
      if (element.height !== nextHeight) element.height = nextHeight;
      paint();
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(element);
    return () => observer.disconnect();
  }, [paint]);

  function pointOnPage(event: PointerEvent<HTMLElement>, clamp = true): Point {
    const rect = canvas.current!.getBoundingClientRect();
    const x = (event.clientX - rect.left) * pageWidth / rect.width;
    const y = (event.clientY - rect.top) * pageHeight / rect.height;
    return clamp ? { x: Math.max(0, Math.min(pageWidth, x)), y: Math.max(0, Math.min(pageHeight, y)) } : { x, y };
  }

  function startTransform(event: PointerEvent<HTMLElement>, action: TransformAction, ids: Set<string>, origin: Point) {
    if (!event.isPrimary || event.button !== 0 || gesture.current) return;
    const start = pointOnPage(event, false);
    event.currentTarget.setPointerCapture(event.pointerId);
    gesture.current = { pointerId: event.pointerId, last: start, type: "transform", action, start, ids, transform: selectionTransform(origin) };
  }

  function eraseBetween(from: Point, to: Point, eraser: EraseGesture) {
    for (const stroke of page.strokes) {
      if (eraser.mode === "stroke") {
        if (!eraser.edits.has(stroke.id) && hitsStroke(stroke, from, to, eraser.radius)) eraser.edits.set(stroke.id, []);
        continue;
      }

      const fragments = eraser.edits.get(stroke.id) ?? [stroke];
      let changed = false;
      const remaining = fragments.flatMap((fragment) => {
        const trimmed = eraseStrokePoints(fragment, from, to, eraser.radius);
        if (!trimmed) return fragment;
        changed = true;
        return trimmed;
      });
      if (changed) eraser.edits.set(stroke.id, remaining);
    }
  }

  function startGesture(event: PointerEvent<HTMLCanvasElement>) {
    if (!event.isPrimary || event.button !== 0 || gesture.current) return;
    const point = pointOnPage(event);
    const base = { pointerId: event.pointerId, last: point };
    if (tool.type === "text") {
      const empty = page.textBoxes.findLast((box) => !box.text.trim());
      const width = empty?.width ?? 260;
      const height = empty?.height ?? 78;
      const position = { x: Math.max(0, Math.min(point.x, pageWidth - width)), y: Math.max(0, Math.min(point.y, pageHeight - height)) };
      const box: TextBox = { id: crypto.randomUUID(), ...position, width, height, text: "" };
      if (empty) updateTextBox(empty.id, position);
      else onEdit(page.id, (current) => ({ ...current, textBoxes: [...current.textBoxes, box] }));
      setFocusedBoxId(empty?.id ?? box.id);
      return;
    }
    const hitBox = page.textBoxes.findLast((box) => hitsTextBox(box, point));
    if (tool.type === "pan" && hitBox) {
      setSelectedIds([hitBox.id]);
      startTransform(event, "move", new Set([hitBox.id]), point);
      return;
    }
    if (tool.type === "lasso" && (hitBox && selected.has(hitBox.id) ||
      selection.strokes.some((stroke) => hitsStroke(stroke, point, point, 12)))) {
      startTransform(event, "move", selected, point);
      return;
    }
    event.currentTarget.setPointerCapture(event.pointerId);
    if (tool.type === "pen" || tool.type === "pencil") {
      gesture.current = { ...base, type: "draw", stroke: { id: crypto.randomUUID(), tool: tool.type, color: tool.color, width: tool.width, points: [point] } };
    } else if (tool.type === "eraser") {
      const eraser = { ...base, type: "erase" as const, radius: tool.radius, mode: tool.mode, edits: new Map<string, Stroke[]>() };
      eraseBetween(point, point, eraser);
      gesture.current = eraser;
    } else if (tool.type === "pan") {
      setSelectedIds([]);
      gesture.current = { ...base, type: "pan", start: { x: event.clientX, y: event.clientY }, scrollLeft: scroll.current?.scrollLeft ?? 0, scrollTop: scroll.current?.scrollTop ?? 0 };
    } else if (tool.type === "lasso") {
      setSelectedIds([]);
      gesture.current = { ...base, type: "lasso", boundary: [point] };
    }
    paint();
  }

  function updateGesture(event: PointerEvent<HTMLElement>) {
    const current = gesture.current;
    if (!current || current.pointerId !== event.pointerId) return;
    const point = pointOnPage(event, current.type !== "transform");
    if (current.type === "pan") {
      if (scroll.current) {
        scroll.current.scrollLeft = current.scrollLeft - (event.clientX - current.start.x);
        scroll.current.scrollTop = current.scrollTop - (event.clientY - current.start.y);
      }
      current.last = point;
      return;
    }
    if (point.x === current.last.x && point.y === current.last.y) return;
    if (current.type === "draw") current.stroke.points.push(point);
    if (current.type === "lasso") current.boundary.push(point);
    if (current.type === "erase") eraseBetween(current.last, point, current);
    if (current.type === "transform") {
      const { origin } = current.transform;
      const start = { x: current.start.x - origin.x, y: current.start.y - origin.y };
      const next = { x: point.x - origin.x, y: point.y - origin.y };
      const transform = selectionTransform(origin);
      if (current.action === "move") transform.offset = { x: point.x - current.start.x, y: point.y - current.start.y };
      else if (current.action === "rotate") transform.angle = Math.atan2(next.y, next.x) - Math.atan2(start.y, start.x);
      else {
        const projectedScale = (next.x * start.x + next.y * start.y) / (start.x ** 2 + start.y ** 2);
        transform.scale = Math.max(0.2, Math.min(5, projectedScale));
      }
      current.transform = transform;
      setPreview(transform);
    }
    current.last = point;
    paint();
  }

  function finishGesture(event: PointerEvent<HTMLElement>, cancel = false) {
    const current = gesture.current;
    if (!current || current.pointerId !== event.pointerId) return;
    if (!cancel) updateGesture(event);
    gesture.current = null;
    if (current.type === "transform") setPreview(undefined);
    commitInkGesture(current, page.id, onEdit);
    if (!cancel) {
      if (current.type === "lasso" && current.boundary.length >= 3) {
        setSelectedIds([
          ...page.strokes.filter((stroke) => caughtByLasso(stroke, current.boundary)).map((stroke) => stroke.id),
          ...page.textBoxes.filter((box) => caughtPolygonByLasso(textBoxCorners(box), current.boundary)).map((box) => box.id),
        ]);
      } else if (current.type === "lasso" && current.boundary.length === 1) {
        const hit = page.textBoxes.findLast((box) => hitsTextBox(box, current.last)) ??
          page.strokes.findLast((stroke) => hitsStroke(stroke, current.last, current.last, 12));
        if (hit) setSelectedIds([hit.id]);
      }
      if (current.type === "transform") applySelectionTransform(current.ids, current.transform);
    }
    paint();
  }

  function updateTextBox(id: string, update: Partial<TextBox>) {
    onEdit(page.id, (data) => {
      const box = data.textBoxes.find((item) => item.id === id);
      if (!box || Object.entries(update).every(([key, value]) => box[key as keyof TextBox] === value)) return data;
      return { ...data, textBoxes: data.textBoxes.map((item) => item.id === id ? { ...item, ...update } : item) };
    });
  }

  function keyboardTransform(event: ReactKeyboardEvent<HTMLButtonElement>, action: "resize" | "rotate", origin: Point) {
    const direction = ["ArrowUp", "ArrowRight", "+"].includes(event.key) ? 1 :
      ["ArrowDown", "ArrowLeft", "-"].includes(event.key) ? -1 : 0;
    if (!direction) return;
    event.preventDefault();
    if (gesture.current) return;
    const transform = selectionTransform(origin);
    if (action === "resize") transform.scale = direction > 0 ? 1.1 : 1 / 1.1;
    else transform.angle = direction * Math.PI / 12;
    applySelectionTransform(selected, transform);
  }

  const frame = bounds && {
    x: bounds.x - Math.max(8, (60 - bounds.width) / 2),
    y: bounds.y - Math.max(8, (60 - bounds.height) / 2),
    width: Math.max(60, bounds.width + 16),
    height: Math.max(60, bounds.height + 16),
  };
  const displayedFrame = frame && preview ? transformBox(frame, preview) : frame;

  return <>
    {tool.type === "lasso" && <div className="lasso-bar">
      <span aria-live="polite">{selected.size ? `${selected.size} selected · Drag handles to resize or rotate` : "Draw around strokes or text boxes to select them."}</span>
      {selected.size > 0 && <button type="button" className="editor-tool" aria-label="Copy selection" title="Copy selection" onClick={copySelection}><Copy size={18} /></button>}
      {clipboard && <button type="button" className="editor-tool" aria-label="Paste selection" title="Paste selection" onClick={pasteSelection}><ClipboardPaste size={18} /></button>}
      {selected.size > 0 && <button type="button" className="editor-tool" aria-label="Delete selected objects" title="Delete selected objects" onClick={deleteSelection}><Trash2 size={18} /></button>}
    </div>}
    <div ref={scroll} className="paper-scroll">
      <div className="paper-zoom" style={{ "--zoom": zoom } as CSSProperties}>
        <div className={`editor-paper ${paper}`} style={paperStyle(paperSpacing)}>
          {backgroundUrl && <img className="page-background" src={backgroundUrl} alt="Imported page background" />}
          <canvas ref={canvas} className={`ink-canvas tool-${tool.type}`} aria-label={`Drawing surface, page ${pageNumber}`}
            onPointerDown={startGesture} onPointerMove={updateGesture} onPointerUp={(event) => finishGesture(event)}
            onPointerCancel={(event) => finishGesture(event, true)} onLostPointerCapture={(event) => finishGesture(event, true)} />
          <div className={`text-layer ${tool.type === "text" ? "text-editing" : ""}`}>
            {page.textBoxes.map((box) => {
              const isSelected = selected.has(box.id);
              const displayed = preview && isSelected ? transformTextBox(box, preview) : box;
              const empty = !box.text.trim();
              return <div key={box.id} data-box-id={box.id}
                className={`text-box${isSelected ? " text-selected" : ""}${empty ? " text-empty" : ""}`}
                style={{ ...boxStyle(displayed, displayed.rotation), "--text-scale": displayed.textScale ?? 1 } as CSSProperties}>
                {tool.type === "text" ? <textarea data-text-box={box.id} aria-label="Note text box" placeholder={textPlaceholder} value={box.text}
                  onChange={(event) => updateTextBox(box.id, { text: event.currentTarget.value })}
                  onBlur={(event) => {
                    const input = event.currentTarget;
                    const wrapper = input.parentElement;
                    const layer = wrapper?.parentElement;
                    if (!wrapper || !layer?.clientWidth || !layer.clientHeight) return;
                    const dw = input.offsetWidth - wrapper.clientWidth;
                    const dh = input.offsetHeight - wrapper.clientHeight;
                    if (Math.abs(dw) > 1 || Math.abs(dh) > 1) updateTextBox(box.id, {
                      width: box.width + dw * pageWidth / layer.clientWidth,
                      height: box.height + dh * pageHeight / layer.clientHeight,
                    });
                  }} /> : <div className="text-box-content">{empty ? textPlaceholder : box.text}</div>}
              </div>;
            })}
          </div>
          {tool.type === "lasso" && frame && displayedFrame && <div className="selection-frame" style={boxStyle(displayedFrame, preview?.angle)}>
            <button type="button" className="selection-handle selection-rotate" aria-label="Rotate selection" title="Drag to rotate or use arrow keys"
              onPointerDown={(event) => startTransform(event, "rotate", selected, boxCenter(frame))}
              onPointerMove={updateGesture} onPointerUp={(event) => finishGesture(event)}
              onPointerCancel={(event) => finishGesture(event, true)} onLostPointerCapture={(event) => finishGesture(event, true)}
              onKeyDown={(event) => keyboardTransform(event, "rotate", boxCenter(frame))}><RotateCw size={13} /></button>
            <button type="button" className="selection-handle selection-resize" aria-label="Resize selection" title="Drag to resize or use arrow keys"
              onPointerDown={(event) => startTransform(event, "resize", selected, frame)}
              onPointerMove={updateGesture} onPointerUp={(event) => finishGesture(event)}
              onPointerCancel={(event) => finishGesture(event, true)} onLostPointerCapture={(event) => finishGesture(event, true)}
              onKeyDown={(event) => keyboardTransform(event, "resize", frame)} />
          </div>}
        </div>
      </div>
    </div>
  </>;
}
