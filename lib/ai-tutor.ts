import type { Note, Page } from "./notebooks";
import type { PageItems } from "./selection";

export type AIAttachment = { pageId: string; items: PageItems };

export type AIContext = {
  note: Pick<Note, "id" | "name" | "paper" | "paperSpacing">;
  currentPageId: string;
  pages: { number: number; page: Page }[];
  selection?: AIAttachment;
};

export type AIMessage = { role: "user" | "assistant"; content: string };
export type AIRequest = { context: AIContext; messages: readonly AIMessage[] };

export interface AIProvider {
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
  async *streamReply({ context }, signal) {
    const selectionPage = context.pages.find(({ page }) => page.id === context.selection?.pageId);
    const pageCount = context.pages.length;
    const scope = pageCount === 1 ? "The open note has one page." : `The open note has ${pageCount} pages.`;
    const focus = selectionPage ? ` Your selection on page ${selectionPage.number} is attached.` : "";
    const reply = `${scope}${focus} A live tutor could use this context to answer your question.`;
    for (const [index, word] of reply.split(" ").entries()) {
      await new Promise<void>((resolve) => setTimeout(resolve, 45));
      signal.throwIfAborted();
      yield index === 0 ? word : ` ${word}`;
    }
  },
};
