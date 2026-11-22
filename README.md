# Scribbler

[Open Scribbler on Vercel](https://scribblernotebook.vercel.app/)

![Scribbler homepage with a preview of handwritten calculus notes on graph paper](docs/images/scribbler-home.png)

Scribbler is a browser notebook for handwritten notes and study. Create a folder or note from the library, choose a paper type and spacing, and open the editor. Notes save automatically in the current browser. The editor supports ink, text boxes, local page imports, and PDF export. The AI tutor panel previews a future AWS integration.

## Draw shapes

Choose Shapes in the editor, then Line, Rectangle, or Circle. Drag between endpoints for a line, between opposite corners for a rectangle, or from the center outward for a circle. Shapes use the pen's color and width. Release to save the outline, or press Escape to cancel the preview.

Completed shapes behave like ink: use the lasso to move, resize, rotate, copy, or delete them, and either eraser to remove all or part of an outline. Each shape takes one Undo step, saves with the note, and appears in PDF exports.

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

Select the active Eraser again to choose between removing a whole stroke and erasing only the part you touch. Undo and redo apply to page edits on the current page and reset when the editor closes. Imported page images and tool settings are local to this browser profile and site address; they do not sync to other devices.

## Vercel

Import the repository as a Next.js project. The frontend needs no environment variables. See [Next.js on Vercel](https://vercel.com/docs/frameworks/full-stack/nextjs).
