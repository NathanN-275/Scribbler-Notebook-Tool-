import type { Note, Page } from "./notebooks";
import type { PageItems } from "./selection";

export type AIAttachment = { pageId: string; items: PageItems };

export type AIContext = {
  note: Pick<Note, "id" | "name" | "paper" | "paperSpacing">;
  currentPageId: string;
  pages: { number: number; page: Page }[];
  selection?: AIAttachment;
};

export const maxTutorMessageLength = 3000;
export const maxTutorReplyHistoryLength = 8000;

export type AIMessage = { role: "user" | "assistant"; content: string };
export type AIRequest = { context: AIContext; messages: readonly AIMessage[] };
export type TutorUsage = { limit: number; remaining: number; nextAvailableAt: number | null };

export interface AIProvider {
  requiresConsent?: boolean;
  streamReply(request: AIRequest, signal: AbortSignal): AsyncIterable<string>;
}

export function createAIContext(note: Note, currentPageId: string, selection?: AIAttachment): AIContext {
  const { id, name, paper, paperSpacing } = note;
  return {
    note: { id, name, paper, paperSpacing },
    currentPageId,
    pages: note.pages.map((page, index) => ({ number: index + 1, page })),
    selection: selection && note.pages.some((page) => page.id === selection.pageId) ? selection : undefined,
  };
}

export const mockAIProvider: AIProvider = {
  async *streamReply({ context, messages }, signal) {
    const selectionPage = context.pages.find(({ page }) => page.id === context.selection?.pageId)?.number;
    yield* streamTutorReply(JSON.stringify({
      question: messages.at(-1)?.content,
      pageCount: context.pages.length,
      selectionPage,
    }), signal);
  },
};

const maxRequestCharacters = 3_500_000;

async function imageData(blob: Blob) {
  const bitmap = await createImageBitmap(blob);
  const canvas = document.createElement("canvas");
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0);
  bitmap.close();
  const jpeg = await new Promise<Blob>((resolve, reject) => canvas.toBlob((value) => value ? resolve(value) : reject(new Error("Couldn’t prepare a note page.")), "image/jpeg", 0.78));
  const bytes = new Uint8Array(await jpeg.arrayBuffer());
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  }
  return btoa(binary);
}

export const bedrockAIProvider: AIProvider = {
  requiresConsent: true,
  async *streamReply({ context, messages }, signal) {
    const { renderPageBlob } = await import("./files");
    const recentMessages = messages.slice(-19).map(({ role, content }) => ({
      role,
      content: content.slice(0, role === "assistant" ? maxTutorReplyHistoryLength : maxTutorMessageLength),
    }));
    const numberedPages = context.pages;
    const currentPage = numberedPages.find(({ page }) => page.id === context.currentPageId);
    if (!currentPage) throw new Error("Couldn’t find the current note page.");
    const currentPageNumber = currentPage.number;
    let pagesToSend = numberedPages;
    if (numberedPages.length > 8) {
      if (!window.confirm("This note has more than 8 pages. Send only the current page to Nova Lite?")) {
        throw new Error("No pages were sent.");
      }
      pagesToSend = [currentPage];
    }

    async function makeBody(selectedPages: typeof numberedPages) {
      const selectionPage = context.selection && selectedPages.find(({ page }) => page.id === context.selection?.pageId);
      const pages = await Promise.all(selectedPages.map(async ({ number, page }) => ({
        number,
        image: await imageData(await renderPageBlob(context.note, page, 1)),
      })));
      const selection = context.selection && selectionPage ? {
        number: selectionPage.number,
        image: await imageData(await renderPageBlob(
          context.note,
          { ...selectionPage.page, background: undefined, strokes: context.selection.items.strokes, textBoxes: context.selection.items.textBoxes },
          1,
        )),
      } : undefined;
      return JSON.stringify({ noteName: context.note.name, currentPageNumber, pages, selection, messages: recentMessages });
    }
    let body = await makeBody(pagesToSend);
    if (body.length > maxRequestCharacters && pagesToSend.length > 1) {
      const accepted = window.confirm("These pages are too large to send together. Send only the current page to Nova Lite?");
      if (!accepted) throw new Error("No pages were sent.");
      body = await makeBody([currentPage]);
    }
    if (body.length > maxRequestCharacters) throw new Error("This page is too large to send to Nova Lite.");

    yield* streamTutorReply(body, signal);
  },
};

async function* streamTutorReply(body: string, signal: AbortSignal) {
  const response = await fetch("/api/ai-tutor", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
    signal,
  });
  if (!response.ok) {
    const result = await response.json().catch(() => undefined) as { error?: string } | undefined;
    throw new Error(result?.error ?? "The tutor couldn’t answer. Try again later.");
  }
  if (!response.body) throw new Error("The tutor returned no response.");

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    const text = decoder.decode(value, { stream: true });
    if (text) yield text;
  }
  const last = decoder.decode();
  if (last) yield last;
}
