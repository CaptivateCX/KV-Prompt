'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { api, timeAgo } from '@/lib/client';
import type { SetupStatus } from '@/lib/config';
import { ASPECT_RATIOS, CROP_OPTIONS, IMAGE_SIZES, fileUrl, type Agent, type Output, type PromptVersion } from '@/lib/types';
import { SetupBanner } from './SetupBanner';
import { BackIcon, SparkIcon } from './icons';

type VersionsResponse = { versions: PromptVersion[]; outputs: (Output & { kv_filename: string })[] };

export function AgentEditor({ id }: { id: string }) {
  const [status, setStatus] = useState<SetupStatus | null>(null);
  const [agent, setAgent] = useState<Agent | null>(null);
  const [all, setAll] = useState<Agent[]>([]);
  const [versions, setVersions] = useState<PromptVersion[]>([]);
  const [outputs, setOutputs] = useState<VersionsResponse['outputs']>([]);
  const [name, setName] = useState('');
  const [prompt, setPrompt] = useState('');
  const [avoid, setAvoid] = useState('');
  const [note, setNote] = useState('');
  const [goal, setGoal] = useState('');
  const [suggestion, setSuggestion] = useState<{ prompt: string; why: string } | null>(null);
  const [suggesting, setSuggesting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const flash = (msg: string) => { setNotice(msg); setTimeout(() => setNotice(''), 2600); };

  const loadVersions = useCallback(async () => {
    const res = await api<VersionsResponse>(`/api/agents/${id}/versions`);
    setVersions(res.versions);
    setOutputs(res.outputs);
  }, [id]);

  useEffect(() => {
    api<SetupStatus>('/api/status').then(setStatus).catch(() => null);
    (async () => {
      try {
        const [{ agent }, { agents }] = await Promise.all([
          api<{ agent: Agent }>(`/api/agents/${id}`),
          api<{ agents: Agent[] }>('/api/agents'),
        ]);
        setAgent(agent);
        setAll(agents);
        setName(agent.name);
        setPrompt(agent.prompt_text);
        setAvoid(agent.avoid_text ?? '');
        await loadVersions();
      } catch (e) {
        if ((e as { status?: number }).status !== 503) setError((e as Error).message);
      }
    })();
  }, [id, loadVersions]);

  async function patch(body: Record<string, unknown>, msg = 'Saved') {
    setError('');
    try {
      const res = await api<{ agent: Agent }>(`/api/agents/${id}`, { method: 'PATCH', json: body });
      setAgent(res.agent);
      flash(msg);
      return res.agent;
    } catch (e) {
      setError((e as Error).message);
      return null;
    }
  }

  async function save(makeDefault: boolean) {
    setSaving(true);
    setError('');
    try {
      const res = await api<{ version: PromptVersion; agent: Agent }>(`/api/agents/${id}/versions`, {
        method: 'POST',
        json: { promptText: prompt, avoidText: avoid || null, note: note || null, makeDefault },
      });
      setAgent(res.agent);
      setNote('');
      await loadVersions();
      flash(makeDefault ? `Saved as v${res.version.version_no} and made default` : `Saved as v${res.version.version_no}`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function suggest() {
    setSuggesting(true);
    setError('');
    setSuggestion(null);
    try {
      setSuggestion(await api<{ prompt: string; why: string }>(`/api/agents/${id}/suggest`, {
        method: 'POST',
        json: { promptText: prompt, avoidText: avoid || null, goal: goal || undefined },
      }));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSuggesting(false);
    }
  }

  function loadVersion(v: PromptVersion) {
    setPrompt(v.prompt_text);
    setAvoid(v.avoid_text ?? '');
    window.scrollTo({ top: 0, behavior: 'smooth' });
    flash(`Loaded v${v.version_no} into the editor`);
  }

  if (!agent) {
    return (
      <main className="page">
        <Link href="/" className="row" style={{ gap: 6, fontSize: 14 }}><BackIcon /> Back to pipeline</Link>
        <SetupBanner status={status} />
        {error ? <p className="error-text" role="alert">{error}</p> : <p className="muted">Loading…</p>}
      </main>
    );
  }

  const dirty = prompt !== agent.prompt_text || (avoid || null) !== (agent.avoid_text || null);
  const others = all.filter((a) => a.id !== agent.id);

  return (
    <main className="page">
      <div className="title-row">
        <div>
          <Link href="/" className="row" style={{ gap: 6, fontSize: 14, minHeight: 32 }}><BackIcon /> Back to pipeline</Link>
          <p className="eyebrow" style={{ marginTop: 8 }}>Agent {agent.position}</p>
          <h1>{agent.name}</h1>
          <p className="muted" style={{ margin: '6px 0 0', fontSize: 14 }}>
            Default prompt is <strong style={{ color: 'var(--ink)' }}>v{agent.version_no}</strong>
            {dirty && <span className="tag" style={{ marginLeft: 8 }}>Unsaved edits</span>}
          </p>
        </div>
        <div className="row">
          <button type="button" className="btn" onClick={() => { setPrompt(agent.prompt_text); setAvoid(agent.avoid_text ?? ''); }} disabled={!dirty}>Discard edits</button>
          <button type="button" className="btn" onClick={() => save(false)} disabled={saving || !dirty}>Save as new version</button>
          <button type="button" className="btn btn-primary" onClick={() => save(true)} disabled={saving || !prompt.trim()}>Save and make default</button>
        </div>
      </div>

      <SetupBanner status={status} />
      {error && <p className="error-text" role="alert">{error}</p>}

      <div className="editor-cols">
        <div className="editor-main">
          <section className="card card-pad" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div className="field">
              <label htmlFor="name" className="label">Agent name</label>
              <input id="name" className="input" value={name} onChange={(e) => setName(e.target.value)}
                onBlur={() => name.trim() && name !== agent.name && patch({ name }, 'Name saved')} />
            </div>
            <div className="field">
              <label htmlFor="prompt" className="label">Prompt</label>
              <textarea id="prompt" rows={8} className={`textarea${dirty ? ' edited' : ''}`} value={prompt} onChange={(e) => setPrompt(e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="avoid" className="label">Avoid (optional)</label>
              <textarea id="avoid" rows={2} className="textarea" value={avoid} onChange={(e) => setAvoid(e.target.value)}
                placeholder="e.g. No extra copy or small print. Don't redraw the logo." />
              <span className="muted" style={{ fontSize: 13 }}>Added to the end of the prompt as &ldquo;Do not: …&rdquo;</span>
            </div>
            <div className="field">
              <label htmlFor="note" className="label">Note for this version (optional)</label>
              <input id="note" className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="What did you change and why?" />
            </div>
          </section>

          <section className="card card-pad" style={{ display: 'flex', flexDirection: 'column', gap: 12 }} aria-labelledby="argon-h">
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <h2 id="argon-h" style={{ fontSize: 17 }}>Suggest a rewrite</h2>
              <span className="muted" style={{ fontSize: 13 }}>Uses {status?.textModel ?? 'Argon'}</span>
            </div>
            <p className="muted" style={{ margin: 0, fontSize: 14 }}>
              Argon looks at this agent&apos;s latest input and output and proposes clearer wording. Nothing is saved until you choose to.
            </p>
            <div className="field">
              <label htmlFor="goal" className="label">What should the output look like? (optional)</label>
              <input id="goal" className="input" value={goal} onChange={(e) => setGoal(e.target.value)} placeholder="e.g. keep the model's face fully in frame, no claim panel" />
            </div>
            <div className="row">
              <button type="button" className="btn" onClick={suggest} disabled={suggesting}><SparkIcon /> {suggesting ? 'Thinking…' : 'Suggest a rewrite'}</button>
            </div>
            {suggestion && (
              <div className="suggestion">
                <p className="prompt-box" style={{ background: 'var(--white)' }}>{suggestion.prompt}</p>
                {suggestion.why && <p className="muted" style={{ margin: 0, fontSize: 14 }}><strong>Why:</strong> {suggestion.why}</p>}
                <div className="row">
                  <button type="button" className="btn btn-primary btn-sm" onClick={() => { setPrompt(suggestion.prompt); setSuggestion(null); }}>Use this wording</button>
                  <button type="button" className="btn btn-sm" onClick={() => setSuggestion(null)}>Dismiss</button>
                </div>
              </div>
            )}
          </section>

          <section className="card card-pad" style={{ display: 'flex', flexDirection: 'column', gap: 14 }} aria-labelledby="settings-h">
            <h2 id="settings-h" style={{ fontSize: 17 }}>Settings</h2>
            <label className="switch">
              <input type="checkbox" checked={agent.enabled} onChange={(e) => patch({ enabled: e.target.checked }, e.target.checked ? 'Agent switched on' : 'Agent switched off')} />
              Run this agent in &ldquo;Run all agents&rdquo;
            </label>
            <div className="settings-grid">
              <div className="field">
                <label htmlFor="input" className="label">Input image</label>
                <select id="input" className="select"
                  value={agent.input_source === 'agent' ? agent.input_agent_id ?? '' : 'kv'}
                  onChange={(e) => patch(e.target.value === 'kv' ? { input_source: 'kv' } : { input_source: 'agent', input_agent_id: e.target.value })}>
                  <option value="kv">The key visual</option>
                  {others.map((a) => <option key={a.id} value={a.id}>Output of {a.position} · {a.name}</option>)}
                </select>
              </div>
              <div className="field">
                <label htmlFor="ratio" className="label">Aspect ratio</label>
                <select id="ratio" className="select" value={agent.aspect_ratio} onChange={(e) => patch({ aspect_ratio: e.target.value })}>
                  {ASPECT_RATIOS.map((r) => <option key={r} value={r}>{r}</option>)}
                </select>
              </div>
              <div className="field">
                <label htmlFor="crop" className="label">Crop after generating</label>
                <select id="crop" className="select" value={agent.crop_to ?? ''} onChange={(e) => patch({ crop_to: e.target.value || null })}>
                  {CROP_OPTIONS.map((c) => <option key={c || 'none'} value={c}>{c || 'No crop'}</option>)}
                </select>
              </div>
              <div className="field">
                <label htmlFor="size" className="label">Image size</label>
                <select id="size" className="select" value={agent.image_size} onChange={(e) => patch({ image_size: e.target.value })}>
                  {IMAGE_SIZES.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div className="field">
                <label htmlFor="pos" className="label">Position</label>
                <input id="pos" type="number" min={1} className="input" defaultValue={agent.position}
                  onBlur={(e) => Number(e.target.value) !== agent.position && patch({ position: Number(e.target.value) }, 'Position saved')} />
              </div>
            </div>
          </section>
        </div>

        <aside className="editor-side" aria-labelledby="versions-h">
          <h2 id="versions-h" style={{ fontSize: 17 }}>Versions</h2>
          <p className="muted" style={{ margin: 0, fontSize: 14 }}>Each version with its latest outputs, so you can compare wording side by side.</p>
          {versions.map((v) => {
            const vOutputs = outputs.filter((o) => o.prompt_version_id === v.id).slice(0, 4);
            const isDefault = v.id === agent.current_version_id;
            return (
              <article key={v.id} className={`card version${isDefault ? ' current' : ''}`}>
                <div className="row" style={{ gap: 8 }}>
                  <span className="ver" style={isDefault ? { background: 'var(--indigo)', color: 'var(--white)' } : undefined}>
                    v{v.version_no}{isDefault ? ' · default' : ''}
                  </span>
                  <span className="muted" style={{ fontSize: 13 }}>{timeAgo(v.created_at)}</span>
                  <span className="muted" style={{ fontSize: 13, marginLeft: 'auto' }}>
                    {v.output_count ?? 0} output{v.output_count === 1 ? '' : 's'} · {v.liked_count ?? 0} liked
                  </span>
                </div>
                {v.note && <p style={{ margin: 0, fontSize: 14 }}>{v.note}</p>}
                <p className="prompt-box">{v.prompt_text}{v.avoid_text ? `\n\nDo not: ${v.avoid_text}` : ''}</p>
                {vOutputs.length > 0 && (
                  <div className="thumbs">
                    {vOutputs.map((o) => (
                      <a key={o.id} href={fileUrl(o.blob_pathname)} target="_blank" rel="noreferrer" title={o.kv_filename}>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={fileUrl(o.blob_pathname)} alt={`v${v.version_no} output on ${o.kv_filename}`} loading="lazy" />
                      </a>
                    ))}
                  </div>
                )}
                <div className="row" style={{ gap: 8 }}>
                  <button type="button" className="btn btn-sm" onClick={() => loadVersion(v)}>Load into editor</button>
                  {!isDefault && (
                    <button type="button" className="btn btn-sm" onClick={async () => { const a = await patch({ current_version_id: v.id }, `v${v.version_no} is now the default`); if (a) { setPrompt(a.prompt_text); setAvoid(a.avoid_text ?? ''); } }}>
                      Make default
                    </button>
                  )}
                </div>
              </article>
            );
          })}
          <Link href={`/history?agentId=${agent.id}`} style={{ fontSize: 14 }}>See every output from this agent</Link>
        </aside>
      </div>
      {notice && <div className="notice" role="status">{notice}</div>}
    </main>
  );
}
