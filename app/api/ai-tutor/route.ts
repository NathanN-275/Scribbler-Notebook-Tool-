import { BedrockRuntimeClient, ConverseStreamCommand, type ContentBlock } from "@aws-sdk/client-bedrock-runtime";
import { awsCredentialsProvider } from "@vercel/oidc-aws-credentials-provider";
import { maxTutorMessageLength, type AIMessage } from "../../../lib/ai-tutor";

export const runtime = "nodejs";
export const maxDuration = 60;

const maxBodyBytes = 4_000_000;
const maxImageCharacters = 3_000_000;
const modelId = "amazon.nova-lite-v1:0";

type EncodedPage = { number: number; image: string };
type TutorPayload = {
  noteName: string;
  currentPageNumber: number;
  pages: EncodedPage[];
  selection?: EncodedPage;
  messages: AIMessage[];
};

function isValidPayload(value: unknown): value is TutorPayload {
  if (!value || typeof value !== "object") return false;
  const payload = value as Partial<TutorPayload>;
  return typeof payload.noteName === "string" && payload.noteName.length <= 200 &&
    Number.isInteger(payload.currentPageNumber) && (payload.currentPageNumber ?? 0) > 0 && Array.isArray(payload.pages) &&
    payload.pages.length >= 1 && payload.pages.length <= 8 && Array.isArray(payload.messages) &&
    payload.messages.length >= 1 && payload.messages.length <= 20 &&
    payload.messages[0]?.role === "user" && payload.messages[payload.messages.length - 1]?.role === "user" &&
    !payload.messages.some((message) => !message || !["user", "assistant"].includes(message.role) ||
      typeof message.content !== "string" || message.content.length > maxTutorMessageLength) &&
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

export async function POST(request: Request) {
  if (process.env.VERCEL_ENV !== "preview" || process.env.AI_TUTOR_ENABLED !== "true") {
    return Response.json({ error: "The AI tutor is not enabled yet." }, { status: 503 });
  }
  if (Number(request.headers.get("content-length") ?? 0) > maxBodyBytes) {
    return Response.json({ error: "The note is too large to send." }, { status: 413 });
  }
  let rawBody: string;
  try {
    rawBody = await request.text();
  } catch {
    return Response.json({ error: "The request could not be read." }, { status: 400 });
  }
  if (Buffer.byteLength(rawBody, "utf8") > maxBodyBytes) {
    return Response.json({ error: "The note is too large to send." }, { status: 413 });
  }
  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return Response.json({ error: "The request could not be read." }, { status: 400 });
  }
  if (!isValidPayload(payload)) {
    return Response.json({ error: "The tutor request is invalid or too large." }, { status: 400 });
  }

  const region = process.env.AWS_REGION;
  const roleArn = process.env.AWS_ROLE_ARN;
  if (!region || !roleArn) {
    return Response.json({ error: "Bedrock access is not configured yet." }, { status: 503 });
  }

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
      system: [{ text: "You are Scribbler's study tutor. Use supplied note pages as evidence, cite page numbers, and say when the note does not contain enough information. Explain clearly and help the learner reason through the work." }],
      messages,
      inferenceConfig: { maxTokens: 1200, temperature: 0.3 },
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
    return new Response(stream, { headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ error: "Bedrock could not answer. Check the AWS role, Region, and model access." }, { status: 502 });
  }
}
