import { Suspense } from 'react';
import { History } from '@/components/History';

export const metadata = { title: 'History · KV Prompt Lab' };

export default function HistoryPage() {
  return (
    <Suspense fallback={<main className="page"><p className="muted">Loading…</p></main>}>
      <History />
    </Suspense>
  );
}
