# Still Here — 360° Memory Platform

A local-first prototype for capturing overlapping photos to build a memory panorama. The frontend is being developed in phases; this initial version implements the browser capture experience.

## Phase 1: Camera capture

- React + Vite frontend
- Browser camera permission and live preview
- Manual capture to full-resolution JPEG thumbnails
- Add existing image files, retake a captured slot, and delete captures
- Camera and permission error handling
- Captures remain in browser memory; they are not uploaded or persisted yet

## Run locally

Install Node.js 20 or newer, then from this directory run:

```sh
npm install
npm run dev
```

Open the local URL printed by Vite. Camera access requires `localhost` or HTTPS and browser permission. The camera works best on a phone browser with a rear-facing camera; the UI also supports adding existing photos.

## Current scope

Upload, panorama stitching, saved memories, the Java API, Python image processing, and PostgreSQL are planned for later phases. The stitching action is intentionally unavailable until those features exist.
