import { GoogleGenAI } from '@google/genai';
import { config, SetupError } from './config';

let ai: GoogleGenAI | null = null;
function client() {
  if (!config.geminiKey) throw new SetupError('the Gemini API key (GEMINI_API_KEY)');
  if (!ai) ai = new GoogleGenAI({ apiKey: config.geminiKey });
  return ai;
}

/** One image in, one prompt, one image out (Gemini image model via the Interactions API). */
export async function generateImage(opts: {
  prompt: string;
  inputImage: Buffer;
  inputMime: string;
  aspectRatio: string;
  imageSize: string;
}): Promise<{ buffer: Buffer; mime: string }> {
  const interaction = await client().interactions.create({
    model: config.imageModel,
    input: [
      { type: 'text', text: opts.prompt },
      { type: 'image', mime_type: opts.inputMime, data: opts.inputImage.toString('base64') },
    ],
    response_format: {
      type: 'image',
      aspect_ratio: opts.aspectRatio,
      image_size: opts.imageSize,
      mime_type: 'image/jpeg',
    },
    store: false,
  });

  const img = interaction.output_image;
  if (!img?.data) {
    const reason = interaction.output_text?.trim();
    throw new Error(reason ? `The model returned text instead of an image: ${reason}` : 'The model returned no image.');
  }
  return { buffer: Buffer.from(img.data, 'base64'), mime: img.mime_type || 'image/jpeg' };
}

/** Argon (text only): look at input + output and suggest a better prompt. */
export async function suggestPrompt(opts: {
  agentName: string;
  promptText: string;
  avoidText: string | null;
  input: { buffer: Buffer; mime: string };
  output?: { buffer: Buffer; mime: string } | null;
  goal?: string;
}): Promise<string> {
  const lines = [
    'You help a design team tune prompts for an image-editing model.',
    `Agent: ${opts.agentName}.`,
    opts.goal ? `What the team wants from this agent: ${opts.goal}` : '',
    `Current prompt: """${opts.promptText}"""`,
    opts.avoidText ? `Current "avoid" list: """${opts.avoidText}"""` : '',
    opts.output
      ? 'The first image is the input key visual. The second image is what the current prompt produced.'
      : 'The image is the input key visual. The prompt has not been run yet.',
    'Write ONE improved prompt for the image model: clear, specific, imperative, under 80 words.',
    'Then on a new line starting "Why:" give one short sentence on what you changed and why.',
    'Return only those two parts.',
  ].filter(Boolean);

  const input: Array<
    { type: 'text'; text: string } | { type: 'image'; mime_type: string; data: string }
  > = [
    { type: 'text', text: lines.join('\n') },
    { type: 'image', mime_type: opts.input.mime, data: opts.input.buffer.toString('base64') },
  ];
  if (opts.output) input.push({ type: 'image', mime_type: opts.output.mime, data: opts.output.buffer.toString('base64') });

  const interaction = await client().interactions.create({
    model: config.textModel,
    input,
    generation_config: { thinking_level: 'low' },
    store: false,
  });
  const text = interaction.output_text?.trim();
  if (!text) throw new Error('No suggestion came back.');
  return text;
}
