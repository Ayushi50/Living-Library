import { useEffect, useState } from 'react';
import type { Airing, Media, MediaKind, ViewStatus } from '../types';
import { MEDIA_KIND_LABEL, VIEW_STATUS_LABEL, VIEW_STATUS_ORDER } from '../types';
import { today } from '../lib/dates';
import { getStore, useData } from '../lib/store';
import { mediaPath, navigate, toast } from '../lib/ui';
import { Field, Modal, Poster, Rating, Segmented, TagInput } from './common';

interface Draft {
  kind: MediaKind;
  format: 'movie' | 'series';
  title: string;
  originalTitle: string;
  posterUrl: string;
  backdropUrl: string;
  year: string;
  country: string;
  language: string;
  runtime: string;
  director: string;
  studio: string;
  cast: string[];
  genres: string[];
  tags: string[];
  synopsis: string;
  status: ViewStatus;
  rating?: number;
  airing: Airing;
  seasons: { number: number; episodeCount: string }[];
  watchedDate: string;
  markAll: boolean;
  source?: Media['source'];
  externalId?: string;
}

const toDraft = (kind: MediaKind, m?: Partial<Media>): Draft => ({
  kind: m?.kind ?? kind,
  format: kind === 'movie' ? 'movie' : m?.format ?? 'series',
  title: m?.title ?? '',
  originalTitle: m?.originalTitle ?? '',
  posterUrl: m?.posterUrl ?? '',
  backdropUrl: m?.backdropUrl ?? '',
  year: m?.year ? String(m.year) : '',
  country: m?.country ?? (kind === 'kdrama' ? 'South Korea' : ''),
  language: m?.language ?? (kind === 'kdrama' ? 'Korean' : ''),
  runtime: m?.runtime ? String(m.runtime) : '',
  director: m?.director ?? '',
  studio: m?.studio ?? '',
  cast: m?.cast ?? [],
  genres: m?.genres ?? [],
  tags: m?.tags ?? [],
  synopsis: m?.synopsis ?? '',
  status: m?.status ?? 'plan',
  rating: m?.rating,
  airing: m?.airing ?? 'unknown',
  seasons: (m?.seasons?.length ? m.seasons : [{ number: 1, episodeCount: 0 }]).map((s) => ({ number: s.number, episodeCount: s.episodeCount ? String(s.episodeCount) : '' })),
  watchedDate: today(),
  markAll: false,
  source: m?.source,
  externalId: m?.externalId,
});
const num = (s: string): number | undefined => (s.trim() && Number.isFinite(Number(s)) ? Number(s) : undefined);

