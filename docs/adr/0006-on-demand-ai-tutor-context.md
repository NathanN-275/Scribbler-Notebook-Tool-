# ADR 0006 — Provide note context when the user asks

The AI tutor answers questions about the open note, whose handwriting and imported pages live in the browser. Prepare numbered pages and the optional lasso selection when the user asks. This gives the future vision model current visual context and avoids uploading, indexing, and syncing a second copy of the library. Revisit retrieval if tutor questions need to span notes or a single note regularly exceeds the model's input limits.

## Local demo

Both tutor entry points use the same tutor panel. The lasso sends a snapshot of selected objects to the composer. It can be removed, replaced with a new selection, or cleared by reopening the panel with the general tutor button. Closing the note or reloading discards the conversation. Sample replies use the authenticated endpoint and leave the live allowance available, as described in [ADR 0007](0007-tutor-auth-and-allowance.md).

## Live Bedrock connection

- Use a same-origin Next.js Route Handler deployed as a Vercel Function. Authenticate to Bedrock with a narrowly scoped AWS IAM role assumed through Vercel OIDC; never store a long-term AWS key. Use Nova Lite with image input and response streaming in the AWS project's selected Region.
- Ask for confirmation before the first live send. Send numbered renderings of the open note and optional lasso selection. If the note exceeds request limits, offer to send only the current page. Cite supplied page numbers and label general explanations when the note lacks evidence.
- Enable live inference only on a Vercel preview protected by Vercel Authentication. A public rollout requires a separate decision, abuse protection, and atomic usage limits of five questions per IP in a rolling 24-hour window and 25 questions across all IPs per UTC day.
- Keep credentials on the backend. Keep prompts, page images, and chat content out of durable AWS storage and logs.
- Require a numbered Bedrock Guardrail version for live inference. Assess user-supplied text and page images and check streamed reply chunks synchronously. Disable guardrail tracing to keep sensitive matches out of diagnostics.
