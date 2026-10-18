import { useState } from 'react';
import type { GoalMetric } from '../types';
import { GOAL_METRIC_LABEL } from '../types';
import { MONTHS_LONG, today } from '../lib/dates';
import { goalProgress } from '../lib/stats';
import { getStore, useData } from '../lib/store';
import { closeGoals, confirmAction, toast, useUi } from '../lib/ui';
import { Modal, ProgressBar } from './common';

export function GoalsEditor() {
  const { goalsOpen } = useUi();
  const data = useData();
  const t = today();
  const [metric, setMetric] = useState<GoalMetric>('books');
  const [scope, setScope] = useState<'year' | 'month'>('year');
  const [period, setPeriod] = useState(t.slice(0, 4));
  const [target, setTarget] = useState('');
  const [err, setErr] = useState('');
  const label = (g: { scope: string; period: string }) => (g.scope === 'year' ? g.period : `${MONTHS_LONG[Number(g.period.slice(5)) - 1]} ${g.period.slice(0, 4)}`);
  const changeScope = (s: 'year' | 'month') => { setScope(s); setPeriod(s === 'year' ? t.slice(0, 4) : t.slice(0, 7)); };
  const save = () => {
    const valid = scope === 'year' ? /^\d{4}$/.test(period) : /^\d{4}-(0[1-9]|1[0-2])$/.test(period);
    if (!valid) return setErr(scope === 'year' ? 'Enter a four-digit year.' : 'Choose a month.');
    const r = getStore().upsertGoal({ metric, scope, period, target: Number(target) });
    if (!r.ok) return setErr(r.error);
    setErr(''); setTarget(''); toast('Goal saved');
  };
  const goals = [...data.goals].sort((a, b) => b.period.localeCompare(a.period));
  return (
    <Modal open={goalsOpen} onClose={closeGoals} title="Reading &amp; watching goals" size="md">
      <form className="goal-form" onSubmit={(e) => { e.preventDefault(); save(); }}>
        <div className="grid-2">
          <label className="field"><span className="field-label">What to count</span><select className="select" value={metric} onChange={(e) => setMetric(e.target.value as GoalMetric)}>{(Object.keys(GOAL_METRIC_LABEL) as GoalMetric[]).map((m) => <option key={m} value={m}>{GOAL_METRIC_LABEL[m]}</option>)}</select></label>
          <label className="field"><span className="field-label">Over</span><select className="select" value={scope} onChange={(e) => changeScope(e.target.value as 'year' | 'month')}><option value="year">A year</option><option value="month">A month</option></select></label>
        </div>
        <div className="grid-2">
          <label className="field"><span className="field-label">{scope === 'year' ? 'Year' : 'Month'}</span>{scope === 'year' ? <input className="input" inputMode="numeric" value={period} onChange={(e) => setPeriod(e.target.value)} /> : <input type="month" className="input" value={period} onChange={(e) => setPeriod(e.target.value)} />}</label>
          <label className="field"><span className="field-label">Target</span><input className="input" inputMode="numeric" data-autofocus value={target} onChange={(e) => setTarget(e.target.value.replace(/\D/g, ''))} placeholder="e.g. 24" /></label>
        </div>
        {err && <p className="field-error" role="alert">{err}</p>}
        <button className="btn btn-primary" type="submit" disabled={!target}>Set goal</button>
        <p className="field-hint">Setting a goal for the same thing and period replaces the old target.</p>
      </form>
      <h3 className="section-title">Your goals</h3>
      {goals.length === 0 ? <p className="muted">No goals yet.</p> : (
        <ul className="goal-list">
          {goals.map((g) => { const p = goalProgress(data, g); return (
            <li key={g.id}>
              <div><strong>{GOAL_METRIC_LABEL[g.metric]}</strong> · {label(g)}<small>{p.current} of {g.target}</small><ProgressBar value={p.pct} tone="gold" label={`${GOAL_METRIC_LABEL[g.metric]} ${label(g)}`} /></div>
              <button className="btn btn-ghost btn-sm btn-danger" onClick={async () => { if (await confirmAction({ title: 'Remove this goal?', body: 'Your recorded activity is untouched.', confirmLabel: 'Remove goal' })) getStore().deleteGoal(g.id); }}>Remove</button>
            </li>
          ); })}
        </ul>
      )}
    </Modal>
  );
}
