type P = { size?: number };
const base = (size = 16) => ({
  width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor',
  strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, 'aria-hidden': true,
});

export const PlayIcon = ({ size = 12 }: P) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M7 4l13 8-13 8z" /></svg>
);
export const UploadIcon = ({ size }: P) => <svg {...base(size)}><path d="M12 16V4M7 9l5-5 5 5M4 20h16" /></svg>;
export const DownloadIcon = ({ size }: P) => <svg {...base(size)}><path d="M12 4v12M7 11l5 5 5-5M4 20h16" /></svg>;
export const HistoryIcon = ({ size }: P) => <svg {...base(size)}><path d="M3 12a9 9 0 1 0 3-6.7L3 8" /><path d="M3 3v5h5" /><path d="M12 7v5l3 2" /></svg>;
export const PlusIcon = ({ size }: P) => <svg {...base(size)} strokeWidth={2.2}><path d="M12 5v14M5 12h14" /></svg>;
export const CheckIcon = ({ size = 12 }: P) => <svg {...base(size)} strokeWidth={3}><path d="M5 12l5 5 9-10" /></svg>;
export const BackIcon = ({ size }: P) => <svg {...base(size)}><path d="M19 12H5M11 6l-6 6 6 6" /></svg>;
export const CopyIcon = ({ size }: P) => <svg {...base(size)}><rect x="8" y="8" width="12" height="12" rx="2" /><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3" /></svg>;
export const SparkIcon = ({ size }: P) => <svg {...base(size)}><path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z" /></svg>;
export const ThumbUp = ({ size = 18 }: P) => (
  <svg {...base(size)}><path d="M7 10v11H3V10h4zM7 10l4-8a2 2 0 0 1 3 2l-1 5h6a2 2 0 0 1 2 2.3l-1.4 7A2 2 0 0 1 17.6 21H7" /></svg>
);
export const ThumbDown = ({ size = 18 }: P) => (
  <svg {...base(size)} style={{ transform: 'rotate(180deg)' }}><path d="M7 10v11H3V10h4zM7 10l4-8a2 2 0 0 1 3 2l-1 5h6a2 2 0 0 1 2 2.3l-1.4 7A2 2 0 0 1 17.6 21H7" /></svg>
);
