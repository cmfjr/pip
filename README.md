# YouTube Floating PiP

A tiny Chrome extension that opens the current YouTube video in Chrome's real detached Picture-in-Picture window.

This project exists because the built-in YouTube mini-player is still inside the YouTube page, but sometimes you want a truly separate floating video window that stays visible while you work somewhere else on your computer.

## Why this exists

The original goal was simple:

- while watching YouTube, open the video into a small floating window
- move to another tab, another app, or another monitor
- keep the video visible without building anything heavy

So this extension was built from first principles:

- use Chrome's native PiP window instead of simulating one
- keep permissions minimal
- keep the code easy to read
- avoid a backend, analytics, accounts, or any unnecessary infrastructure

## What it does

- Works on YouTube watch pages and Shorts
- Opens the real floating PiP window, not YouTube's in-page mini-player
- Uses only `activeTab` and `scripting`
- Runs only when you click the extension or use its shortcut

## Principles

- Local-first
- Minimal permissions
- No data collection
- No external services
- Small enough for one engineer to understand quickly

## Install

1. Clone or download this repository to your machine.
2. Open `chrome://extensions`.
3. Turn on Developer mode.
4. Click **Load unpacked**.
5. Select the local `youtube-pip` folder.

## Use

1. Open a YouTube video page.
2. Start the video if needed.
3. Click the extension icon.

Keyboard shortcut:

- Windows/Linux: `Ctrl+Shift+Y`
- macOS: `Command+Shift+Y`

## Privacy

This extension does not collect, store, transmit, or sell user data.

For the full note, see [PRIVACY.md](./PRIVACY.md).

## Notes

- The PiP window is created by Chrome, so you can drag it to another monitor yourself.
- The extension cannot force Chrome to place the PiP window on a specific screen.
- If Chrome rejects the request, click once inside the video player and try again.

## Development

The implementation is intentionally small:

- [manifest.json](./manifest.json) defines a minimal Manifest V3 extension
- [service-worker.js](./service-worker.js) injects a tiny page function that finds the current video and toggles Chrome PiP

## License

[MIT](./LICENSE)

## Disclaimer

This project is not affiliated with or endorsed by Google or YouTube.
