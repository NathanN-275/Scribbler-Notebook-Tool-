import { useAuth, UserButton } from "@clerk/nextjs";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Sparkles, X } from "lucide-react";
import { createAIContext, maxTutorMessageLength, type AIAttachment, type AIMessage, type AIProvider, type TutorUsage } from "../lib/ai-tutor";
import type { Note } from "../lib/notebooks";
import { AccountControls } from "./account-controls";

type TutorPanelProps = {
  open: boolean;
  note: Note;
  pageId: string;
  selection?: AIAttachment;
  provider: AIProvider;
  onRemoveSelection: () => void;
  onClose: () => void;
};

export function AITutorPanel(props: TutorPanelProps) {
  const { isLoaded, userId } = useAuth();
  const pathname = usePathname();
  const { open, onClose } = props;
  const closeButton = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (open && !userId) closeButton.current?.focus();
  }, [open, userId, isLoaded]);

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
      {userId && <UserButton />}
      <button ref={closeButton} type="button" className="editor-tool" aria-label="Close AI tutor" onClick={onClose}><X size={19} /></button>
    </div>
    {!isLoaded ? <p role="status" className="ai-notice">Loading account…</p> : userId
      ? <TutorConversation key={userId} {...props} />
      : <>
        <p className="ai-notice">Sign in or create an account to ask up to five questions in 24 hours.</p>
        <div className="ai-account-actions"><AccountControls returnTo={pathname} /></div>
      </>}
  </aside>;
}

function TutorConversation({ open, note, pageId, selection, provider, onRemoveSelection }: TutorPanelProps) {
  const [messages, setMessages] = useState<AIMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [pending, setPending] = useState<{ question: string; reply: string }>();
  const [error, setError] = useState("");
  const [liveConsentConfirmed, setLiveConsentConfirmed] = useState(false);
  const [usage, setUsage] = useState<TutorUsage>();
  const [usageError, setUsageError] = useState("");
  const [usageRequest, setUsageRequest] = useState(0);
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

  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();

    async function loadUsage() {
      try {
        const response = await fetch("/api/ai-tutor/usage", { signal: controller.signal, cache: "no-store" });
        if (!response.ok) {
          const { error } = await response.json();
          throw new Error(error);
        }
        const nextUsage: TutorUsage = await response.json();
        if (controller.signal.aborted) return;
        setUsage(nextUsage);
        setUsageError("");
      } catch (cause) {
        if (controller.signal.aborted) return;
        setUsage(undefined);
        setUsageError(cause instanceof Error ? cause.message : "Couldn’t load your tutor allowance.");
      }
    }

    void loadUsage();
    return () => controller.abort();
  }, [open, usageRequest]);

  const nextAvailableAt = usage?.nextAvailableAt;
  useEffect(() => {
    if (!open || !nextAvailableAt) return;
    const timer = window.setTimeout(() => setUsageRequest((value) => value + 1), Math.max(1000, nextAvailableAt - Date.now() + 100));
    return () => window.clearTimeout(timer);
  }, [open, nextAvailableAt]);

  async function sendQuestion(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const question = draft.trim();
    if (!question || activeRequest.current || !usage?.remaining) return;
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
      if (!request.signal.aborted) {
        setPending(undefined);
        setUsageRequest((value) => value + 1);
      }
    }
  }

  return <>
    <p className="ai-notice">{provider.requiresConsent
      ? "Your question and note pages are sent to Amazon Bedrock for an answer."
      : "Demo with sample replies. Your question and page count are sent to Scribbler. Note content stays in this browser."}</p>
    <div className="ai-notice" role="status">
      {usage ? <>
        <p>{usage.remaining} of {usage.limit} questions left</p>
        {usage.remaining === 0 && nextAvailableAt && <p>Next question available {new Date(nextAvailableAt).toLocaleString(undefined, {
          month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZoneName: "short",
        })}.</p>}
      </> : <p>{usageError || "Checking your tutor allowance…"}</p>}
    </div>
    {usageError && <button type="button" className="button button-outline" onClick={() => {
      setUsageError("");
      setUsageRequest((value) => value + 1);
    }}>Retry usage check</button>}
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
      <label className="field">Question<textarea ref={composer} value={draft} maxLength={maxTutorMessageLength} readOnly={!!pending}
        onChange={(event) => setDraft(event.currentTarget.value)} rows={2} placeholder="Ask about this note" /></label>
      {error && <p className="error-text" role="alert">{error}</p>}
      <button className="button button-primary" disabled={!draft.trim() || !!pending || !usage?.remaining}>Send question</button>
      <span className="visually-hidden" role="status">{pending ? provider.requiresConsent ? "Waiting for Nova Lite" : "Preparing a sample reply" : ""}</span>
    </form>
  </>;
}
