# Scribbler

[Open Scribbler on Vercel](https://scribblernotebook.vercel.app/)

![Scribbler homepage with a preview of handwritten calculus notes on graph paper](docs/images/scribbler-home.png)

Scribbler is a browser notebook for handwritten notes and study. Create and organize folders and notes from the library, search and sort notes, and move them with drag-and-drop or bulk actions. Add note tags and bookmarks, then make page-linked flashcards or short-answer practice questions for manual review. Notes save automatically in the current browser; deleted notes remain recoverable in Trash until you empty it. The editor supports ink, text boxes, page thumbnails, page reordering, duplication and deletion with undo, local page imports, and PDF export. The library can export and restore a full Scribbler backup, including Trash and study material. AI drafting remains a placeholder for a later update.

## Run locally

Requires Node.js 22 or newer.

```sh
npm ci
npm run dev
```

Open [localhost:3000](http://localhost:3000). Use `npm run build` to create a production build and `npm start` to serve it.

## How it fits together

- `app/` defines the landing page, library, and note routes.
- `components/editor.tsx` coordinates pages, tool settings, import/export, and save feedback. `components/ink-canvas.tsx` handles drawing, text boxes, selection, and page panning.
- `lib/ink.ts` holds drawing and hit detection. `lib/files.ts` renders local imports and PDFs. `lib/notebooks.ts` owns the notebook model and IndexedDB transactions.

Select the active Eraser again to choose between removing a whole stroke and erasing only the part you touch. Undo and redo apply to page edits on the current page and reset when the editor closes. Imported page images and tool settings are local to this browser profile and site address; they do not sync to other devices. Use **Back up** in the library to save a portable `.scribbler` archive, and **Restore** to merge one into the current library.

## Vercel

Import the repository as a Next.js project. The frontend needs no environment variables. See [Next.js on Vercel](https://vercel.com/docs/frameworks/full-stack/nextjs).
