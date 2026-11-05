# Still Here — 360° Memory Platform

A local-first prototype for capturing overlapping photos to build a memory panorama. The frontend is being developed in phases.

## Phase 1 and 2: Camera capture and guidance

- React + Vite frontend
- Browser camera permission and live preview
- Manual capture, add existing images, retake, and delete
- Optional automatic capture using device orientation plus low-resolution camera-frame stability checks
- Manual shutter remains available in automatic mode
- A separate 360° rotation tracker with left/right selection, a start-time zero point, 30° milestones, reverse-turn handling, and a manual sensor fallback
- Sensor permission and unsupported-browser fallbacks
- Captures remain in browser memory; they are not uploaded or persisted yet

Automatic direction readings vary by device and browser. The guide gives approximate horizontal-turn cues; it does not claim precise headings. After a horizontal sweep, it prompts for upper and lower views in manual mode.

## Run locally

Install Node.js 20 or newer, then from this directory run:

```sh
npm install
npm run dev
```

Open the local URL printed by Vite. Camera access requires `localhost` or HTTPS and browser permission. The camera works best on a phone browser with a rear-facing camera; the UI also supports adding existing photos.

Run the rotation math checks with `npm test`, and create a production bundle with `npm run build`.

## Current scope

Upload, panorama stitching, saved memories, the Java API, Python image processing, and PostgreSQL are planned for later phases. The stitching action is intentionally unavailable until those features exist.
