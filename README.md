# Scribbler

Scribbler is a browser notebook for handwritten notes and study. Create a folder or note from the library, choose a paper type, and open the editor. Notes save automatically in the current browser. The AI tutor panel previews a future AWS integration.

## Run locally

Requires Node.js 22 or newer.

```sh
npm ci
npm run dev
```

Open [localhost:3000](http://localhost:3000). Use `npm run build` to create a production build and `npm start` to serve it.

## How it fits together

- `app/` defines the landing page, library, and note routes.
- `components/editor.tsx` coordinates pages, drawing history, and save feedback. `components/ink-canvas.tsx` turns pointer gestures into edits to a page's strokes.
- `lib/ink.ts` holds drawing and hit detection. `lib/notebooks.ts` owns the notebook model and IndexedDB transactions.

The eraser removes whole strokes. Undo and redo apply to drawing edits on the current page and reset when the editor closes. Browser storage is specific to each site address and browser profile.

## Vercel

Import the repository as a Next.js project. The frontend needs no environment variables. See [Next.js on Vercel](https://vercel.com/docs/frameworks/full-stack/nextjs).
