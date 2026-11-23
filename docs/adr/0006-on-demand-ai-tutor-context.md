# ADR 0006 — Provide note context when the user asks

The AI tutor answers questions about the open note, whose handwriting and imported pages live in the browser. Prepare numbered pages and the optional lasso selection when the user asks. This gives the future vision model current visual context and avoids uploading, indexing, and syncing a second copy of the library. Revisit retrieval if tutor questions need to span notes or a single note regularly exceeds the model's input limits.

## Local demo

Both tutor entry points use a browser provider that streams sample replies. The provider takes an in-memory request containing the conversation and the note's page objects, including strokes, text boxes, and imported background blobs. The lasso sends a snapshot of selected objects to the composer. It can be removed, replaced with a new selection, or cleared by reopening the panel with the general tutor button. Closing the note or reloading discards the conversation.

## Future AWS connection

- Implement the live provider against an API Gateway REST API backed by Lambda, both defined in TypeScript CDK. Use a Bedrock managed model that supports image input and streaming in the project's selected Region. The endpoint setting in `.env.example` is reserved for this provider.
- Ask for confirmation before the first live send. Send numbered renderings of the open note and the optional lasso selection. If the full note exceeds the configured limits, offer to send just the current page. Cite supplied page numbers and label any general explanation when the note lacks sufficient evidence.
- Allow access without sign-in. Require AWS WAF CAPTCHA and reserve quota atomically before invoking the model. Allow five questions per IP in a rolling 24-hour window and 25 questions across all IPs per day, resetting at midnight UTC.
- Keep credentials on the backend. Keep prompts, page images, and chat content out of durable AWS storage and logs.
