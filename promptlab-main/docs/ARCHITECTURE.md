# How KV Prompt Lab works

This is a map of the code. Read it before changing anything.

---

## The flow

```
Browser                          Vercel functions (app/api)               Outside
───────                          ──────────────────────────               ───────
1. Drop KV ── token request ──▶ POST /api/upload ────────────────────────▶ Vercel Blob
   └─ file goes straight to Blob (client upload, up to 50 MB) ──────────▶ (private)
2. POST /api/kvs {pathname} ──▶ make 2048px JPEG preview, save KV row ──▶ Neon Postgres
3. Run all → POST /api/runs ──▶ create run
4. per agent:
   POST /api/runs/:run/agents/:agent {promptText}
                                 save prompt as a version (if new)
                                 load input: KV preview or upstream output
                                 call Gemini image model ────────────────▶ Gemini API
                                 crop if set, save JPEG to Blob
                                 save output row with the exact prompt
   ◀──── { output, versionNo }
5. <img src="/api/file?pathname=…"> streams the private file back
```

Principles:

- **One agent equals one request equals one image.** Each tile updates the moment its image lands, and no single function waits on four images.
- **The browser runs the order.** Agents that read the KV start together. An agent whose input is another agent's output waits for that output in the same run. With the defaults, Agents 1, 2 and 4 start together and Agent 3 follows Agent 1. See `runAll()` in `components/Pipeline.tsx`.
- **No file passes through a function body**, which keeps everything under Vercel's 4.5 MB limit. Only web-sized JPEGs are streamed back. The original KV is never served.
- **Every output stores `final_prompt`**, the exact text sent to Gemini. History shows this, so it stays accurate after later edits.
- **Every prompt that runs is a saved version.** Editing a tile and pressing Re-run saves the text as the next version and makes it the default. Running identical text reuses the existing version instead of creating a duplicate.

---

## Files

```
app/
  page.tsx                       Pipeline (components/Pipeline.tsx)
  history/page.tsx               History  (components/History.tsx)
  agents/[id]/page.tsx           Agent editor (components/AgentEditor.tsx)
  api/
    status/                      which env vars are missing → "Almost there" banner
    upload/                      presigned upload URL (handleUploadPresigned + issueSignedToken, works with OIDC), kvs/ only, images ≤ 50 MB
    kvs/                         GET recent KVs · POST register upload + make preview
    runs/                        POST new run for a KV
    runs/latest/                 latest run + KV + latest output per agent (restores state on refresh)
    runs/[runId]/agents/[agentId]/  POST generate one output (maxDuration 300)
    file/                        GET stream a private blob (previews/ and outputs/ only)
    agents/                      GET list · POST add agent
    agents/[id]/                 GET agent + versions · PATCH settings / default version
    agents/[id]/versions/        GET versions + their outputs · POST save a version
    agents/[id]/suggest/         POST Argon prompt suggestion
    outputs/[id]/                PATCH rating (up / down / null)
    history/                     GET outputs: ?agentId= &q= &before= (20 per page)
lib/
  config.ts                      env vars, setup status, error helpers
  db.ts                          Neon client; creates tables + default agents on first use
  data.ts                        shared queries (agents, versions, runs, outputs)
  gemini.ts                      generateImage() and suggestPrompt()
  blob.ts                        readBlob() / saveBlob(), always private
  images.ts                      sharp: preview, crop to ratio, JPEG
  types.ts                       shared types, aspect-ratio and size options
components/                      Pipeline, History, AgentEditor, SetupBanner, icons
app/globals.css                  brand theme (CSS variables)
vercel.json                      framework = nextjs, region = lhr1 (London)
```

---

## Database

`lib/db.ts` runs these `create table if not exists` statements on the first query of each server instance. It holds an advisory lock while doing so, so parallel cold starts can't race. It then adds the four default agents if the `agents` table is empty. There's no migration step.

