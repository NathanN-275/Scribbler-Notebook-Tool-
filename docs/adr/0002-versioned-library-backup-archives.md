# Use versioned library backup archives

Scribbler stores its library in browser IndexedDB, so backups must work without a server or account. Export a versioned `.scribbler` JSON archive containing the library and editor settings, encoding imported page backgrounds inline; restore merges notes and folders, asks before resolving changed note IDs, and preserves current editor settings unless the user opts in to replacing them.
