'use client';

import type { SetupStatus } from '@/lib/config';

export function SetupBanner({ status }: { status: SetupStatus | null }) {
  if (!status || status.ready) return null;
  return (
    <div className="banner" role="status">
      <strong>Almost there: the app is live, but some services aren&apos;t connected yet.</strong>
      <ul>
        {status.missing.map((m) => (
          <li key={m.key}>
            <code>{m.key}</code> — {m.what}
          </li>
        ))}
      </ul>
      <div style={{ marginTop: 8 }}>
        Add these in Vercel (Settings → Environment Variables, or Storage for Blob and Neon), then redeploy.
      </div>
    </div>
  );
}
