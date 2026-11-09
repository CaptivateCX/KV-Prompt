# KV Prompt Lab

A tool for tuning image-generation prompts against key visuals (KVs).

Upload a KV and run it through a set of **agents**. Each agent is one prompt that produces one image. Edit a prompt, re-run that agent, and compare the result with earlier versions until the wording gives the output you want.

## What it does

- **Upload** key visuals by drag and drop (JPG, PNG, WebP or TIFF, up to 50 MB).
- **Run** them through four agents, or as many as you add:
  1. **Simplify · Landscape**: cut the KV down to 4 visual elements.
  2. **Contextual elements**: show what's left once the logo, focal image and message are removed.
  3. **Portrait tower**: a narrow portrait version, made from Agent 1's output.
  4. **Presentation background**: a no-text slide background.
- **Edit** a prompt on the tile and press Re-run. Every prompt you run is saved as a version automatically.
- **History**: every output alongside the exact prompt, model and settings that made it. You can filter by agent, search prompt wording, rate outputs, and reuse an old prompt in one click.
- **Agent editor**: full prompt, an "Avoid" box, version history with each version's outputs side by side, settings (input image, aspect ratio, crop, size) and **Suggest a rewrite**, which uses Gemini 4 Argon.

## Stack

| Part | Choice |
| --- | --- |
| App | Next.js 16 (App Router, TypeScript) on Vercel |
| Image model | Gemini `gemini-nano-banana-2.1` via `@google/genai` |
| Prompt suggestions | Gemini 4 Argon (`gemini-4-argon`). It returns text only and doesn't make images |
| Files | Vercel Blob (private store) |
| Database | Neon Postgres. Tables are created automatically on first use |
| Access | None. Anyone with the link can use it |

## Deploying

See **[docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)**. In short: push the repo, connect Blob and Neon in Vercel's Storage tab, add `GEMINI_API_KEY`, and redeploy.

How it works under the hood is in **[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)**.

## Running locally (optional)

Clone the repo somewhere **outside OneDrive**, then:

```bash
npm install
npx vercel link                 # connect to the Vercel project
npx vercel env pull .env.local  # pull the Gemini, Blob and database variables
npm run dev                     # http://localhost:3000
```

`.env.example` lists every variable the app reads.