export function MediaForm({ open, onClose, kind, prefill, media, onSaved }: { open: boolean; onClose: () => void; kind: MediaKind; prefill?: Partial<Media>; media?: Media; onSaved?: (m: Media) => void }) {
  const data = useData();
  const editing = !!media;
  const [d, setD] = useState<Draft>(() => toDraft(kind, media ?? prefill));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [dupAck, setDupAck] = useState(false);
  useEffect(() => {
    if (open) {
      setD(toDraft(kind, media ?? prefill));
      setErrors({});
      setDupAck(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, media?.id, prefill, kind]);

  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => {
    setD((p) => ({ ...p, [k]: v }));
    if (errors[k as string]) setErrors((e) => ({ ...e, [k as string]: '' }));
  };
  const isSeries = d.format === 'series';
  const dup = !editing && d.title.trim() ? getStore().findDuplicateMedia({ title: d.title, year: num(d.year), kind: d.kind }) : undefined;
  const genreSug = [...new Set(data.media.flatMap((m) => m.genres))].sort();

  const submit = () => {
    const e: Record<string, string> = {};
    if (!d.title.trim()) e.title = 'Every title needs a name.';
    if (d.year.trim() && !(Number(d.year) >= 1850 && Number(d.year) <= 2200)) e.year = 'Enter a valid year.';
    if (d.runtime.trim() && !(Number(d.runtime) > 0)) e.runtime = 'Minutes, e.g. 110.';
    for (const [k, v] of [['posterUrl', d.posterUrl], ['backdropUrl', d.backdropUrl]] as const) if (v.trim() && !/^(https?:\/\/|data:image\/)/i.test(v.trim())) e[k] = 'Use a full image address starting with https://';
    if (isSeries) {
      const nums = d.seasons.map((s) => s.number);
      if (new Set(nums).size !== nums.length) e.seasons = 'Two seasons share the same number.';
      else if (d.seasons.some((s) => s.episodeCount.trim() && !(Number(s.episodeCount) >= 0))) e.seasons = 'Episode counts must be numbers.';
    }
    setErrors(e);
    if (Object.keys(e).length) return;
    if (dup && !dupAck) {
      setErrors({ title: 'This looks like a title you already have.' });
      return;
    }
    const seasons = isSeries ? d.seasons.map((s) => ({ number: s.number, episodeCount: Math.max(0, Math.round(num(s.episodeCount) ?? 0)) })).filter((s) => s.episodeCount > 0 || d.seasons.length === 1).sort((a, b) => a.number - b.number) : [];
    const patch: Partial<Media> = {
      kind: d.kind,
      format: d.format,
      title: d.title.trim(),
      originalTitle: d.originalTitle.trim() || undefined,
      posterUrl: d.posterUrl.trim() || undefined,
      backdropUrl: d.backdropUrl.trim() || undefined,
      year: num(d.year),
      country: d.country.trim() || undefined,
      language: d.language.trim() || undefined,
      runtime: num(d.runtime),
      director: d.director.trim() || undefined,
      studio: d.studio.trim() || undefined,
      cast: d.cast,
      genres: d.genres,
      tags: d.tags,
      synopsis: d.synopsis.trim() || undefined,
      rating: d.rating,
      airing: isSeries ? d.airing : 'ended',
      seasons,
      source: d.source ?? 'manual',
      externalId: d.externalId,
    };
    const store = getStore();
    if (editing && media) {
      store.updateMedia(media.id, patch);
      if (d.status !== media.status) {
        const r = store.setMediaStatus(media.id, d.status);
        if (!r.ok) toast(r.error, 'error');
      }
      toast('Details updated');
      onSaved?.(getStore().data.media.find((m) => m.id === media.id)!);
    } else {
      let status = d.status;
      // A series can only be added as completed if it has ended and has known episodes.
      if (isSeries && status === 'completed' && (d.airing !== 'ended' || !seasons.some((s) => s.episodeCount > 0))) {
        status = 'watching';
        toast('Added as “Currently Watching”: a series is only completed once it has ended and every episode is watched.', 'error');
      }
      const added = store.addMedia({ ...patch, title: patch.title!, status }, { watchedDate: d.watchedDate || undefined, markAllWatched: isSeries && status === 'completed' });
      toast(`“${added.title}” added to the archive`);
      onSaved?.(added);
      navigate(mediaPath(added.id));
    }
    onClose();
  };

  const setSeason = (i: number, patch: Partial<Draft['seasons'][number]>) => set('seasons', d.seasons.map((s, j) => (j === i ? { ...s, ...patch } : s)));

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title={editing ? 'Edit details' : prefill ? 'Review before archiving' : `Add ${d.kind === 'movie' ? 'a movie' : d.kind === 'tv' ? 'a TV series' : d.kind === 'kdrama' ? 'a K-drama' : 'an anime'}`}
      footer={
        <>
          {dup && (
            <p className="dup-note" role="status">
              Already in your archive: <button type="button" className="link" onClick={() => { onClose(); navigate(mediaPath(dup.id)); }}>{dup.title}</button>.{' '}
              <label className="check"><input type="checkbox" checked={dupAck} onChange={(e) => setDupAck(e.target.checked)} /> Add anyway</label>
            </p>
          )}
          <button className="btn btn-ghost" type="button" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" type="button" onClick={submit} data-testid="save-media">{editing ? 'Save changes' : 'Add to archive'}</button>
        </>
      }
    >
      <form className="form-grid" onSubmit={(e) => { e.preventDefault(); submit(); }} noValidate>
        <div className="form-cover">
          <div className="form-cover-frame poster-frame"><Poster media={{ title: d.title || 'Untitled', posterUrl: d.posterUrl.trim() || undefined, year: num(d.year), kind: d.kind }} /></div>
          <Field label="Poster image address" error={errors.posterUrl}><input className="input" value={d.posterUrl} onChange={(e) => set('posterUrl', e.target.value)} placeholder="https://…" inputMode="url" /></Field>
          <Field label="Backdrop image address" error={errors.backdropUrl} hint="Optional wide image for the detail page."><input className="input" value={d.backdropUrl} onChange={(e) => set('backdropUrl', e.target.value)} placeholder="https://…" inputMode="url" /></Field>
        </div>
        <div className="form-main">
          <Field label="Title" error={errors.title}><input className="input" data-autofocus value={d.title} onChange={(e) => set('title', e.target.value)} maxLength={300} /></Field>
          {!editing && kind !== 'movie' && (
            <div className="field">
              <span className="field-label">Type</span>
              <Segmented<MediaKind> label="Type" value={d.kind} onChange={(v) => set('kind', v)} options={(['tv', 'kdrama', 'anime'] as MediaKind[]).map((k) => ({ value: k, label: MEDIA_KIND_LABEL[k] }))} />
            </div>
          )}
          {d.kind === 'anime' && !editing && (
            <div className="field">
              <span className="field-label">Format</span>
              <Segmented<'movie' | 'series'> label="Format" value={d.format} onChange={(v) => set('format', v)} options={[{ value: 'series', label: 'Series' }, { value: 'movie', label: 'Film' }]} />
            </div>
          )}
          <Field label="Original title"><input className="input" value={d.originalTitle} onChange={(e) => set('originalTitle', e.target.value)} /></Field>
          <div className="grid-3">
            <Field label="Year" error={errors.year}><input className="input" inputMode="numeric" value={d.year} onChange={(e) => set('year', e.target.value)} /></Field>
            <Field label={isSeries ? 'Minutes per episode' : 'Runtime (minutes)'} error={errors.runtime}><input className="input" inputMode="numeric" value={d.runtime} onChange={(e) => set('runtime', e.target.value)} /></Field>
            <Field label="Country"><input className="input" value={d.country} onChange={(e) => set('country', e.target.value)} /></Field>
          </div>
          <div className="grid-2">
            <Field label="Language"><input className="input" value={d.language} onChange={(e) => set('language', e.target.value)} /></Field>
            <Field label={d.kind === 'anime' ? 'Studio' : isSeries ? 'Creator' : 'Director'}>
              <input className="input" value={d.kind === 'anime' ? d.studio : d.director} onChange={(e) => set(d.kind === 'anime' ? 'studio' : 'director', e.target.value)} />
            </Field>
          </div>
          <Field label="Cast"><TagInput label="Cast" value={d.cast} onChange={(v) => set('cast', v)} placeholder="Add a name and press Enter" /></Field>
          <Field label="Genres"><TagInput label="Genres" value={d.genres} onChange={(v) => set('genres', v)} suggestions={genreSug} placeholder="Type a genre and press Enter" /></Field>
          <Field label="Tags"><TagInput label="Tags" value={d.tags} onChange={(v) => set('tags', v)} placeholder="Your own tags" /></Field>
          <Field label="Synopsis"><textarea className="input" rows={3} value={d.synopsis} onChange={(e) => set('synopsis', e.target.value)} /></Field>
          {isSeries && (
            <fieldset className="seasons-edit">
              <legend className="field-label">Seasons & episodes</legend>
              <div className="field">
                <span className="field-label">Airing</span>
                <Segmented<Airing> label="Airing" value={d.airing} onChange={(v) => set('airing', v)} options={[{ value: 'ongoing', label: 'Still airing' }, { value: 'ended', label: 'Ended' }, { value: 'unknown', label: 'Not sure' }]} />
                <span className="hint">A series only counts as completed once it has ended and every episode is watched.</span>
              </div>
              {d.seasons.map((s, i) => (
                <div className="season-row" key={i}>
                  <label>Season <input className="input input-sm" aria-label={`Season ${i + 1} number`} inputMode="numeric" value={s.number} onChange={(e) => setSeason(i, { number: Number(e.target.value) || 0 })} /></label>
                  <label>Episodes released <input className="input input-sm" aria-label={`Season ${i + 1} episode count`} inputMode="numeric" value={s.episodeCount} onChange={(e) => setSeason(i, { episodeCount: e.target.value })} /></label>
                  {d.seasons.length > 1 && <button type="button" className="btn btn-ghost btn-sm" onClick={() => set('seasons', d.seasons.filter((_, j) => j !== i))}>Remove</button>}
                </div>
              ))}
              {errors.seasons && <span className="field-error" role="alert">{errors.seasons}</span>}
              <button type="button" className="btn btn-sm" onClick={() => set('seasons', [...d.seasons, { number: Math.max(0, ...d.seasons.map((s) => s.number)) + 1, episodeCount: '' }])}>Add a season</button>
            </fieldset>
          )}
          <div className="grid-2">
            <Field label="Status">
              <select className="select" value={d.status} onChange={(e) => set('status', e.target.value as ViewStatus)}>
                {VIEW_STATUS_ORDER.map((s) => <option key={s} value={s}>{VIEW_STATUS_LABEL[s]}</option>)}
              </select>
            </Field>
            <div className="field"><span className="field-label">Rating</span><Rating value={d.rating} onChange={(v) => set('rating', v)} /></div>
          </div>
          {!editing && d.status === 'completed' && (
            <Field label={isSeries ? 'Finished on' : 'Watched on'} hint={isSeries ? 'Every known episode is marked watched on this date.' : undefined}>
              <input type="date" className="input" max={today()} value={d.watchedDate} onChange={(e) => set('watchedDate', e.target.value)} />
            </Field>
          )}
        </div>
      </form>
    </Modal>
  );
}
