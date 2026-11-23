# ADR 0004: Page-linked manual study tools

## Status

Accepted

## Context

People want to turn handwritten notes into study material while keeping each prompt tied to its source. AI generation is a future capability, so the first implementation needs useful manual authoring and review without requiring a model service.

## Decisions

- Store free-text tags, bookmark state, and study items on each note in IndexedDB. Older notes normalize to no tags, no bookmark, and no study items.
- A study item is either a flashcard (front/back) or a short-answer question (question/answer) and carries the ID of its source page.
- Creating a study item happens from the open page. Deleting that page keeps the study item attached to the note and marks its source page as deleted in the library.
- Duplicate pages do not copy study items. Backup copies remap study-item page links when “Keep both” creates a new note identity.
- Study tags filter notes; Study material searches prompts and answers and links back to its source page.
- Review is a manual sequence: show prompt, reveal answer, record “Again” or “Got it”, then continue. Persist counts and last-review time, without a spaced-repetition scheduler.
- AI drafting appears only as a disabled “coming soon” placeholder.

## Consequences

- No IndexedDB version change is needed because study fields live with existing note records.
- Backups carry tags, bookmarks, study items, and review history as part of each note.
- Deleting a source page does not discard study material; it remains accessible by its note and indicates the missing source page.
