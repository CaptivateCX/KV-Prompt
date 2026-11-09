# Deploying KV Prompt Lab

This guide covers getting from the GitHub repo to a live Vercel URL that anyone with the link can use:

1. Accounts you need
2. Push the code with GitHub Desktop
3. Create a Gemini API key
4. Import the repo into Vercel (already done if you saw a 404)
5. Add storage (Blob for images, Neon for the database)
6. Add the Gemini variables
7. Access: open to anyone with the link
8. Check it works
9. Make day-to-day changes

The limits, costs and troubleshooting sections are at the end.

---

## 1. Accounts you need

| You need | Why | Notes |
| --- | --- | --- |
| **GitHub account** and **GitHub Desktop** | Holds the code; every push deploys | Private repo is fine |
| **Vercel account** | Hosting and storage | Hobby (free) is for personal, non-commercial use. A company tool should be on **Pro** |
| **Gemini API key with billing on** | Image generation (`gemini-nano-banana-2.1`) and prompt suggestions (`gemini-4-argon`) | Neither model has a free tier |

You don't need Node.js on your computer. Vercel installs and builds everything.

---

## 2. Push the code with GitHub Desktop

The `promptlab` folder already contains the app.

1. Open GitHub Desktop with the **promptlab** repository selected.
2. Every file shows under **Changes**. Check that no `.env` or `.env.local` file is in the list. The `.gitignore` already excludes them.
3. Write a summary (for example "Add KV Prompt Lab app") and select **Commit to main**.
4. Select **Push origin**. If the repo was never published, select **Publish repository** and keep it private.

Vercel starts building as soon as the push lands.

> **OneDrive tip.** Don't run `npm install` inside the OneDrive folder. It creates tens of thousands of small files for OneDrive to sync. You don't need it anyway, because Vercel does the install. If you ever want to run the app locally, clone the repo to a folder outside OneDrive, such as `C:\dev\promptlab`.

---

## 3. Create a Gemini API key

1. Go to **Google AI Studio** (aistudio.google.com) and select **Get API key**.
2. Create the key in a Google Cloud project that has **billing enabled**.
3. Copy the key. You'll paste it into Vercel in step 6. Don't put it in code or in chat.
4. **Set a budget alert** on that Cloud project (Billing → Budgets & alerts). The app has no login, so this is your safety net if the link spreads further than intended.

---

## 4. Import the repo into Vercel

If you've already imported the repo and saw a `404: NOT_FOUND`, that was the docs-only version with no app. Pushing the app (step 2) fixes it. Go straight to step 5.

If you haven't imported it yet:

1. In Vercel, go to **Add New… → Project → Import Git Repository** and choose `promptlab`.
2. Leave the defaults. The repo's `vercel.json` sets the framework to **Next.js** and runs functions in **London (`lhr1`)**.
3. Select **Deploy**.

> If the project was created before the app existed, check **Settings → Build and Deployment → Framework Preset**. It should say **Next.js**. `vercel.json` sets this, but an older manual setting can be overridden there.

---

## 5. Add storage

Until storage and the Gemini key are connected, the app loads but shows a yellow **"Almost there"** banner listing what's missing.

### 5a. Vercel Blob, for key visuals and outputs

1. Open the project, go to **Storage → Create Storage → Blob → Continue**.
2. Set access to **Private**. Files are then only readable through the app, not by guessing a URL.
3. Name it `promptlab-files` and select **Create a new Blob store**.
4. Tick **Production**, **Preview** and **Development**.

Vercel adds `BLOB_STORE_ID` and `BLOB_WEBHOOK_PUBLIC_KEY` to the project automatically. Sign-in happens through Vercel's built-in OIDC token, so no long-lived Blob token is needed. If your project has an older `BLOB_READ_WRITE_TOKEN` instead, that works too.

### 5b. Neon Postgres, for agents, prompt versions and history

1. Go to **Storage**, choose **Neon** and select **Install**, then **Create New Neon Account**.
2. Pick a **European region**, so it sits near the London functions. Choose a plan and name the database `promptlab`.
3. Go to **Storage → promptlab → Connect Project**, choose this project and tick all three environments.

This adds `DATABASE_URL`, along with others the app doesn't need. **You don't need to create any tables.** The app creates them, and the four default agents, the first time it connects.

---

## 6. Add the Gemini variables

Go to **Settings → Environment Variables** and add:

| Variable | Value | Required |
| --- | --- | --- |
| `GEMINI_API_KEY` | your key from step 3 | **Yes** |
| `GEMINI_IMAGE_MODEL` | `gemini-nano-banana-2.1` | Optional; this is the default |
| `GEMINI_TEXT_MODEL` | `gemini-4-argon` | Optional; this is the default |

Tick all environments. Then **redeploy** (**Deployments → ⋯ → Redeploy**), because new variables only apply to new deployments.

Model IDs live in variables on purpose. Google retires image models fairly quickly, so switching to a new one is a settings change, not a code change.

---

## 7. Access: open to anyone with the link

The app has no login. Anyone who has the URL can use it.

- **The production URL** (`promptlab-….vercel.app`) is public by default.
- **Preview links** (one per branch or commit) ask for a Vercel login by default. To open those too, go to **Settings → Deployment Protection** and turn **Vercel Authentication** off.

