// Reads environment variables and reports what is missing, so the app can show
// a clear "setup needed" message instead of crashing.

export const config = {
  geminiKey: process.env.GEMINI_API_KEY ?? '',
  imageModel: process.env.GEMINI_IMAGE_MODEL || 'gemini-nano-banana-2.1',
  textModel: process.env.GEMINI_TEXT_MODEL || 'gemini-4-argon',
  databaseUrl: process.env.DATABASE_URL ?? '',
  blobToken: process.env.BLOB_READ_WRITE_TOKEN ?? '',
  blobStoreId: process.env.BLOB_STORE_ID ?? '',
};

export type SetupStatus = {
  ready: boolean;
  missing: { key: string; what: string }[];
  imageModel: string;
  textModel: string;
};

export function setupStatus(): SetupStatus {
  const missing: { key: string; what: string }[] = [];
  if (!config.geminiKey) missing.push({ key: 'GEMINI_API_KEY', what: 'Gemini API key (step 3 of docs/DEPLOYMENT.md)' });
  if (!config.databaseUrl) missing.push({ key: 'DATABASE_URL', what: 'Neon Postgres database (step 5b)' });
  if (!config.blobStoreId && !config.blobToken) missing.push({ key: 'BLOB_STORE_ID', what: 'Vercel Blob store (step 5a)' });
  return { ready: missing.length === 0, missing, imageModel: config.imageModel, textModel: config.textModel };
}

export class SetupError extends Error {
  status = 503;
  constructor(what: string) {
    super(`Setup needed: ${what} is not configured. See docs/DEPLOYMENT.md.`);
  }
}

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export function errorResponse(err: unknown) {
  const status = err instanceof SetupError || err instanceof HttpError ? err.status : 500;
  const message = err instanceof Error ? err.message : 'Something went wrong';
  if (status >= 500) console.error(err);
  return Response.json({ error: message }, { status });
}
