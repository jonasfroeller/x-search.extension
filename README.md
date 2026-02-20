# X Search

Browser extension that lets you full-text search anyone's X (Twitter) posts. X's built-in search is unreliable and limited. This fixes that by indexing posts locally in your browser.

## How it works

1. Visit any X profile
2. Click "Index" in the extension popup to scroll through and capture all posts
3. Search across all indexed profiles or within a single profile

Posts are stored locally in IndexedDB using Dexie.js. Nothing leaves your browser.

## Features

- Full-text search across all indexed profiles
- Per-profile search with result highlighting
- Profile management (view indexed count, delete profiles)
- Pause/resume/re-index controls
- Works with X's virtual DOM and lazy-loaded content

## Stack

- [Plasmo](https://docs.plasmo.com/) (browser extension framework)
- React + TypeScript
- Dexie.js (IndexedDB wrapper)
- [@tabler/icons-react](https://tabler.io/icons)

## Development

```sh
pnpm install
pnpm dev
```

Load `build/chrome-mv3-dev` as an unpacked extension in Chrome.

## Production build

```sh
pnpm build
```

Output is in `build/chrome-mv3-prod`.