Because there's no login:

- Anyone with the link can run generations on your Gemini key. Keep the link within the team, and rely on the **budget alert** from step 3.
- Uploads are limited to JPG, PNG, WebP and TIFF, up to 50 MB each.
- If you want a light gate later, a shared password is a small addition. Ask and it can be built in.

---

## 8. Check it works

Open the production URL and go through these checks:

- [ ] No yellow "Almost there" banner
- [ ] Four agents appear with their starting prompts (v1)
- [ ] Dropping a KV shows its thumbnail inside the upload box
- [ ] **Run all agents**: Agents 1, 2 and 4 start together, and Agent 3 starts when Agent 1 finishes
- [ ] Editing a prompt and pressing **Re-run** gives the tile a new version number (v2)
- [ ] **History** shows each output with its exact prompt, and search finds a word from a prompt
- [ ] **Open editor → Suggest a rewrite** returns an Argon suggestion
- [ ] Thumbs up/down sticks after a refresh

If something fails, the tile shows the error message. **Logs** in the Vercel project has the details.

---

## 9. Make day-to-day changes

- **Prompts don't need a deploy.** They're edited in the app and stored in the database.
- **Code changes:** commit and push from GitHub Desktop. A push to `main` updates the live URL; other branches get preview URLs.
- **Rollback:** go to **Deployments**, find the last good deployment, then use **⋯ → Instant Rollback**.

---

## Limits that shape the build

| Limit | How the app handles it |
| --- | --- |
| **4.5 MB request or response body** on Vercel Functions | KVs upload straight from the browser to Blob. The app shows web-sized JPEGs (KV previews at 2048 px, outputs as JPEG) |
| **Function time:** 300 s on Hobby; 300 s default, up to 800 s on Pro | One agent is one request, which takes well under a minute. The generate route allows 300 s |
| **No free tier** for the Gemini models | Billing must be on before anything generates |
| **Aspect ratios** | Gemini offers set ratios (16:9, 9:16, 1:4 and so on). The Portrait tower is generated at 9:16 and cropped to 1:3. Change it in the agent's settings |
| **SynthID** | Every Gemini image carries an invisible SynthID watermark |

---

## Rough costs

| Item | Cost |
| --- | --- |
| `gemini-nano-banana-2.1` image | about $0.034 at 1K, $0.050 at 2K, $0.113 at 4K, plus input tokens at $1.50 per 1M |
| One full run (4 agents at 2K) | about $0.20 |
| `gemini-4-argon` suggestion | $2 / $10 per 1M input/output tokens until 30 Nov 2026, then $4 / $20. Each suggestion is a fraction of a cent |
| Vercel Pro | $20 per developer seat per month |
| Blob and Neon | Usage-based, with included allowances. Check the Storage tab |

Prices are from Google's and Vercel's pricing pages in October 2026.

---

## Troubleshooting

| What you see | Likely cause | Fix |
| --- | --- | --- |
| `404: NOT_FOUND` | No app had been pushed yet, or the framework preset isn't Next.js | Push the app (step 2). Check the Framework Preset (step 4) |
| Yellow "Almost there" banner | A variable is missing | Connect what it lists (steps 5 and 6), then redeploy |
| Tile error mentioning `401`, `403`, billing or quota | Wrong key, or billing is off | Check `GEMINI_API_KEY` and billing on the Cloud project |
| "model not found" | The model ID was renamed or retired | Check the Gemini API changelog and update `GEMINI_IMAGE_MODEL` |
| "The model returned text instead of an image" | The model refused or misunderstood the prompt | Reword the prompt. The message shows what the model said |
| Agent 3 says "Run that one first" | It uses Agent 1's output from the same run | Run Agent 1 (or Run all) first, or switch its input to the key visual in the editor |
| Upload fails straight away | Blob store not connected, or an unsupported file type | Check step 5a. Use JPG, PNG, WebP or TIFF |
| "Failed to retrieve the client token" or "Missing webhook public key" | The Blob store isn't connected to the environment you're using | Storage → store → Projects → ⋯ → **Update Project Connection**, tick the environment, then redeploy |
| `504` timeout on a tile | Generation took longer than 300 s | Try again, or set the agent's size to 1K |
| Preview link asks for a login | Vercel Authentication is on for previews | Turn it off (step 7) |

---

## References

- Gemini API: [image generation](https://ai.google.dev/gemini-api/docs/image-generation), [What's new in Gemini 4 Argon](https://ai.google.dev/gemini-api/docs/latest-model), [changelog](https://ai.google.dev/gemini/docs/changelog), [pricing](https://ai.google.dev/gemini-api/docs/pricing)
- Vercel: [Functions limits](https://vercel.com/docs/functions/limitations), [Blob client uploads](https://vercel.com/docs/vercel-blob/client-upload), [Private Blob storage](https://vercel.com/docs/vercel-blob/private-storage), [Deployment Protection](https://vercel.com/docs/deployment-protection/methods-to-protect-deployments/vercel-authentication), [Hobby plan](https://vercel.com/docs/plans/hobby)
- Neon: [Vercel-managed integration](https://neon.com/docs/guides/vercel-managed-integration)
