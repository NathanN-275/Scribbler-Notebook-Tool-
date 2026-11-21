import { PDFDocument } from "pdf-lib";
import { drawStroke, pageHeight, pageWidth } from "./ink";
import type { Note, Page, PaperType } from "./notebooks";
import { paperPatternGap, paperSpacingFactor } from "./paper";
import { boxCenter } from "./selection";

export const maxUploadBytes = 20 * 1024 * 1024;

async function blobFromCanvas(canvas: HTMLCanvasElement) {
  return new Promise<Blob>((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("Couldn’t render this page.")), "image/png"));
}

function hasBytes(actual: Uint8Array, expected: number[]) {
  return expected.every((byte, index) => actual[index] === byte);
}

export async function prepareFilePages(file: File) {
  if (file.size > maxUploadBytes) throw new Error("File is larger than 20 MB.");
  const ext = file.name.toLowerCase().split(".").pop();
  const signature = new Uint8Array(await file.slice(0, 8).arrayBuffer());
  const pages: Blob[] = [];
  if (ext === "pdf" && new TextDecoder().decode(signature.slice(0, 5)) === "%PDF-") {
    const pdfjs = await import("pdfjs-dist");
    pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();
    const pdf = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
    for (let number = 1; number <= pdf.numPages; number++) {
      const page = await pdf.getPage(number);
      const viewport = page.getViewport({ scale: 1.5 });
      const canvas = document.createElement("canvas");
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      await page.render({ canvas, canvasContext: canvas.getContext("2d")!, viewport }).promise;
      pages.push(await blobFromCanvas(canvas));
    }
  } else if ((ext === "png" && hasBytes(signature, [137, 80, 78, 71, 13, 10, 26, 10])) ||
    ((ext === "jpg" || ext === "jpeg") && hasBytes(signature, [255, 216, 255]))) {
    pages.push(file.slice(0, file.size, ext === "png" ? "image/png" : "image/jpeg"));
  } else if (ext === "docx" && hasBytes(signature, [80, 75, 3, 4])) {
    const { renderAsync } = await import("docx-preview");
    const html2canvas = (await import("html2canvas")).default;
    const container = document.createElement("div");
    container.className = "docx-import-preview";
    Object.assign(container.style, { position: "fixed", left: "-100000px", top: "0", width: "816px", background: "white" });
    document.body.append(container);
    try {
      await renderAsync(file, container, container, { breakPages: true, ignoreLastRenderedPageBreak: false });
      const sections = Array.from(container.querySelectorAll<HTMLElement>("section.docx, .docx-wrapper > section"));
      if (!sections.length) throw new Error("This Word file did not contain renderable pages.");
      for (const section of sections) pages.push(await blobFromCanvas(await html2canvas(section, { scale: 1.5, backgroundColor: "#fffefa" })));
    } finally {
      container.remove();
    }
  } else {
    throw new Error("Use a PDF, DOCX, PNG, or JPEG file.");
  }
  if (!pages.length) throw new Error("This file did not contain any pages.");
  return pages;
}

function drawPaper(ctx: CanvasRenderingContext2D, paper: PaperType, spacing: number) {
  ctx.fillStyle = "#fffefa";
  ctx.fillRect(0, 0, pageWidth, pageHeight);
  if (paper === "plain") return;
  const gap = paperPatternGap * paperSpacingFactor(spacing);
  ctx.strokeStyle = "#d9e2e1";
  ctx.fillStyle = "#a7b9b1";
  ctx.lineWidth = 1;
  if (paper === "lined") {
    for (let y = 0; y < pageHeight; y += gap) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(pageWidth, y); ctx.stroke();
    }
  } else if (paper === "graph") {
    for (let x = 0; x < pageWidth; x += gap) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, pageHeight); ctx.stroke(); }
    for (let y = 0; y < pageHeight; y += gap) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(pageWidth, y); ctx.stroke(); }
  } else {
    for (let x = 0; x < pageWidth; x += gap) for (let y = 0; y < pageHeight; y += gap) {
      ctx.beginPath(); ctx.arc(x, y, 1.1, 0, Math.PI * 2); ctx.fill();
    }
  }
}

export async function renderPageBlob(note: Note, page: Page) {
  const canvas = document.createElement("canvas");
  canvas.width = pageWidth * 2;
  canvas.height = pageHeight * 2;
  const ctx = canvas.getContext("2d")!;
  ctx.scale(2, 2);
  drawPaper(ctx, note.paper, note.paperSpacing);
  if (page.background) {
    const image = new Image();
    const url = URL.createObjectURL(page.background);
    image.src = url;
    try {
      await new Promise<void>((resolve, reject) => { image.onload = () => resolve(); image.onerror = () => reject(new Error("Couldn’t render an imported page.")); });
      const ratio = Math.min(pageWidth / image.naturalWidth, pageHeight / image.naturalHeight);
      const width = image.naturalWidth * ratio;
      const height = image.naturalHeight * ratio;
      ctx.drawImage(image, (pageWidth - width) / 2, (pageHeight - height) / 2, width, height);
    } finally { URL.revokeObjectURL(url); }
  }
  page.strokes.forEach((stroke) => drawStroke(ctx, stroke, false));
  ctx.fillStyle = "#202b25";
  ctx.textBaseline = "top";
  page.textBoxes.forEach((box) => {
    if (!box.text.trim()) return;
    const center = boxCenter(box);
    const scale = box.textScale ?? 1;
    const padding = 7 * scale;
    const textWidth = box.width - 2 * padding;
    if (textWidth <= 0) return;
    ctx.save();
    ctx.translate(center.x, center.y);
    ctx.rotate(box.rotation ?? 0);
    ctx.beginPath();
    ctx.rect(-box.width / 2, -box.height / 2, box.width, box.height);
    ctx.clip();
    ctx.font = `${19 * scale}px Arial, sans-serif`;
    const lines = box.text.split("\n").flatMap((paragraph) => {
      const wrapped: string[] = [];
      let line = "";
      for (const word of paragraph.split(/\s+/)) {
        const candidate = line ? `${line} ${word}` : word;
        if (line && ctx.measureText(candidate).width > textWidth) { wrapped.push(line); line = word; }
        else line = candidate;
      }
      wrapped.push(line);
      return wrapped;
    });
    lines.forEach((line, index) => ctx.fillText(line, -box.width / 2 + padding, -box.height / 2 + padding + index * 24 * scale, textWidth));
    ctx.restore();
  });
  return blobFromCanvas(canvas);
}

export async function makePdf(note: Note, pages: Page[]) {
  const pdf = await PDFDocument.create();
  for (const page of pages) {
    const png = await pdf.embedPng(new Uint8Array(await (await renderPageBlob(note, page)).arrayBuffer()));
    const output = pdf.addPage([612, 795.6]);
    output.drawImage(png, { x: 0, y: 0, width: 612, height: 795.6 });
  }
  pdf.setTitle(note.name);
  pdf.setCreationDate(new Date(note.createdAt));
  pdf.setModificationDate(new Date(note.updatedAt));
  const bytes = new Uint8Array(await pdf.save());
  return new Blob([bytes.buffer as ArrayBuffer], { type: "application/pdf" });
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
