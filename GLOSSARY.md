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

## Data safety

**Backup archive**:
A single file containing a copy of the browser library, including folders, notes, pages, imported page backgrounds, and editor settings.

**Restore conflict**:
A note with the same identity in the current library and a backup, but different contents. The user chooses whether to keep the local note, replace it, or keep both.
