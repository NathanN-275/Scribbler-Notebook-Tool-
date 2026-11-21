"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent } from "react";
import { Trash2 } from "lucide-react";
import type { Page, PaperType, Point, Stroke, TextBox } from "../lib/notebooks";
import { caughtByLasso, caughtRectByLasso, drawStroke, hitsStroke, pageHeight, pageWidth, shiftStroke } from "../lib/ink";
import { paperStyle } from "./paper-controls";

export type DrawingTool =
  | { type: "pen" | "pencil"; color: string; width: number }
  | { type: "eraser"; radius: number }
  | { type: "lasso" | "pan" | "text" };

type EditPage = (pageId: string, update: (page: Page) => Page) => void;
type Gesture = { pointerId: number; last: Point } & (
  | { type: "draw"; stroke: Stroke }
  | { type: "erase"; removed: Set<string>; radius: number }
  | { type: "lasso"; boundary: Point[] }
  | { type: "move"; start: Point; offset: Point }
  | { type: "pan"; start: Point; scrollLeft: number; scrollTop: number }
);

export function InkCanvas({ page, pageNumber, paper, paperSpacing, tool, zoom, onEdit }: {
  page: Page;
  pageNumber: number;
  paper: PaperType;
  paperSpacing: number;
  tool: DrawingTool;
  zoom: number;
  onEdit: EditPage;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const scroll = useRef<HTMLDivElement>(null);
  const textLayer = useRef<HTMLDivElement>(null);
  const gesture = useRef<Gesture | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const selection = selectedIds.filter((id) => page.strokes.some((stroke) => stroke.id === id) || page.textBoxes.some((box) => box.id === id));
  const backgroundUrl = useMemo(() => page.background ? URL.createObjectURL(page.background) : undefined, [page.background]);

  useEffect(() => () => { if (backgroundUrl) URL.revokeObjectURL(backgroundUrl); }, [backgroundUrl]);

  useEffect(() => {
    const pageId = page.id;
    return () => {
      const current = gesture.current;
      if (current?.type === "draw") onEdit(pageId, (data) => ({ ...data, strokes: [...data.strokes, current.stroke] }));
      if (current?.type === "erase" && current.removed.size) onEdit(pageId, (data) => ({ ...data, strokes: data.strokes.filter((stroke) => !current.removed.has(stroke.id)) }));
      gesture.current = null;
    };
  }, [onEdit, page.id]);

  const deleteSelection = useCallback(() => {
    if (!selection.length || gesture.current) return;
    onEdit(page.id, (current) => ({
      ...current,
      strokes: current.strokes.filter((stroke) => !selection.includes(stroke.id)),
      textBoxes: current.textBoxes.filter((box) => !selection.includes(box.id)),
    }));
    setSelectedIds([]);
  }, [onEdit, selection]);

  useEffect(() => {
    if (tool.type !== "lasso") return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.defaultPrevented || gesture.current || !(event.target instanceof HTMLElement) ||
        event.target.closest("input, textarea, select, [contenteditable]")) return;
      if ((event.key === "Backspace" || event.key === "Delete") && selection.length) {
        event.preventDefault();
        deleteSelection();
      } else if (event.key === "Escape") setSelectedIds([]);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [deleteSelection, selection.length, tool.type]);

  const paint = useCallback(() => {
    const element = canvas.current;
    const ctx = element?.getContext("2d");
    if (!element || !ctx) return;
    ctx.setTransform(element.width / pageWidth, 0, 0, element.height / pageHeight, 0, 0);
    ctx.clearRect(0, 0, pageWidth, pageHeight);
    const current = gesture.current;
    const selected = new Set(selection);
    for (const stroke of page.strokes) {
      if (current?.type === "erase" && current.removed.has(stroke.id)) continue;
      drawStroke(ctx, stroke, selected.has(stroke.id), current?.type === "move" && selected.has(stroke.id) ? current.offset : undefined);
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
  }, [page, selection]);

  useLayoutEffect(() => {
    const element = canvas.current;
    if (!element) return;
    const resize = () => {
      const { width, height } = element.getBoundingClientRect();
      const scale = window.devicePixelRatio || 1;
      element.width = Math.max(1, Math.round(width * scale));
      element.height = Math.max(1, Math.round(height * scale));
      paint();
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(element);
    return () => observer.disconnect();
  }, [paint]);

  function pointOnPage(event: PointerEvent<HTMLCanvasElement>): Point {
    const bounds = event.currentTarget.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(pageWidth, (event.clientX - bounds.left) * pageWidth / bounds.width)),
      y: Math.max(0, Math.min(pageHeight, (event.clientY - bounds.top) * pageHeight / bounds.height)),
    };
  }

  function eraseBetween(from: Point, to: Point, removed: Set<string>, radius: number) {
    for (const stroke of page.strokes) if (!removed.has(stroke.id) && hitsStroke(stroke, from, to, radius)) removed.add(stroke.id);
  }

  function startGesture(event: PointerEvent<HTMLCanvasElement>) {
    if (!event.isPrimary || event.button !== 0 || gesture.current) return;
    const point = pointOnPage(event);
    const base = { pointerId: event.pointerId, last: point };
    if (tool.type === "text") {
      const box: TextBox = { id: crypto.randomUUID(), x: point.x, y: point.y, width: 260, height: 78, text: "" };
      onEdit(page.id, (current) => ({ ...current, textBoxes: [...current.textBoxes, box] }));
      setTimeout(() => document.querySelector<HTMLTextAreaElement>(`textarea[data-text-box="${box.id}"]`)?.focus(), 0);
      return;
    }
    event.currentTarget.setPointerCapture(event.pointerId);
    if (tool.type === "pen" || tool.type === "pencil") {
      gesture.current = { ...base, type: "draw", stroke: { id: crypto.randomUUID(), tool: tool.type, color: tool.color, width: tool.width, points: [point] } };
    } else if (tool.type === "eraser") {
      const removed = new Set<string>();
      eraseBetween(point, point, removed, tool.radius);
      gesture.current = { ...base, type: "erase", removed, radius: tool.radius };
    } else if (tool.type === "pan") {
      gesture.current = { ...base, type: "pan", start: { x: event.clientX, y: event.clientY }, scrollLeft: scroll.current?.scrollLeft ?? 0, scrollTop: scroll.current?.scrollTop ?? 0 };
    } else if (tool.type === "lasso") {
      const selectedAtPoint = page.strokes.some((stroke) => selection.includes(stroke.id) && hitsStroke(stroke, point, point, 20)) ||
        page.textBoxes.some((box) => selection.includes(box.id) && point.x >= box.x && point.x <= box.x + box.width && point.y >= box.y && point.y <= box.y + box.height);
      if (selectedAtPoint) gesture.current = { ...base, type: "move", start: point, offset: { x: 0, y: 0 } };
      else {
        setSelectedIds([]);
        gesture.current = { ...base, type: "lasso", boundary: [point] };
      }
    }
    paint();
  }

  function updateGesture(event: PointerEvent<HTMLCanvasElement>) {
    const current = gesture.current;
    if (!current || current.pointerId !== event.pointerId) return;
    const point = pointOnPage(event);
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
    if (current.type === "erase") eraseBetween(current.last, point, current.removed, current.radius);
    if (current.type === "move") current.offset = { x: point.x - current.start.x, y: point.y - current.start.y };
    if (current.type === "move" && textLayer.current) {
      const rect = canvas.current?.getBoundingClientRect();
      if (rect) for (const id of selection) {
        const element = textLayer.current.querySelector<HTMLElement>(`[data-box-id="${id}"]`);
        if (element) element.style.transform = `translate(${current.offset.x * rect.width / pageWidth}px, ${current.offset.y * rect.height / pageHeight}px)`;
      }
    }
    current.last = point;
    paint();
  }

  function finishGesture(event: PointerEvent<HTMLCanvasElement>, cancel = false) {
    const current = gesture.current;
    if (!current || current.pointerId !== event.pointerId) return;
    if (!cancel) updateGesture(event);
    gesture.current = null;
    if (!cancel || current.type === "draw" || current.type === "erase") {
      if (current.type === "draw") onEdit(page.id, (data) => ({ ...data, strokes: [...data.strokes, current.stroke] }));
      if (current.type === "erase" && current.removed.size) onEdit(page.id, (data) => ({ ...data, strokes: data.strokes.filter((stroke) => !current.removed.has(stroke.id)) }));
      if (current.type === "lasso" && current.boundary.length >= 3) {
        setSelectedIds([
          ...page.strokes.filter((stroke) => caughtByLasso(stroke, current.boundary)).map((stroke) => stroke.id),
          ...page.textBoxes.filter((box) => caughtRectByLasso(box, current.boundary)).map((box) => box.id),
        ]);
      }
      if (current.type === "move" && (current.offset.x || current.offset.y)) {
        onEdit(page.id, (data) => ({
          ...data,
          strokes: data.strokes.map((stroke) => selection.includes(stroke.id) ? shiftStroke(stroke, current.offset) : stroke),
          textBoxes: data.textBoxes.map((box) => selection.includes(box.id) ? { ...box, x: box.x + current.offset.x, y: box.y + current.offset.y } : box),
        }));
      }
    }
    textLayer.current?.querySelectorAll<HTMLElement>(".text-box").forEach((element) => { element.style.transform = ""; });
    paint();
  }

  function updateTextBox(id: string, update: Partial<TextBox>) {
    onEdit(page.id, (data) => ({ ...data, textBoxes: data.textBoxes.map((box) => box.id === id ? { ...box, ...update } : box) }));
  }

  return <>
    {tool.type === "lasso" && <div className="lasso-bar">
      <span aria-live="polite">{selection.length ? `${selection.length} selected · Drag to move` : "Draw around strokes or text boxes to select them."}</span>
      {selection.length > 0 && <button type="button" className="editor-tool" aria-label="Delete selected objects" title="Delete selected objects" onClick={deleteSelection}><Trash2 size={18} /></button>}
    </div>}
    <div ref={scroll} className="paper-scroll">
      <div className="paper-zoom" style={{ "--zoom": zoom } as CSSProperties}>
        <div className={`editor-paper ${paper}`} style={paperStyle(paperSpacing)}>
          {backgroundUrl && <img className="page-background" src={backgroundUrl} alt="Imported page background" />}
          <div className="page-header-guides" aria-hidden="true" />
          <canvas ref={canvas} className={`ink-canvas tool-${tool.type}`} aria-label={`Drawing surface, page ${pageNumber}`}
            onPointerDown={startGesture} onPointerMove={updateGesture} onPointerUp={(event) => finishGesture(event)}
            onPointerCancel={(event) => finishGesture(event, true)} onLostPointerCapture={(event) => finishGesture(event, true)} />
          <div ref={textLayer} className={`text-layer ${tool.type === "text" ? "text-editing" : ""}`}>
            {page.textBoxes.map((box) => <div key={box.id} data-box-id={box.id} className={`text-box ${selection.includes(box.id) ? "text-selected" : ""}`}
              style={{ left: `${box.x / pageWidth * 100}%`, top: `${box.y / pageHeight * 100}%`, width: `${box.width / pageWidth * 100}%`, height: `${box.height / pageHeight * 100}%` }}>
              {tool.type === "text" ? <textarea data-text-box={box.id} aria-label="Note text box" value={box.text}
                onChange={(event) => updateTextBox(box.id, { text: event.currentTarget.value })}
                onBlur={(event) => {
                  const rect = event.currentTarget.getBoundingClientRect();
                  const paperRect = event.currentTarget.closest(".editor-paper")?.getBoundingClientRect();
                  if (paperRect?.width && paperRect.height) updateTextBox(box.id, {
                    width: rect.width * pageWidth / paperRect.width, height: rect.height * pageHeight / paperRect.height,
                  });
                }} /> : <div className="text-box-content">{box.text}</div>}
            </div>)}
          </div>
        </div>
      </div>
    </div>
  </>;
}
