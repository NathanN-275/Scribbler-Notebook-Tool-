# ADR 0007 — Require an account and enforce a shared tutor allowance

The live tutor needs a consistent question limit across notes, devices, concurrent requests, and app restarts. Use the selected Clerk application for identity and keep the notebook and library usable without an account. Notebook storage still belongs to the browser profile.

Identify the account by its verified Clerk user ID. Upstash Redis atomically checks and records each valid live question in a rolling window. A live question consumes a slot before generating its reply, including when a downstream error occurs. Each acceptance expires after 24 hours. When Redis is unavailable, live mode stops accepting questions until it can enforce the allowance again. Sample replies remain available to signed-in users and use no allowance.

Store only question acceptance timestamps and opaque record IDs under each Clerk user ID. Sample replies use the current question, page count, and optional selection page number. Handwriting and note images stay in the browser in sample mode. Live mode keeps the existing first-send consent and protected Vercel preview requirements. Public live inference still requires a separate rollout decision under ADR 0006.
