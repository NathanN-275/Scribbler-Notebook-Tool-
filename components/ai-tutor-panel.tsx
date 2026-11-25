import { useAuth, UserButton } from "@clerk/nextjs";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { GripVertical, Sparkles, X } from "lucide-react";
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
  const dock = useRef<HTMLDivElement>(null);
  const dragStart = useRef<{ x: number; width: number } | null>(null);
  const [preferredWidth, setPreferredWidth] = useState(330);
  const [availableWidth, setAvailableWidth] = useState<number>();
  const maxWidth = availableWidth === undefined ? 720 : Math.min(720, availableWidth > 700 ? availableWidth - 320 : availableWidth);
  const minWidth = Math.min(280, maxWidth);

  function clampWidth(width: number) {
    return Math.min(maxWidth, Math.max(minWidth, width));
  }

  const width = clampWidth(preferredWidth);

  useEffect(() => {
    const workspace = dock.current?.parentElement;
    if (!workspace) return;
    const observer = new ResizeObserver(() => setAvailableWidth(workspace.clientWidth));
    observer.observe(workspace);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (open && !userId) closeButton.current?.focus();
  }, [open, userId, isLoaded]);

  function resizeWithKeyboard(event: KeyboardEvent<HTMLDivElement>) {
    let nextWidth;
    switch (event.key) {
      case "ArrowLeft": nextWidth = width + 24; break;
      case "ArrowRight": nextWidth = width - 24; break;
      case "Home": nextWidth = minWidth; break;
      case "End": nextWidth = maxWidth; break;
      default: return;
    }
    event.preventDefault();
    setPreferredWidth(clampWidth(nextWidth));
  }

  return <div ref={dock} className="ai-panel-dock" hidden={!open} style={{ width: `min(100%, ${width}px)` }}
    onKeyDown={(event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        onClose();
      }
    }}>
    <div className="ai-panel-resize" role="separator" tabIndex={0} aria-label="AI tutor width"
      aria-orientation="vertical" aria-controls="ai-panel" aria-valuemin={minWidth} aria-valuemax={maxWidth} aria-valuenow={width}
      onKeyDown={resizeWithKeyboard}
      onPointerDown={(event) => {
        if (!event.isPrimary || event.button !== 0) return;
        dragStart.current = { x: event.clientX, width };
        event.currentTarget.setPointerCapture(event.pointerId);
      }}
      onPointerMove={(event) => {
        const start = dragStart.current;
        if (!start || !event.currentTarget.hasPointerCapture(event.pointerId)) return;
        setPreferredWidth(clampWidth(start.width + start.x - event.clientX));
      }}
      onLostPointerCapture={() => { dragStart.current = null; }}>
      <GripVertical size={16} aria-hidden="true" />
    </div>
    <aside className="ai-panel" id="ai-panel" aria-labelledby="ai-title">
      <div className="ai-panel-title">
        <Sparkles size={19} aria-hidden="true" /><h2 id="ai-title">AI tutor</h2>
        {userId && <UserButton />}
        <button ref={closeButton} type="button" className="editor-tool" aria-label="Close AI tutor" onClick={onClose}><X size={19} /></button>
      </div>
      {!isLoaded ? <p role="status" className="ai-notice">Loading account…</p> : userId
        ? <TutorConversation key={userId} {...props} />
        : <>
          <p className="ai-notice">Sign in or create an account to use the AI tutor.</p>
          <div className="ai-account-actions"><AccountControls returnTo={pathname} /></div>
        </>}
    </aside>
  </div>;
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
  const live = provider.requiresConsent === true;
  const canSend = !live || (usage?.remaining ?? 0) > 0;
  const sendDisabled = !draft.trim() || !!pending || !canSend;
  const selectionPage = selection ? note.pages.findIndex((page) => page.id === selection.pageId) + 1 : 0;

  useEffect(() => {
    if (open) composer.current?.focus();
  }, [open, selection]);

  useEffect(() => {
    if (open && transcript.current) transcript.current.scrollTop = transcript.current.scrollHeight;
  }, [messages, open, pending]);

  useEffect(() => () => activeRequest.current?.abort(), []);

  useEffect(() => {
    if (!open || !live) return;
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
  }, [live, open, usageRequest]);

  const nextAvailableAt = usage?.nextAvailableAt;
  useEffect(() => {
    if (!open || !live || !nextAvailableAt) return;
    const timer = window.setTimeout(() => setUsageRequest((value) => value + 1), Math.max(1000, nextAvailableAt - Date.now() + 100));
    return () => window.clearTimeout(timer);
  }, [live, open, nextAvailableAt]);

  async function sendQuestion(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const question = draft.trim();
    if (!question || activeRequest.current || !canSend) return;
    if (live && !liveConsentConfirmed) {
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
        if (live) setUsageRequest((value) => value + 1);
      }
    }
  }

  return <>
    <p className="ai-notice">{live
      ? "Your question and note pages are sent to Amazon Bedrock for an answer."
      : "Sample replies don’t use your live tutor allowance. Your question and page count are sent to Scribbler. Note content stays in this browser."}</p>
    {live && <>
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
    </>}
    <div className="ai-transcript" ref={transcript} tabIndex={0} aria-label="Tutor conversation">
      <div role="log" aria-label="Messages">
        {messages.map(({ role, content }, index) => <div className={`ai-message ai-message-${role}`} key={index}>
          <strong>{role === "user" ? "You" : live ? "Nova Lite" : "Sample reply"}</strong>
          <p>{content}</p>
        </div>)}
      </div>
      {pending && <>
        <div className="ai-message ai-message-user"><strong>You</strong><p>{pending.question}</p></div>
        <div className="ai-message ai-message-assistant" aria-hidden="true"><strong>{live ? "Nova Lite" : "Sample reply"}</strong>
          <p>{pending.reply || (live ? "Connecting to Nova Lite…" : "Preparing a sample reply…")}</p>
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
        onChange={(event) => setDraft(event.currentTarget.value)}
        onKeyDown={(event) => {
          if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) return;
          event.preventDefault();
          if (!event.repeat && !sendDisabled) event.currentTarget.form?.requestSubmit();
        }} rows={2} placeholder="Ask about this note" /></label>
      {error && <p className="error-text" role="alert">{error}</p>}
      <button type="submit" className="button button-primary" disabled={sendDisabled}>Send question</button>
      <span className="visually-hidden" role="status">{pending ? live ? "Waiting for Nova Lite" : "Preparing a sample reply" : ""}</span>
    </form>
  </>;
}
