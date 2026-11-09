export type ImageSize = '1K' | '2K' | '4K';

export type Agent = {
  id: string;
  position: number;
  name: string;
  enabled: boolean;
  input_source: 'kv' | 'agent';
  input_agent_id: string | null;
  aspect_ratio: string;
  crop_to: string | null;
  image_size: ImageSize;
  current_version_id: string | null;
  // joined from prompt_versions
  prompt_text: string;
  avoid_text: string | null;
  version_no: number;
};

export type PromptVersion = {
  id: string;
  agent_id: string;
  version_no: number;
  prompt_text: string;
  avoid_text: string | null;
  note: string | null;
  created_at: string;
  output_count?: number;
  liked_count?: number;
};

export type Kv = {
  id: string;
  blob_pathname: string;
  preview_pathname: string | null;
  filename: string;
  content_type: string;
  bytes: number | null;
  width: number | null;
  height: number | null;
  uploaded_at: string;
};

export type Run = {
  id: string;
  kv_id: string;
  label: string | null;
  created_at: string;
};

export type Output = {
  id: string;
  run_id: string;
  agent_id: string;
  prompt_version_id: string;
  final_prompt: string;
  model: string;
  aspect_ratio: string;
  image_size: string;
  input_blob_pathname: string;
  blob_pathname: string | null;
  status: 'running' | 'done' | 'failed';
  error: string | null;
  duration_ms: number | null;
  rating: 'up' | 'down' | null;
  created_at: string;
};

export type HistoryItem = Output & {
  agent_name: string;
  agent_position: number;
  version_no: number;
  kv_filename: string;
};

export const ASPECT_RATIOS = ['1:1', '2:3', '3:2', '3:4', '4:3', '4:5', '5:4', '9:16', '16:9', '21:9', '1:4', '4:1'] as const;
export const CROP_OPTIONS = ['', '1:3', '1:2', '1:1', '16:9', '9:16'] as const;
export const IMAGE_SIZES: ImageSize[] = ['1K', '2K', '4K'];

export function fileUrl(pathname: string | null | undefined, download = false) {
  if (!pathname) return '';
  return `/api/file?pathname=${encodeURIComponent(pathname)}${download ? '&download=1' : ''}`;
}
