import { BedrockRuntimeClient, ConverseStreamCommand, type ContentBlock } from "@aws-sdk/client-bedrock-runtime";
import { awsCredentialsProvider } from "@vercel/oidc-aws-credentials-provider";
import { auth } from "@clerk/nextjs/server";
import { maxTutorMessageLength, type AIMessage } from "../../../lib/ai-tutor";
import { tutorQuota } from "../../../lib/tutor-quota";

export const runtime = "nodejs";
export const maxDuration = 60;

const maxBodyBytes = 4_000_000;
const maxImageCharacters = 3_000_000;
const modelId = "amazon.nova-lite-v1:0";
const maxReplyTokens = 256;
const tutorInstructions = [
  "You are Scribbler's study tutor. Lead with the answer unless the learner asks for a hint.",
  "For simple questions such as basic arithmetic, answer in one short line unless the learner asks to see the work.",
  "For questions that need reasoning, show only the steps needed to understand the answer. Skip greetings, repetition, and closing offers.",
  "Use the supplied note pages as evidence and cite the relevant page numbers. Say when the note does not contain enough information.",
].join(" ");

type EncodedPage = { number: number; image: string };
type TutorPayload = {
  noteName: string;
  currentPageNumber: number;
  pages: EncodedPage[];
  selection?: EncodedPage;
  messages: AIMessage[];
};
type DemoPayload = { question: string; pageCount: number; selectionPage?: number };
const noStore = { "Cache-Control": "no-store" };
const replyHeaders = { ...noStore, "Content-Type": "text/plain; charset=utf-8" };

function isValidDemoPayload(value: unknown): value is DemoPayload {
  if (!value || typeof value !== "object") return false;
  const { question, pageCount, selectionPage } = value as DemoPayload;
  return typeof question === "string" && question.trim().length > 0 && question.length <= maxTutorMessageLength &&
    Number.isSafeInteger(pageCount) && pageCount > 0 &&
    (selectionPage === undefined || (Number.isSafeInteger(selectionPage) && selectionPage > 0 && selectionPage <= pageCount));
}

function isValidPayload(value: unknown): value is TutorPayload {
  if (!value || typeof value !== "object") return false;
  const payload = value as Partial<TutorPayload>;
  return typeof payload.noteName === "string" && payload.noteName.length <= 200 &&
    Number.isInteger(payload.currentPageNumber) && (payload.currentPageNumber ?? 0) > 0 && Array.isArray(payload.pages) &&
    payload.pages.length >= 1 && payload.pages.length <= 8 && Array.isArray(payload.messages) &&
    payload.messages.length >= 1 && payload.messages.length <= 20 &&
    payload.messages[0]?.role === "user" && payload.messages[payload.messages.length - 1]?.role === "user" &&
    !payload.messages.some((message) => !message || !["user", "assistant"].includes(message.role) ||
      typeof message.content !== "string" || message.content.length > maxTutorMessageLength ||
      (message.role === "user" && !message.content.trim())) &&
    !payload.pages.some((page) => !isEncodedPage(page)) &&
    new Set(payload.pages.map((page) => page.number)).size === payload.pages.length &&
    payload.pages.some((page) => page.number === payload.currentPageNumber) &&
    (payload.selection === undefined || isEncodedPage(payload.selection));
}

function isEncodedPage(value: unknown): value is EncodedPage {
  if (!value || typeof value !== "object") return false;
  const page = value as Partial<EncodedPage>;
  return Number.isInteger(page.number) && (page.number ?? 0) > 0 && typeof page.image === "string" &&
    page.image.length > 0 && page.image.length <= maxImageCharacters &&
    page.image.length % 4 === 0 && /^[A-Za-z0-9+/]+={0,2}$/.test(page.image);
}

async function checkQuota(userId: string) {
  try {
    const { accepted, usage } = await tutorQuota(userId, true);
    if (accepted) return;
    const retryAfter = Math.max(1, Math.ceil(((usage.nextAvailableAt ?? Date.now()) - Date.now()) / 1000));
    return Response.json({ error: "You’ve used all five tutor questions.", usage }, {
      status: 429,
      headers: { ...noStore, "Retry-After": String(retryAfter) },
    });
  } catch {
    return Response.json({ error: "The tutor question limit is temporarily unavailable." }, { status: 503, headers: noStore });
  }
}

