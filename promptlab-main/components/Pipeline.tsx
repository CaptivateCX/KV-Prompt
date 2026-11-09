'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { uploadPresigned } from '@vercel/blob/client';
import { api, seconds } from '@/lib/client';
import type { SetupStatus } from '@/lib/config';
import { fileUrl, type Agent, type Kv, type Output, type Run } from '@/lib/types';
import { SetupBanner } from './SetupBanner';
import { CheckIcon, DownloadIcon, HistoryIcon, PlayIcon, PlusIcon, ThumbDown, ThumbUp, UploadIcon } from './icons';

type GenResult = { output: Output | null; versionNo?: number; error?: string };

const ACCEPT = 'image/jpeg,image/png,image/webp,image/tiff';

export function Pipeline() {
  const [status, setStatus] = useState<SetupStatus | null>(null);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [kv, setKv] = useState<Kv | null>(null);
  const [recent, setRecent] = useState<Kv[]>([]);
  const [run, setRun] = useState<Run | null>(null);
  const [outputs, setOutputs] = useState<Record<string, Output | null>>({});
  const [busy, setBusy] = useState<Record<string, boolean>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [uploading, setUploading] = useState<{ name: string; pct: number } | null>(null);
  const [drag, setDrag] = useState(false);
  const [pageError, setPageError] = useState('');
  const [running, setRunning] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // Initial load
  useEffect(() => {
    (async () => {
      const s = await api<SetupStatus>('/api/status').catch(() => null);
      setStatus(s);
      try {
        const [{ agents }, latest, { kvs }] = await Promise.all([
          api<{ agents: Agent[] }>('/api/agents'),
          api<{ run: Run | null; kv: Kv | null; outputs: Output[] }>('/api/runs/latest'),
          api<{ kvs: Kv[] }>('/api/kvs'),
        ]);
        setAgents(agents);
        setRecent(kvs);
        if (latest.run && latest.kv) {
          setRun(latest.run);
          setKv(latest.kv);
          setOutputs(Object.fromEntries(latest.outputs.map((o) => [o.agent_id, o])));
        } else if (kvs[0]) {
          setKv(kvs[0]);
        }
      } catch (e) {
        if ((e as { status?: number }).status !== 503) setPageError((e as Error).message);
      } finally {
        setLoaded(true);
      }
    })();
  }, []);

  // ---------- Upload ----------
  const handleFiles = useCallback(async (files: FileList | File[]) => {
    const list = Array.from(files).filter((f) => ACCEPT.split(',').includes(f.type));
    if (!list.length) {
      setPageError('Please choose a JPG, PNG, WebP or TIFF file.');
      return;
    }
    setPageError('');
    for (const file of list) {
      try {
        setUploading({ name: file.name, pct: 0 });
        const safeName = file.name.replace(/[^\w.\-]+/g, '_');
        const blob = await uploadPresigned(`kvs/${safeName}`, file, {
          access: 'private',
          handleUploadUrl: '/api/upload',
          multipart: file.size > 8 * 1024 * 1024,
          onUploadProgress: (e) => setUploading({ name: file.name, pct: e.percentage }),
        });
        const { kv: saved } = await api<{ kv: Kv }>('/api/kvs', {
          method: 'POST',
          json: { pathname: blob.pathname, filename: file.name, bytes: file.size },
        });
        setKv(saved);
        setRecent((r) => [saved, ...r.filter((k) => k.id !== saved.id)].slice(0, 12));
        setRun(null);
        setOutputs({});
        setErrors({});
      } catch (e) {
        setPageError(`Couldn't upload ${file.name}: ${(e as Error).message}`);
      } finally {
        setUploading(null);
      }
    }
  }, []);

  function pickKv(k: Kv) {
    if (k.id === kv?.id) return;
    setKv(k);
    setRun(null);
    setOutputs({});
    setErrors({});
  }

  // ---------- Generation ----------
  async function ensureRun(): Promise<Run> {
    if (run && kv && run.kv_id === kv.id) return run;
    if (!kv) throw new Error('Upload a key visual first.');
    const { run: created } = await api<{ run: Run }>('/api/runs', { method: 'POST', json: { kvId: kv.id } });
    setRun(created);
    return created;
  }

  async function generate(agent: Agent, runId: string): Promise<GenResult> {
    setBusy((b) => ({ ...b, [agent.id]: true }));
    setErrors((e) => ({ ...e, [agent.id]: '' }));
    try {
      const promptText = drafts[agent.id] ?? agent.prompt_text;
      const res = await api<GenResult>(`/api/runs/${runId}/agents/${agent.id}`, {
        method: 'POST',
        json: { promptText, avoidText: agent.avoid_text },
      });
      setOutputs((o) => ({ ...o, [agent.id]: res.output }));
      setAgents((list) => list.map((a) => (a.id === agent.id ? { ...a, prompt_text: promptText, version_no: res.versionNo ?? a.version_no } : a)));
      setDrafts((d) => {
        const { [agent.id]: _, ...rest } = d;
        return rest;
      });
      return res;
    } catch (e) {
      const data = (e as { data?: GenResult }).data;
      setErrors((x) => ({ ...x, [agent.id]: (e as Error).message }));
      if (data?.output) setOutputs((o) => ({ ...o, [agent.id]: data.output }));
      return { output: data?.output ?? null, error: (e as Error).message };
    } finally {
      setBusy((b) => ({ ...b, [agent.id]: false }));
    }
  }

  async function runAll() {
    setPageError('');
    setRunning(true);
    try {
      if (!kv) throw new Error('Upload a key visual first.');
      const { run: created } = await api<{ run: Run }>('/api/runs', { method: 'POST', json: { kvId: kv.id } });
      setRun(created);
      setOutputs({});
      setErrors({});
      const enabled = agents.filter((a) => a.enabled);
      const promises = new Map<string, Promise<GenResult>>();
      const start = (agent: Agent): Promise<GenResult> => {
        const existing = promises.get(agent.id);
        if (existing) return existing;
        const upstream = agent.input_source === 'agent' ? enabled.find((a) => a.id === agent.input_agent_id) : undefined;
        const p = (async (): Promise<GenResult> => {
          if (agent.input_source === 'agent') {
            if (!upstream) {
              const msg = 'Its input agent is switched off, so it was skipped.';
              setErrors((x) => ({ ...x, [agent.id]: msg }));
              return { output: null, error: msg };
            }
            const up = await start(upstream);
            if (!up.output || up.output.status !== 'done') {
              const msg = `Skipped because "${upstream.name}" didn't produce an image.`;
              setErrors((x) => ({ ...x, [agent.id]: msg }));
              return { output: null, error: msg };
            }
          }
          return generate(agent, created.id);
        })();
        promises.set(agent.id, p);
        return p;
      };
      await Promise.all(enabled.map(start));
    } catch (e) {
      setPageError((e as Error).message);
    } finally {
      setRunning(false);
    }
  }

  async function rerun(agent: Agent) {
    setPageError('');
    try {
      const r = await ensureRun();
      await generate(agent, r.id);
    } catch (e) {
      setErrors((x) => ({ ...x, [agent.id]: (e as Error).message }));
    }
  }

  async function rate(agentId: string, output: Output, rating: 'up' | 'down') {
    const next = output.rating === rating ? null : rating;
    setOutputs((o) => ({ ...o, [agentId]: { ...output, rating: next } }));
    try {
      await api(`/api/outputs/${output.id}`, { method: 'PATCH', json: { rating: next } });
    } catch {
      setOutputs((o) => ({ ...o, [agentId]: output }));
    }
  }

  async function addAgent() {
    try {
      const { agent } = await api<{ agent: Agent }>('/api/agents', { method: 'POST', json: {} });
      window.location.href = `/agents/${agent.id}`;
    } catch (e) {
      setPageError((e as Error).message);
    }
  }

  const anyBusy = running || Object.values(busy).some(Boolean);

  return (
    <main className="page">
      <div className="title-row">
        <div>
          <p className="eyebrow">{run ? 'Current run' : 'New run'}</p>
          <h1>{run?.label ?? (kv ? kv.filename.replace(/\.[^.]+$/, '') : 'Key visual prompt testing')}</h1>
        </div>
        <div className="row">
          <Link href="/history" className="btn"><HistoryIcon /> History</Link>
          <button type="button" className="btn btn-primary" onClick={runAll} disabled={!kv || anyBusy || !agents.length}>
            <span style={{ color: 'var(--yellow)', display: 'inline-flex' }}><PlayIcon size={14} /></span>
            {running ? 'Running…' : 'Run all agents'}
          </button>
        </div>
      </div>

      <SetupBanner status={status} />
      {pageError && <p className="error-text" role="alert">{pageError}</p>}

      {/* Upload box */}
      <label
        htmlFor="kvfile"
        className={`upload${drag ? ' drag' : ''}`}
        onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => { e.preventDefault(); setDrag(false); if (e.dataTransfer.files.length) handleFiles(e.dataTransfer.files); }}
      >
        <span className="upload-icon"><UploadIcon size={28} /></span>
        <span className="upload-title">Drop key visuals here</span>
        <span className="muted" style={{ fontSize: 15 }}>
          or <span style={{ color: 'var(--indigo)', fontWeight: 600, textDecoration: 'underline' }}>browse your files</span>
        </span>
        <span className="muted" style={{ fontSize: 13 }}>JPG, PNG, WebP or TIFF · up to 50 MB each</span>
        {uploading && (
          <>
            <span style={{ fontSize: 14, fontWeight: 600 }}>Uploading {uploading.name}…</span>
            <div className="progress" role="progressbar" aria-label="Upload progress" aria-valuenow={Math.round(uploading.pct)} aria-valuemin={0} aria-valuemax={100}>
              <div style={{ width: `${uploading.pct}%` }} />
            </div>
          </>
        )}
        {kv && !uploading && (
          <span className="upload-current">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={fileUrl(kv.preview_pathname)} alt="" />
            <span>
              <span style={{ display: 'block', fontWeight: 700, fontSize: 14 }}>{kv.filename}</span>
              <span className="muted" style={{ fontSize: 13 }}>Loaded · drop a new file to replace</span>
            </span>
          </span>
        )}
        <input
          id="kvfile"
          ref={fileRef}
          type="file"
          multiple
          accept={ACCEPT}
          className="sr-only"
          onChange={(e) => { if (e.target.files?.length) handleFiles(e.target.files); e.target.value = ''; }}
        />
      </label>

      {recent.length > 1 && (
        <section aria-labelledby="recent-h" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <p id="recent-h" className="label">Recent key visuals</p>
          <div className="recent">
            {recent.map((k) => (
              <button type="button" key={k.id} aria-pressed={k.id === kv?.id} onClick={() => pickKv(k)}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={fileUrl(k.preview_pathname)} alt="" />
                {k.filename}
              </button>
            ))}
          </div>
        </section>
      )}

      {/* Agents */}
      <section aria-labelledby="agents-h" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div className="title-row" style={{ alignItems: 'center' }}>
          <div>
            <h2 id="agents-h">Agents</h2>
            <p className="muted" style={{ margin: '4px 0 0', fontSize: 14 }}>
              Edit a prompt and press Re-run. Every prompt you run is saved as a version, so nothing is lost.
            </p>
          </div>
          <button type="button" className="btn btn-dashed" onClick={addAgent} disabled={!agents.length && !loaded}>
            <PlusIcon /> Add agent
          </button>
        </div>

        {!loaded && <p className="muted">Loading…</p>}

        <div className="agents-grid">
          {agents.map((agent) => {
            const out = outputs[agent.id] ?? null;
            const isBusy = !!busy[agent.id];
            const draft = drafts[agent.id];
            const edited = draft !== undefined && draft !== agent.prompt_text;
            const err = errors[agent.id];
            const upstream = agent.input_source === 'agent' ? agents.find((a) => a.id === agent.input_agent_id) : null;
            return (
              <article key={agent.id} className="card tile" aria-labelledby={`a-${agent.id}`}>
                <div className="tile-head">
                  <span className="num">{agent.position}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <h3 id={`a-${agent.id}`}>{agent.name}</h3>
                    {upstream && <span className="muted" style={{ fontSize: 12 }}>Uses {upstream.name}</span>}
                  </div>
                  <StatusPill enabled={agent.enabled} busy={isBusy} output={out} />
                </div>

                <div className="tile-body">
                  <div className="row" style={{ gap: 8 }}>
                    <label htmlFor={`p-${agent.id}`} className="label">Prompt</label>
                    <span className="ver">v{agent.version_no}</span>
                    {edited && <span className="tag">Edited · saves as new version on run</span>}
                  </div>
                  <textarea
                    id={`p-${agent.id}`}
                    rows={6}
                    className={`textarea${edited ? ' edited' : ''}`}
                    value={draft ?? agent.prompt_text}
                    onChange={(e) => setDrafts((d) => ({ ...d, [agent.id]: e.target.value }))}
                  />
                </div>

                <div className="tile-actions">
                  <button type="button" className="btn" onClick={() => rerun(agent)} disabled={!kv || isBusy || running}>
                    <PlayIcon /> {isBusy ? 'Generating…' : out ? 'Re-run' : 'Run'}
                  </button>
                  {edited && (
                    <button type="button" className="btn btn-sm" onClick={() => setDrafts((d) => { const { [agent.id]: _, ...r } = d; return r; })}>
                      Undo edits
                    </button>
                  )}
                  <Link href={`/agents/${agent.id}`} style={{ padding: '0 8px', fontSize: 14 }}>Open editor</Link>
                </div>

                <div className="output-area">
                  {isBusy ? (
                    <div className="generating" role="status"><span className="spinner" aria-hidden="true" />Generating…</div>
                  ) : out?.status === 'done' && out.blob_pathname ? (
                    <a href={fileUrl(out.blob_pathname)} target="_blank" rel="noreferrer" style={{ display: 'contents' }}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={fileUrl(out.blob_pathname)} alt={`Output from ${agent.name}`} />
                    </a>
                  ) : (
                    <p className="placeholder">
                      {!agent.enabled
                        ? 'This agent is switched off.'
                        : out?.status === 'failed'
                          ? 'This attempt failed. See the message below, then try again.'
                          : kv
                            ? 'No output yet. Press Run.'
                            : 'Upload a key visual to start.'}
                    </p>
                  )}
                </div>
                {err && <p className="error-text" style={{ padding: '10px 16px 0' }} role="alert">{err}</p>}

                <div className="tile-foot">
                  <button type="button" className="icon-btn" aria-label="Good output" aria-pressed={out?.rating === 'up'} disabled={out?.status !== 'done'} onClick={() => out && rate(agent.id, out, 'up')}>
                    <ThumbUp />
                  </button>
                  <button type="button" className="icon-btn" aria-label="Bad output" aria-pressed={out?.rating === 'down'} disabled={out?.status !== 'done'} onClick={() => out && rate(agent.id, out, 'down')}>
                    <ThumbDown />
                  </button>
                  {out?.status === 'done' && out.blob_pathname ? (
                    <a className="icon-btn" href={fileUrl(out.blob_pathname, true)} aria-label="Download output"><DownloadIcon size={18} /></a>
                  ) : (
                    <span className="icon-btn" aria-hidden="true" style={{ opacity: 0.4 }}><DownloadIcon size={18} /></span>
                  )}
                  <Link href={`/history?agentId=${agent.id}`} style={{ marginLeft: 'auto', fontSize: 14, display: 'inline-flex', alignItems: 'center', minHeight: 44 }}>
                    Past outputs
                  </Link>
                </div>
              </article>
            );
          })}
        </div>
      </section>
    </main>
  );
}

function StatusPill({ enabled, busy, output }: { enabled: boolean; busy: boolean; output: Output | null }) {
  if (!enabled) return <span className="pill pill-off">Off</span>;
  if (busy) return <span className="pill pill-running">Running</span>;
  if (output?.status === 'done') return <span className="pill pill-done"><CheckIcon /> Done · {seconds(output.duration_ms)}</span>;
  if (output?.status === 'failed') return <span className="pill pill-failed">Failed</span>;
  return <span className="pill pill-idle">Ready</span>;
}
