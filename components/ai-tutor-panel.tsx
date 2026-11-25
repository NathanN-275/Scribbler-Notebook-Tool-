import { useEffect, useRef, useState, type FormEvent } from "react";
import { Sparkles, X } from "lucide-react";
import { createAIContext, maxTutorMessageLength, type AIAttachment, type AIMessage, type AIProvider } from "../lib/ai-tutor";
import type { Note } from "../lib/notebooks";

export function AITutorPanel({ open, note, pageId, selection, provider, onRemoveSelection, onClose }: {
  open: boolean;
  note: Note;
  pageId: string;
  selection?: AIAttachment;
  provider: AIProvider;
  onRemoveSelection: () => void;
  onClose: () => void;
}) {
  const [messages, setMessages] = useState<AIMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [pending, setPending] = useState<{ question: string; reply: string }>();
  const [error, setError] = useState("");
  const [liveConsentConfirmed, setLiveConsentConfirmed] = useState(false);
  const composer = useRef<HTMLTextAreaElement>(null);
  const transcript = useRef<HTMLDivElement>(null);
  const activeRequest = useRef<AbortController | null>(null);
  const selectionPage = selection ? note.pages.findIndex((page) => page.id === selection.pageId) + 1 : 0;

  useEffect(() => {
    if (open) composer.current?.focus();
  }, [open, selection]);

  useEffect(() => {
    if (open && transcript.current) transcript.current.scrollTop = transcript.current.scrollHeight;
  }, [messages, open, pending]);

  useEffect(() => () => activeRequest.current?.abort(), []);

  async function sendQuestion(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const question = draft.trim();
    if (!question || activeRequest.current) return;
    if (provider.requiresConsent && !liveConsentConfirmed) {
      const accepted = window.confirm("Send your question and the pages in this note to Amazon Bedrock for an AI answer?");
      if (!accepted) return;
      setLiveConsentConfirmed(true);
    }

    const request = new AbortController();
    activeRequest.current = request;
    const nextMessages: AIMessage[] = [...messages, { role: "user", content: question }];
    setError("");
    setPending({ question, reply: "" });
    composer.current?.focus();

    try {
      const context = createAIContext(note, pageId, selection);
      let reply = "";
      for await (const chunk of provider.streamReply({ context, messages: nextMessages }, request.signal)) {
        if (request.signal.aborted) return;
        reply += chunk;
        setPending({ question, reply });
      }
      if (request.signal.aborted) return;
      if (!reply.trim()) throw new Error("Empty tutor reply");
      setMessages([...nextMessages, { role: "assistant", content: reply }]);
      setDraft("");
    } catch (cause) {
      if (!request.signal.aborted) setError(cause instanceof Error ? cause.message : "The tutor couldn’t answer. Try again.");
    } finally {
      activeRequest.current = null;
      if (!request.signal.aborted) setPending(undefined);
    }
  }

  return <aside className="ai-panel" id="ai-panel" aria-labelledby="ai-title" hidden={!open}
    onKeyDown={(event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        onClose();
      }
    }}>
    <div className="ai-panel-title">
      <Sparkles size={19} aria-hidden="true" /><h2 id="ai-title">AI tutor</h2>
      <button type="button" className="editor-tool" aria-label="Close AI tutor" onClick={onClose}><X size={19} /></button>
    </div>
    <p className="ai-notice">{provider.requiresConsent
      ? "Your question and note pages are sent to Amazon Bedrock for an answer."
      : "Demo with sample replies. Your notes and questions stay in this browser."}</p>
    <div className="ai-transcript" ref={transcript} tabIndex={0} aria-label="Tutor conversation">
      <div role="log" aria-label="Messages">
        {messages.map(({ role, content }, index) => <div className={`ai-message ai-message-${role}`} key={index}>
          <strong>{role === "user" ? "You" : provider.requiresConsent ? "Nova Lite" : "Sample reply"}</strong>
          <p>{content}</p>
        </div>)}
      </div>
      {pending && <>
        <div className="ai-message ai-message-user"><strong>You</strong><p>{pending.question}</p></div>
        <div className="ai-message ai-message-assistant" aria-hidden="true"><strong>{provider.requiresConsent ? "Nova Lite" : "Sample reply"}</strong>
          <p>{pending.reply || (provider.requiresConsent ? "Connecting to Nova Lite…" : "Preparing a sample reply…")}</p>
        </div>
      </>}
    </div>
    <form className="ai-composer" onSubmit={(event) => void sendQuestion(event)}>
      <div className="ai-context">
        <p>{note.pages.length === 1 ? "1 page in this note" : `${note.pages.length} pages in this note`}</p>
        {selection && selectionPage > 0 && <div className="ai-attachment">
          <span>Lasso selection · Page {selectionPage}</span>
          <button type="button" className="editor-tool" aria-label="Remove lasso selection" onClick={onRemoveSelection}><X size={15} /></button>
        </div>}
      </div>
      <label className="field">Question<textarea ref={composer} value={draft} maxLength={provider.requiresConsent ? maxTutorMessageLength : undefined} readOnly={!!pending}
        onChange={(event) => setDraft(event.currentTarget.value)} rows={2} placeholder="Ask about this note" /></label>
      {error && <p className="error-text" role="alert">{error}</p>}
      <button className="button button-primary" disabled={!draft.trim() || !!pending}>Send question</button>
      <span className="visually-hidden" role="status">{pending ? provider.requiresConsent ? "Waiting for Nova Lite" : "Preparing a sample reply" : ""}</span>
    </form>
  </aside>;
}
