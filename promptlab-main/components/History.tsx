'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { api, timeAgo, seconds } from '@/lib/client';
import type { SetupStatus } from '@/lib/config';
import { fileUrl, type Agent, type HistoryItem } from '@/lib/types';
import { SetupBanner } from './SetupBanner';
import { BackIcon, CopyIcon, DownloadIcon, ThumbDown, ThumbUp } from './icons';

export function History() {
  const params = useSearchParams();
  const [status, setStatus] = useState<SetupStatus | null>(null);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [agentId, setAgentId] = useState<string>(params.get('agentId') ?? '');
  const [query, setQuery] = useState('');
  const [search, setSearch] = useState('');
  const [items, setItems] = useState<HistoryItem[]>([]);
  const [next, setNext] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  useEffect(() => {
    api<SetupStatus>('/api/status').then(setStatus).catch(() => null);
    api<{ agents: Agent[] }>('/api/agents').then((r) => setAgents(r.agents)).catch(() => null);
  }, []);

  const load = useCallback(async (before?: string | null) => {
    setLoading(true);
    setError('');
    try {
      const qs = new URLSearchParams();
      if (agentId) qs.set('agentId', agentId);
      if (search) qs.set('q', search);
      if (before) qs.set('before', before);
      const res = await api<{ items: HistoryItem[]; next: string | null }>(`/api/history?${qs}`);
      setItems((prev) => (before ? [...prev, ...res.items] : res.items));
      setNext(res.next);
    } catch (e) {
      if ((e as { status?: number }).status !== 503) setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [agentId, search]);

  useEffect(() => { load(null); }, [load]);

  function flash(msg: string) {
    setNotice(msg);
    setTimeout(() => setNotice(''), 2600);
  }

  async function rate(item: HistoryItem, rating: 'up' | 'down') {
    const nextRating = item.rating === rating ? null : rating;
    setItems((list) => list.map((i) => (i.id === item.id ? { ...i, rating: nextRating } : i)));
    await api(`/api/outputs/${item.id}`, { method: 'PATCH', json: { rating: nextRating } }).catch(() =>
      setItems((list) => list.map((i) => (i.id === item.id ? item : i))),
    );
  }

  async function usePrompt(item: HistoryItem) {
    try {
      await api(`/api/agents/${item.agent_id}`, { method: 'PATCH', json: { current_version_id: item.prompt_version_id } });
      flash(`${item.agent_name} now uses v${item.version_no}`);
    } catch (e) {
      flash((e as Error).message);
    }
  }

  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      flash('Prompt copied');
    } catch {
      flash('Copy failed — select the text instead');
    }
  }

  const tabs = [{ id: '', label: 'All agents' }, ...agents.map((a) => ({ id: a.id, label: `${a.position} · ${a.name}` }))];

  return (
    <main className="page">
      <div>
        <Link href="/" className="row" style={{ gap: 6, fontSize: 14, minHeight: 32 }}><BackIcon /> Back to pipeline</Link>
        <h1>History</h1>
        <p className="muted" style={{ margin: '6px 0 0', fontSize: 15 }}>Every output, next to the exact prompt that made it.</p>
      </div>

      <SetupBanner status={status} />

      <div className="title-row">
        <div className="filters" role="group" aria-label="Filter by agent">
          {tabs.map((t) => (
            <button type="button" key={t.id || 'all'} aria-pressed={agentId === t.id} onClick={() => setAgentId(t.id)}>
              {t.label}
            </button>
          ))}
        </div>
        <form
          className="field"
          style={{ flex: '0 1 340px', minWidth: 220 }}
          onSubmit={(e) => { e.preventDefault(); setSearch(query.trim()); }}
          role="search"
        >
          <label htmlFor="q" className="label">Search prompts</label>
          <input id="q" type="search" className="input" placeholder="e.g. maximum, narrow, no text" value={query}
            onChange={(e) => { setQuery(e.target.value); if (!e.target.value) setSearch(''); }} />
        </form>
      </div>

      {error && <p className="error-text" role="alert">{error}</p>}
      {!loading && !items.length && !error && (
        <div className="card card-pad" style={{ textAlign: 'center', color: 'var(--ink-muted)' }}>
          {search || agentId ? 'No outputs match. Try another word or agent.' : 'No outputs yet. Run some agents on the pipeline page.'}
        </div>
      )}

      <ol className="hist-list">
        {items.map((item) => (
          <li key={item.id} className="card hist-item">
            <div className="hist-thumb">
              {item.status === 'done' && item.blob_pathname ? (
                <a href={fileUrl(item.blob_pathname)} target="_blank" rel="noreferrer" style={{ display: 'contents' }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={fileUrl(item.blob_pathname)} alt={`Output from ${item.agent_name}`} loading="lazy" />
                </a>
              ) : (
                <span className="error-text" style={{ textAlign: 'center' }}>Failed{item.error ? `: ${item.error.slice(0, 140)}` : ''}</span>
              )}
            </div>
            <div className="hist-body">
              <div className="row" style={{ gap: 8 }}>
                <span className="num" style={{ width: 26, height: 26, fontSize: 13 }}>{item.agent_position}</span>
                <h2 style={{ fontSize: 16 }}>{item.agent_name}</h2>
                <span className="ver">v{item.version_no}</span>
                <span className="muted" style={{ marginLeft: 'auto', fontSize: 13 }}>
                  {timeAgo(item.created_at)} · {item.kv_filename}{item.duration_ms ? ` · ${seconds(item.duration_ms)}` : ''}
                </span>
              </div>
              <p className="prompt-box">{item.final_prompt}</p>
              <div className="row" style={{ gap: 8 }}>
                <button type="button" className="btn" onClick={() => usePrompt(item)}>Use this prompt</button>
                <button type="button" className="icon-btn" aria-label="Copy prompt" onClick={() => copy(item.final_prompt)}><CopyIcon size={18} /></button>
                {item.status === 'done' && item.blob_pathname && (
                  <a className="icon-btn" href={fileUrl(item.blob_pathname, true)} aria-label="Download output"><DownloadIcon size={18} /></a>
                )}
                <button type="button" className="icon-btn" aria-label="Good output" aria-pressed={item.rating === 'up'} onClick={() => rate(item, 'up')} disabled={item.status !== 'done'}><ThumbUp /></button>
                <button type="button" className="icon-btn" aria-label="Bad output" aria-pressed={item.rating === 'down'} onClick={() => rate(item, 'down')} disabled={item.status !== 'done'}><ThumbDown /></button>
                <span className="muted" style={{ fontSize: 12 }}>{item.model} · {item.aspect_ratio} · {item.image_size}</span>
              </div>
            </div>
          </li>
        ))}
      </ol>

      {loading && <p className="muted">Loading…</p>}
      {next && !loading && (
        <button type="button" className="btn" style={{ alignSelf: 'center' }} onClick={() => load(next)}>Load more</button>
      )}
      {notice && <div className="notice" role="status">{notice}</div>}
    </main>
  );
}
