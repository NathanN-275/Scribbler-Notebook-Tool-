# ADR 0005: Editor shortcuts, touch gestures, and storage feedback

## Status

Accepted

## Context

The editor supports mouse and touch drawing, but key actions are hard to discover, two-finger navigation is missing, and save errors do not distinguish full storage from unavailable browser storage.

## Decisions

- Add keyboard shortcuts for undo/redo, Lasso selection copy/paste, page navigation, zoom, and tool selection. Ignore shortcuts while a user types or a dialog is open.
- Default tool bindings are Q pen, W pencil, E eraser, R text, T pan, and Y lasso. Users may change each binding to a unique letter or number; save these preferences in the current browser.
- Keep a visible shortcut button and support `?` to open the accessible shortcut guide.
- Use one finger with the active drawing or pan tool. When a second finger touches the page, cancel the in-progress pointer gesture and use two fingers to pan or pinch between 50% and 200% zoom, anchored at the gesture midpoint.
- Give the drawing canvas a focusable accessible application role and page-specific label; give each text box a page-specific accessible name.
- Translate IndexedDB quota and access failures into plain-language save guidance with a retry path.

## Consequences

- Keyboard shortcuts do not run from text inputs or while a dialog has focus.
- Tool shortcut preferences do not sync across browsers or devices.
- The first two-finger touch cancels an unfinished one-finger gesture so a pinch does not leave a stray mark.
- Users can keep the current note open, create a backup when storage is full, or allow site storage when access is blocked.
