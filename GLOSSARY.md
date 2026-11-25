# Scribbler Notebook

This glossary defines the core concepts in Scribbler's note-taking experience.

## Workspace

**Folder**:
A named collection that organizes notes. In the first version, folders are not nested.
_Avoid_: Directory

**Note**:
A named notebook that contains one or more pages and can belong to a folder.
_Avoid_: Document, notebook (when referring to a page)

**Page**:
A single sheet inside a note. All pages in a note share its paper type and spacing; a page can contain strokes, text boxes, and an imported page background.
_Avoid_: Sheet (as a product term)

**Page thumbnail**:
A small preview of a page used to select and navigate between pages in a note.

**Duplicated page**:
A new page that starts with the selected page's writing, text boxes, and imported background, while keeping its own page identity.

**Library view**:
A filterable way to browse all notes, study tags, study material, or Trash.

**Trash**:
A local holding area for deleted notes. Notes remain recoverable until the user empties Trash.

**Unfiled note**:
A note whose folder is set to `null`, shown in All notes outside a folder.

**Study tag**:
A user-authored label on a note. Tags are shared across the library and can filter the notes that use them.

**Bookmark**:
A saved-note marker that can be filtered from the library.

**Study item**:
A manually authored flashcard or short-answer practice question linked to one page in a note.

**Review history**:
Per-item counts for “Again” and “Got it”, plus the last review time. The first version does not schedule spaced repetition.

**Editor shortcut guide**:
An accessible in-editor reference for keyboard actions, including editable browser-local tool keys. Defaults are Q for pen, W for pencil, E for eraser, R for text, T for pan, and Y for lasso. Shortcuts are paused while the user types or a dialog is open.

**Paper type**:
The visual guide shown behind the ink on a note's pages: plain, lined, graph, or dotted.
_Avoid_: Template

**Paper spacing**:
The density of the lines, graph squares, or dots shown on every page in a note.

**Imported page**:
A page background rendered from a PDF, DOCX, PNG, or JPEG file. Its source content is fixed while users can write or add text over it.

## Drawing

**Stroke**:
A continuous mark drawn with the pen or pencil, represented as an individual piece of handwriting.
_Avoid_: Ink blob

**Text box**:
An editable plain-text area placed on a page; it can be moved or resized.

**Pan tool**:
A tool that lets users drag the page around without drawing a stroke.

**Lasso selection**:
A selection made by drawing a freeform boundary; any overlapping strokes or text boxes can be moved or deleted.
_Avoid_: Scissor selection

## AI tutor

**Tutor conversation**:
A sequence of questions and replies for one open note during an editor session.

**Tutor allowance**:
Up to five accepted question submissions per account in the previous 24 hours, shared across notes and tutor modes. Each submission frees one slot 24 hours after it was accepted, even if a reply failed.

**Note context**:
The open note's numbered pages and the page the user is currently viewing, available to the tutor for a question.

**Selection attachment**:
A snapshot of the strokes and text boxes selected with **Ask AI**, linked to its source page.

## Data safety

**Backup archive**:
A single file containing a copy of the browser library, including folders, active and trashed notes, pages, imported page backgrounds, tags, bookmarks, study items, review history, and editor settings.

**Restore conflict**:
A note with the same identity in the current library and a backup, but different contents. The user chooses whether to keep the local note, replace it, or keep both.