| Table | Holds |
| --- | --- |
| `agents` | name, position, enabled, input (`kv` or another agent), aspect ratio, crop, image size, `current_version_id` |
| `prompt_versions` | every prompt wording ever saved: `version_no`, `prompt_text`, `avoid_text`, `note`. Rows are only ever added, never changed |
| `kvs` | uploaded key visuals: original pathname, preview pathname, file name, size |
| `runs` | one press of Run all (or the first single run on a new KV), with a label like "winter_kv · Run 3" |
| `outputs` | one generated image: run, agent, version, `final_prompt`, model, settings, input used, result pathname, status, error, duration, rating |

**Changing the schema later:** add `alter table … add column if not exists …` lines to the `SCHEMA` list in `lib/db.ts`. They run automatically on the next cold start.

---

## The Gemini calls (`lib/gemini.ts`)

Both calls use the **Interactions API** in `@google/genai` (`ai.interactions.create`), with `store: false`.

**Image agents** send the prompt text and the input image, and ask for a JPEG at the agent's aspect ratio and size:

```ts
ai.interactions.create({
  model: 'gemini-nano-banana-2.1',
  input: [
    { type: 'text', text: finalPrompt },
    { type: 'image', mime_type: 'image/jpeg', data: base64 },
  ],
  response_format: { type: 'image', aspect_ratio: '16:9', image_size: '2K', mime_type: 'image/jpeg' },
  store: false,
});
// → interaction.output_image.data (base64)
```

If the model sends text instead of an image (a refusal, for example), that text is shown on the tile as the error.

**Suggest a rewrite** sends Argon the current prompt, the input image and the latest output (when there is one), with `generation_config: { thinking_level: 'low' }`. It asks for one improved prompt plus a one-line "Why:". The suggestion only fills the editor; nothing is saved until someone chooses to save it.

**Final prompt** = `prompt_text`, plus `"\n\nDo not: " + avoid_text` when the Avoid box is filled in.

---

## Default agents

| # | Name | Input | Aspect | Starting prompt (v1) |
| --- | --- | --- | --- | --- |
| 1 | Simplify · Landscape | KV | 16:9 | Can you simplify this Key Visual poster down to 4 visual elements maximum? Keep only the brand logo, main focal image and primary message. |
| 2 | Contextual elements | KV | 16:9 | Can you help me show the elements on this design that are surplus to requirement, by removing only the brand logo, main focal image and primary message? |
| 3 | Portrait tower | Agent 1 | 9:16, cropped to 1:3 | Now can you make me a portrait version of this design that is quite narrow in format? |
| 4 | Presentation background | KV | 16:9 | Can you create a PowerPoint template page for this campaign? Very simply, only use and feature the logo, background and brand colours, plus one single main focal image. NO TEXT. |

---

## Access

There's no login: anyone with the URL can use the app. The guards that do exist are:

- uploads go only to `kvs/`, as images of 50 MB or less
- `/api/file` serves only `previews/` and `outputs/`
- the Blob store is private
- a budget alert on the Gemini Cloud project (see DEPLOYMENT.md, step 3)

---

## UI theme (`app/globals.css`)

| Token | Hex | Used for |
| --- | --- | --- |
| `--indigo` | `#3B1FA0` | primary buttons, number badges, links, focus rings |
| `--ink` | `#1E1452` | headings and body text |
| `--ink-muted` | `#5B4F96` | secondary text, labels |
| `--yellow` | `#F5C542` | in progress and attention: Running, edited prompt, liked |
| `--lavender-100` / `-75` / `-50` | `#EAE5FA` / `#F3F0FC` / `#F7F5FE` | pills, output areas, page background |
| `--line` | `#E4DEF6` | borders |
| `--danger` | `#9B1C1C` | failures |

Buttons are pill-shaped and cards use an 18 px radius. Small labels are uppercase with tracked letter-spacing.

---

## Ideas for next

- A dedicated **Compare** page: pick two versions and run both on the same KV side by side.
- **Run against several KVs at once**, to check a prompt isn't tuned to a single campaign.
- An optional **shared password**, if the link needs a light gate.
