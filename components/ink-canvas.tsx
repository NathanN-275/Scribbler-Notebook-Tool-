"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type PointerEvent } from "react";
import { Trash2 } from "lucide-react";
import type { Page, PaperType, Point, Stroke } from "../lib/notebooks";
import { caughtByLasso, drawStroke, hitsStroke, pageHeight, pageWidth, shiftStroke } from "../lib/ink";

export type DrawingTool =
  | { type: "pen" | "pencil"; color: string; width: number }
  | { type: "eraser"; radius: number }
  | { type: "lasso" };

type Gesture = { pointerId: number; last: Point } & (
  | { type: "draw"; stroke: Stroke }
  | { type: "erase"; removed: Set<string>; radius: number }
  | { type: "lasso"; boundary: Point[] }
  | { type: "move"; start: Point; offset: Point }
);

export function InkCanvas({ page, pageNumber, paper, tool, onEdit }: {
  page: Page;
  pageNumber: number;
  paper: PaperType;
  tool: DrawingTool;
  onEdit: (strokes: Stroke[]) => void;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const gesture = useRef<Gesture | null>(null);
  const [selectedIds, setSelection] = useState<string[]>([]);
  const selection = selectedIds.filter((id) => page.strokes.some((stroke) => stroke.id === id));

  const deleteSelection = useCallback(() => {
    if (!selectedIds.length || gesture.current) return;
    const remaining = page.strokes.filter((stroke) => !selectedIds.includes(stroke.id));
    if (remaining.length !== page.strokes.length) onEdit(remaining);
    setSelection([]);
  }, [page, selectedIds, onEdit]);

  useEffect(() => {
    if (tool.type !== "lasso") return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.defaultPrevented || gesture.current || !(event.target instanceof HTMLElement) ||
        event.target.closest("input, textarea, select, [contenteditable]")) return;
      if ((event.key === "Backspace" || event.key === "Delete") && selectedIds.length) {
        event.preventDefault();
        deleteSelection();
      } else if (event.key === "Escape") {
        setSelection([]);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [deleteSelection, selectedIds.length, tool.type]);

  const paint = useCallback(() => {
    const element = canvas.current;
    const ctx = element?.getContext("2d");
    if (!element || !ctx) return;
    ctx.setTransform(element.width / pageWidth, 0, 0, element.height / pageHeight, 0, 0);
    ctx.clearRect(0, 0, pageWidth, pageHeight);
    const current = gesture.current;
    const selected = new Set(selectedIds);
    for (const stroke of page.strokes) {
      if (current?.type === "erase" && current.removed.has(stroke.id)) continue;
      const isSelected = selected.has(stroke.id);
      drawStroke(ctx, stroke, isSelected, current?.type === "move" && isSelected ? current.offset : undefined);
    }
    if (current?.type === "draw") drawStroke(ctx, current.stroke, false);
    if (current?.type === "lasso") {
      ctx.beginPath();
      for (const [index, point] of current.boundary.entries()) {
        if (index === 0) ctx.moveTo(point.x, point.y);
        else ctx.lineTo(point.x, point.y);
      }
      ctx.closePath();
      ctx.fillStyle = "rgba(59, 133, 98, .12)";
      ctx.fill();
      ctx.strokeStyle = "#397c5a";
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 4]);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }, [page, selectedIds]);

  useLayoutEffect(() => {
    const element = canvas.current;
    if (!element) return;
    function resize() {
      if (!element) return;
      const { width, height } = element.getBoundingClientRect();
      const scale = window.devicePixelRatio || 1;
      const w = Math.max(1, Math.round(width * scale));
      const h = Math.max(1, Math.round(height * scale));
      if (element.width !== w) element.width = w;
      if (element.height !== h) element.height = h;
      paint();
    }
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
    for (const stroke of page.strokes) {
      if (!removed.has(stroke.id) && hitsStroke(stroke, from, to, radius)) removed.add(stroke.id);
    }
  }

  function startGesture(event: PointerEvent<HTMLCanvasElement>) {
    if (!event.isPrimary || event.button !== 0 || gesture.current) return;
    const point = pointOnPage(event);
    const base = { pointerId: event.pointerId, last: point };
    event.currentTarget.setPointerCapture(event.pointerId);
    if (tool.type === "pen" || tool.type === "pencil") {
      gesture.current = { ...base, type: "draw", stroke: {
        id: crypto.randomUUID(), tool: tool.type, color: tool.color, width: tool.width, points: [point],
      } };
    } else if (tool.type === "eraser") {
      const removed = new Set<string>();
      eraseBetween(point, point, removed, tool.radius);
      gesture.current = { ...base, type: "erase", removed, radius: tool.radius };
    } else if (tool.type === "lasso") {
      const selectedStroke = page.strokes.some((stroke) => selection.includes(stroke.id) && hitsStroke(stroke, point, point, 20));
      if (selectedStroke) {
        gesture.current = { ...base, type: "move", start: point, offset: { x: 0, y: 0 } };
      } else {
        setSelection([]);
        gesture.current = { ...base, type: "lasso", boundary: [point] };
      }
    }
    paint();
  }

  function updateGesture(event: PointerEvent<HTMLCanvasElement>) {
    const current = gesture.current;
    if (!current || current.pointerId !== event.pointerId) return;
    const point = pointOnPage(event);
    if (point.x === current.last.x && point.y === current.last.y) return;
    if (current.type === "draw") current.stroke.points.push(point);
    if (current.type === "lasso") current.boundary.push(point);
    if (current.type === "erase") eraseBetween(current.last, point, current.removed, current.radius);
    if (current.type === "move") current.offset = { x: point.x - current.start.x, y: point.y - current.start.y };
    current.last = point;
    paint();
  }

  function finishGesture(event: PointerEvent<HTMLCanvasElement>, cancel = false) {
    const current = gesture.current;
    if (!current || current.pointerId !== event.pointerId) return;
    if (!cancel) updateGesture(event);
    gesture.current = null;
    if (!cancel) {
      if (current.type === "draw") onEdit([...page.strokes, current.stroke]);
      if (current.type === "erase" && current.removed.size) onEdit(page.strokes.filter((stroke) => !current.removed.has(stroke.id)));
      if (current.type === "lasso" && current.boundary.length >= 3) {
        setSelection(page.strokes.filter((stroke) => caughtByLasso(stroke, current.boundary)).map((stroke) => stroke.id));
      }
      if (current.type === "move" && (current.offset.x || current.offset.y)) {
        onEdit(page.strokes.map((stroke) => selection.includes(stroke.id) ? shiftStroke(stroke, current.offset) : stroke));
      }
    }
    paint();
  }

  return (
    <>
      {tool.type === "lasso" && <div className="lasso-bar">
        <span aria-live="polite">{selection.length ? `${selection.length} selected · Drag the ink to move it` : "Draw around the strokes you want to select."}</span>
        {selection.length > 0 && <button type="button" className="editor-tool" aria-label="Delete selected strokes" title="Delete selected strokes" onClick={deleteSelection}><Trash2 size={18} /></button>}
      </div>}
      <div className="paper-scroll">
        <div className={`editor-paper ${paper}`}>
          <canvas
            ref={canvas}
            className={`ink-canvas tool-${tool.type}`}
            aria-label={`Drawing surface, page ${pageNumber}`}
            onPointerDown={startGesture}
            onPointerMove={updateGesture}
            onPointerUp={(event) => finishGesture(event)}
            onPointerCancel={(event) => finishGesture(event, true)}
            onLostPointerCapture={(event) => finishGesture(event, true)}
          />
        </div>
      </div>
    </>
  );
}