export async function POST(request: Request) {
  const { userId } = await auth();
  if (!userId) return Response.json({ error: "Sign in to use the AI tutor." }, { status: 401, headers: noStore });

  const live = process.env.NEXT_PUBLIC_AI_TUTOR_MODE === "live";
  if (live && (process.env.VERCEL_ENV !== "preview" || process.env.AI_TUTOR_ENABLED !== "true")) {
    return Response.json({ error: "The live AI tutor is not enabled yet." }, { status: 503 });
  }
  if (request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json") {
    return Response.json({ error: "Tutor requests must use JSON." }, { status: 415 });
  }
  const bodyLimit = live ? maxBodyBytes : 20_000;
  if (Number(request.headers.get("content-length") ?? 0) > bodyLimit) {
    return Response.json({ error: "The note is too large to send." }, { status: 413 });
  }
  let rawBody: string;
  try {
    rawBody = await request.text();
  } catch {
    return Response.json({ error: "The request could not be read." }, { status: 400 });
  }
  if (Buffer.byteLength(rawBody, "utf8") > bodyLimit) {
    return Response.json({ error: "The note is too large to send." }, { status: 413 });
  }
  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return Response.json({ error: "The request could not be read." }, { status: 400 });
  }

  if (!live) {
    if (!isValidDemoPayload(payload)) return Response.json({ error: "The tutor request is invalid." }, { status: 400 });
    const { pageCount, selectionPage } = payload;
    const scope = pageCount === 1 ? "The open note has one page." : `The open note has ${pageCount} pages.`;
    const focus = selectionPage ? ` Your selection is on page ${selectionPage}.` : "";
    return new Response(`${scope}${focus} A live tutor could use this context to answer your question.`, { headers: replyHeaders });
  }

  if (!isValidPayload(payload)) {
    return Response.json({ error: "The tutor request is invalid or too large." }, { status: 400 });
  }

  const region = process.env.AWS_REGION;
  const roleArn = process.env.AWS_ROLE_ARN;
  if (!region || !roleArn) {
    return Response.json({ error: "Bedrock access is not configured yet." }, { status: 503 });
  }

  const blocked = await checkQuota(userId);
  if (blocked) return blocked;

  try {
    const client = new BedrockRuntimeClient({
      region,
      credentials: awsCredentialsProvider({ roleArn }),
    });
    const pages = [...payload.pages].sort((a, b) => a.number - b.number);
    const imageContent: ContentBlock[] = [
      { text: `Open note: "${payload.noteName}". Current page: ${payload.currentPageNumber}.` },
      ...pages.flatMap(({ number, image }) => [
        { text: `Page ${number} of the open note:` },
        { image: { format: "jpeg" as const, source: { bytes: Buffer.from(image, "base64") } } },
      ]),
    ];
    if (payload.selection) {
      imageContent.push(
        { text: `The user's lasso selection from page ${payload.selection.number}:` },
        { image: { format: "jpeg" as const, source: { bytes: Buffer.from(payload.selection.image, "base64") } } },
      );
    }

    const messages = payload.messages.map((message, index) => ({
      role: message.role,
      content: index === payload.messages.length - 1 && message.role === "user"
        ? [...imageContent, { text: message.content }]
        : [{ text: message.content }],
    }));
    const result = await client.send(new ConverseStreamCommand({
      modelId,
      system: [{ text: tutorInstructions }],
      messages,
      inferenceConfig: { maxTokens: maxReplyTokens, temperature: 0.3 },
    }), { abortSignal: request.signal });

    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        try {
          for await (const event of result.stream ?? []) {
            const text = event.contentBlockDelta?.delta?.text;
            if (text) controller.enqueue(encoder.encode(text));
            const error = event.modelStreamErrorException ?? event.internalServerException ?? event.throttlingException ?? event.validationException;
            if (error) throw new Error(error.message ?? "The model stream failed.");
          }
          controller.close();
        } catch {
          controller.error(new Error("The model stream failed."));
        }
      },
    });
    return new Response(stream, { headers: replyHeaders });
  } catch {
    return Response.json({ error: "Bedrock could not answer. Check the AWS role, Region, and model access." }, { status: 502 });
  }
}
