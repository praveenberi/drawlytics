// Vercel serverless entry point: wraps the Express app (built to server/dist by scripts/vercel-build.mjs).
// vercel.json rewrites every /api/* request here; Express still sees the original URL.
import { createApp } from '../server/dist/src/app.js';

const app = createApp();

export default app;
