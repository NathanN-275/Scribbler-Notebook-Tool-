# Scribbler Frontend Plan

## Goal

Build a browser-based note-taking frontend for the cloud computing class project. A visitor can learn about Scribbler, open the notebook library, create folders and notes, and write on multi-page notes. The first version runs without accounts or a live AI service. AWS AI integration is a later phase.

## Agreed scope

- Landing page explains the note-taking product and its planned AI tutor, with a **Try the tool** button leading to the library.
- The library shows a grid of flat folders and notes. Users can create folders and create notes with a name and paper type.
- A note contains multiple pages. Users can add pages and move between them. Reordering and deleting pages are deferred.
- Each note starts with lined, graph, or dotted paper. Users can change paper from inside the editor; the selected paper applies to all pages in that note.
- The editor follows the reference screenshot's broad layout: top navigation and tool controls, a large paper canvas, compact page navigation, and Scribbler styling.
- The editor has pen, pencil, eraser, lasso, undo, and redo. Pen and pencil have independent size presets and color swatches. Lasso selection supports moving and deleting ink strokes.
- A toggleable AI panel appears as a nonfunctional placeholder. Live AI, handwriting recognition, and AWS integration are deferred.
- Support mouse/trackpad and touch input.
- Save changes automatically in the current browser using IndexedDB. No sign-in or cross-device sync.
- Sharing, export, and nested folders are deferred.

## Recommended implementation

- Use Next.js with React and TypeScript. The repository is empty, and there is no course framework restriction recorded. Next.js has an App Router and built-in TypeScript support; Vercel documents zero-configuration deployment for Next.js projects. [Next.js App Router](https://nextjs.org/docs/app), [Next.js TypeScript](https://nextjs.org/docs/app/api-reference/config/typescript), [Next.js on Vercel](https://vercel.com/docs/frameworks/full-stack/nextjs)
- Keep the landing page and the interactive notebook workspace as separate routes. Suggested routes: `/`, `/library`, and `/notes/[noteId]`.
- Store folders, notes, pages, and stroke data in IndexedDB. IndexedDB supports persistent structured data in the browser. [MDN: IndexedDB](https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API/Using_IndexedDB)
- Store each stroke as vector points plus its tool, color, and width; render strokes on a 2D canvas. This keeps strokes individually selectable for lasso and undo/redo. [MDN: Canvas API](https://developer.mozilla.org/en-US/docs/Web/API/Canvas_API)
- Use pointer input so the drawing surface can accept mouse and touch. Keep visible toolbar buttons for touch users.

## Delivery phases

### 1. App foundation and visual direction

- Initialize the Next.js, React, and TypeScript app and connect the existing GitHub repository once its URL/access is confirmed.
- Set Scribbler colors, type, spacing, and shared page layout.
- Build the responsive landing page with product explanation, feature highlights, and the **Try the tool** action.

**Done when:** the landing page renders at desktop and tablet widths, and its action opens the library.

### 2. Library and note setup

- Define the folder, note, page, paper type, and stroke data model.
- Build the library grid, create-folder flow, folder contents view, and create-note dialog.
- Create notes with a name, folder, and selected paper type.
- Add IndexedDB persistence and automatic save status.

**Done when:** a user can create a folder and note, reload the browser, and still see them in the library.

### 3. Note editor and paper

- Build the GoodNotes-inspired editor shell: top bar, toolbar, canvas, page navigation, and AI placeholder panel.
- Render lined, graph, and dotted paper styles.
- Add page creation and page navigation; make paper changes apply to every page in the note.
- Persist page and paper changes automatically.

**Done when:** a user can open a note, add pages, navigate between them, change paper, and retain those changes after reload.

### 4. Drawing tools

- Implement pen and pencil input with independent color swatches and size presets.
- Implement erasing, lasso selection, moving/deleting selected strokes, and undo/redo for drawing edits.
- Support pointer input from mouse and touch.
- Persist stroke edits and restore them when the note is reopened.

**Done when:** users can draw, erase, select, move, delete, undo, and redo strokes with both input types, then reopen the note with their work intact.

### 5. Responsive polish and Vercel deployment

- Check the landing page, library, toolbar, canvas, and page navigation at tablet and desktop sizes.
- Add loading, empty-library, and storage-error states.
- Deploy the frontend to Vercel and confirm the deployed routes work.

**Done when:** the deployed frontend supports the complete agreed browser-only flow and communicates that the AI assistant is a future feature.

## Not in this frontend milestone

- Live AI chat, AWS model hosting/inference, handwriting recognition, or AI feedback on selected notes.
- User accounts, server-side note storage, or sync across browsers/devices.
- Export, sharing, nested folders, page reorder/delete, text recognition, or additional drawing tools.

## Decisions to settle during implementation

- Whether erasing removes a whole stroke or only the portion touched.
- The exact pen and pencil rendering styles and the size/color preset values.
- Whether a note created from the top-level library is unfiled or must be assigned to a folder.
- The AI placeholder copy and whether it shows a disabled prompt field.
- The IndexedDB schema and backup/export path before notes become valuable to users.

## Repository note

At planning time, the local repository contains no project files, commits, or configured Git remote. The supplied GitHub URL could not be verified from this environment, so repository connection is a setup task in phase 1.
