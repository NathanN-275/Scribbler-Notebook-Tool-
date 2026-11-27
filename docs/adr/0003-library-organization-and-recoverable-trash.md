# ADR 0003: Library organization and recoverable Trash

## Status

Accepted

## Context

Notes and imported page backgrounds are valuable local data. Users need quick ways to find notes, move them between the existing flat folders, and recover accidental deletions. The library backup format also needs to preserve deleted notes.

## Decisions

- Keep the existing flat folder model. Notes can be moved with a per-note folder control, bulk selection, or drag-and-drop onto a folder.
- Deleting a folder unfiles its notes by setting `folderId` to `null`; it does not delete those notes.
- Moving a note to Trash atomically removes it from the notes store and stores the complete note, including page backgrounds, in a `trash` object store.
- Restoring a note returns it to the library. Emptying Trash permanently removes its records.
- Backups include Trash and restore it by merge while preserving existing local note and Trash records.
- If an archive contains an active note whose ID is currently in local Trash, restore treats it as a conflict. Keeping local leaves it trashed; replacing restores the archived note; keeping both restores an additional copy.
- The library has All notes, Study tags, Study material, and Trash views. Study-specific content and filtering are populated by the study-tools feature.
- Note search and sorting operate on the current library view; the study-tools feature extends search to tags and study prompts.

## Consequences

- IndexedDB advances to version 3 and creates a Trash object store for existing users.
- Deleted pages inside trashed notes remain recoverable as part of the note.
- Folder deletion has no data loss but may leave notes unfiled.
- Trash can consume local storage until the user empties it.
