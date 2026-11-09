import sharp from 'sharp';

/** Web-sized JPEG copy of an uploaded KV: long edge 2048px. */
export async function makePreview(input: Buffer) {
  const img = sharp(input, { failOn: 'none', limitInputPixels: 300_000_000 }).rotate();
  const meta = await img.metadata();
  const out = await img
    .resize({ width: 2048, height: 2048, fit: 'inside', withoutEnlargement: true })
    .flatten({ background: '#ffffff' })
    .jpeg({ quality: 88, mozjpeg: true })
    .toBuffer();
  return { buffer: out, width: meta.width ?? null, height: meta.height ?? null };
}

/** Centre-crop to a ratio like "1:3", then re-encode as JPEG. */
export async function cropToRatio(input: Buffer, ratio: string) {
  const [rw, rh] = ratio.split(':').map(Number);
  if (!rw || !rh) return input;
  const img = sharp(input);
  const { width = 0, height = 0 } = await img.metadata();
  if (!width || !height) return input;
  const target = rw / rh;
  let w = width;
  let h = height;
  if (width / height > target) w = Math.round(height * target);
  else h = Math.round(width / target);
  const left = Math.round((width - w) / 2);
  const top = Math.round((height - h) / 2);
  return img.extract({ left, top, width: w, height: h }).jpeg({ quality: 90, mozjpeg: true }).toBuffer();
}

/** Make sure whatever Gemini returns is stored as JPEG (keeps files small). */
export async function toJpeg(input: Buffer) {
  return sharp(input).flatten({ background: '#ffffff' }).jpeg({ quality: 90, mozjpeg: true }).toBuffer();
}
