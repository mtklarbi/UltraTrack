import { useEffect, useMemo, useState } from 'react';
import { useAppStore } from '../store/app';
import { generateClassSummaryPDF } from '../pdf';
import { useTranslation } from 'react-i18next';
import { tScaleLabels } from '../utils/scaleLabels';

type Row = {
  id: number;
  name: string;
  class_name: string;
  number: number;
};

function hueForPercent(pct: number) {
  const hue = 220 - (220 * pct) / 100; // 0..100 => 220..0
  return `hsl(${hue} 80% 50%)`;
}

export default function Dashboard() {
  const { t } = useTranslation();
  const students = useAppStore((s) => s.students);
  const loadStudents = useAppStore((s) => s.loadStudents);
  const scales = useAppStore((s) => s.scales);
  const loadScales = useAppStore((s) => s.loadScales);
  const ratingsByStudent = useAppStore((s) => s.ratingsByStudent);
  const loadRatingsForStudent = useAppStore((s) => s.loadRatingsForStudent);
  const getRatingValue = useAppStore((s) => s.getRatingValue);
  const computePercent = useAppStore((s) => s.computePercent);
  const setRating = useAppStore((s) => s.setRating);
  const upsertRating = useAppStore((s) => s.upsertRating);

  useEffect(() => { if (!students.length) void loadStudents(); }, [students.length, loadStudents]);
  useEffect(() => { if (!scales.length) void loadScales(); }, [scales.length, loadScales]);

  const classes = useMemo(() => Array.from(new Set(students.map((s) => s.class_name))).sort(), [students]);
  const [selectedClass, setSelectedClass] = useState<string>('');
  const [selectedScaleId, setSelectedScaleId] = useState<string>('');

  // Selection state
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const toggleSelect = (id: number) => setSelectedIds((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const clearSelection = () => setSelectedIds(new Set());
  const selectAll = () => setSelectedIds(new Set(visibleStudents.map(s=>s.id)));

  // Batch last action (for undo)
  const [lastBatch, setLastBatch] = useState<null | { className: string; scaleId: string; entries: { studentId: number; prev: number }[]; at: number }>(null);

  useEffect(() => {
    if (!selectedClass && classes.length) setSelectedClass(classes[0]);
  }, [classes, selectedClass]);

  useEffect(() => {
    if (!selectedScaleId && scales.length) setSelectedScaleId(scales[0].id);
  }, [scales, selectedScaleId]);

  const visibleStudents: Row[] = useMemo(() => {
    return students
      .filter((s) => !selectedClass || s.class_name === selectedClass)
      .map((s) => ({ id: s.id!, name: `${s.last_name} ${s.first_name}`, class_name: s.class_name, number: s.number }));
  }, [students, selectedClass]);

  // Load ratings for visible students
  useEffect(() => {
    if (!visibleStudents.length) return;
    const missing = visibleStudents.filter((s) => !ratingsByStudent[s.id]);
    if (!missing.length) return;
    void Promise.all(missing.map((r) => loadRatingsForStudent(r.id)));
  }, [visibleStudents, ratingsByStudent, loadRatingsForStudent]);

  const sortScale = useMemo(() => scales.find((s) => s.id === selectedScaleId), [scales, selectedScaleId]);
  const sortedStudents = useMemo(() => {
    if (!sortScale) return visibleStudents;
    const min = sortScale.min ?? -3;
    const max = sortScale.max ?? 3;
    return [...visibleStudents].sort((a, b) => {
      const av = getRatingValue(a.id, sortScale.id);
      const bv = getRatingValue(b.id, sortScale.id);
      const ap = av == null ? Infinity : computePercent(av, min, max);
      const bp = bv == null ? Infinity : computePercent(bv, min, max);
      return ap - bp;
    });
  }, [visibleStudents, sortScale, getRatingValue, computePercent]);

  async function applyBatch(delta: number) {
    if (!selectedScaleId || selectedIds.size === 0) return;
    const entries: { studentId: number; prev: number }[] = [];
    for (const st of sortedStudents) {
      if (!selectedIds.has(st.id)) continue;
      const prev = getRatingValue(st.id, selectedScaleId) ?? 0;
      entries.push({ studentId: st.id, prev });
    }
    // apply
    for (const e of entries) {
      await upsertRating(e.studentId, selectedScaleId, delta);
    }
    setLastBatch({ className: selectedClass, scaleId: selectedScaleId, entries, at: Date.now() });
  }

  async function undoBatch() {
    if (!lastBatch) return;
    const { entries, scaleId } = lastBatch;
    for (const e of entries) {
      await setRating(e.studentId, scaleId, e.prev);
    }
    setLastBatch(null);
  }

  // Class average for selected scale
  const classAveragePct = useMemo(() => {
    if (!sortScale || !sortedStudents.length) return 0;
    const min = sortScale.min ?? -3;
    const max = sortScale.max ?? 3;
    const vals = sortedStudents
      .map((s) => getRatingValue(s.id, sortScale.id))
      .filter((v): v is number => v != null);
    if (!vals.length) return 0;
    const avg = vals.reduce((a, b) => a + computePercent(b, min, max), 0) / vals.length;
    return avg;
  }, [sortedStudents, sortScale, getRatingValue, computePercent]);

  // Improvements/drops last 7 days for selected scale
  const improvements = useMemo(() => {
    if (!sortScale) return { top: [], drops: [] } as { top: { id: number; name: string; delta: number }[]; drops: { id: number; name: string; delta: number }[] };
    const since = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const items: { id: number; name: string; delta: number }[] = [];
    for (const s of sortedStudents) {
      const events = (ratingsByStudent[s.id] || []).filter((r) => r.scale_id === sortScale.id && r.recorded_at >= since);
      if (events.length >= 2) {
        const delta = events[events.length - 1].value - events[0].value;
        items.push({ id: s.id, name: s.name, delta });
      }
    }
    const top = [...items].sort((a, b) => b.delta - a.delta).slice(0, 5);
    const drops = [...items].sort((a, b) => a.delta - b.delta).slice(0, 5);
    return { top, drops };
  }, [sortedStudents, ratingsByStudent, sortScale]);

  // Alerts: scale drop by >=2 points within 7 days
  const alerts = useMemo(() => {
    const out: { when: number; student: string; scale: string; delta: number }[] = [];
    const weekMs = 7 * 24 * 60 * 60 * 1000;
    for (const st of sortedStudents) {
      const events = (ratingsByStudent[st.id] || []).slice().sort((a,b)=>a.recorded_at-b.recorded_at);
      // group by scale
      const byScale = new Map<string, typeof events>();
      for (const r of events) {
        if (!byScale.has(r.scale_id)) byScale.set(r.scale_id, [] as any);
        (byScale.get(r.scale_id) as any).push(r);
      }
      for (const [scaleId, evs] of byScale) {
        for (let i = 1; i < evs.length; i++) {
          const prev = evs[i-1];
          const curr = evs[i];
          if (curr.recorded_at - prev.recorded_at <= weekMs) {
            const delta = curr.value - prev.value;
            if (delta <= -2) {
              const sc = scales.find(s=>s.id===scaleId);
              out.push({ when: curr.recorded_at, student: st.name, scale: sc? `${tScaleLabels(sc,t).left} ↔ ${tScaleLabels(sc,t).right}`: scaleId, delta });
            }
          }
        }
      }
    }
    // latest first
    return out.sort((a,b)=>b.when-a.when).slice(0, 50);
  }, [sortedStudents, ratingsByStudent, scales, t]);

  // Goals: up to 2 selected scales per class, show weekly progress % and trend
  const goalsKey = `goals_${selectedClass || 'all'}`;
  const [goal1, setGoal1] = useState<string>('');
  const [goal2, setGoal2] = useState<string>('');
  useEffect(() => {
    const raw = localStorage.getItem(goalsKey);
    if (raw) {
      try { const { g1, g2 } = JSON.parse(raw); setGoal1(g1||''); setGoal2(g2||''); } catch {}
    } else {
      setGoal1(scales[0]?.id || ''); setGoal2(scales[1]?.id || '');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [goalsKey]);
  useEffect(() => {
    localStorage.setItem(goalsKey, JSON.stringify({ g1: goal1, g2: goal2 }));
  }, [goal1, goal2, goalsKey]);

  function weeklyProgress(scaleId?: string) {
    if (!scaleId) return { pct: 0, delta: 0 };
    const sc = scales.find(s=>s.id===scaleId);
    if (!sc) return { pct: 0, delta: 0 };
    const min = sc.min ?? -3; const max = sc.max ?? 3;
    const now = Date.now();
    const t0 = now - 7*24*60*60*1000; // last 7 days
    const tPrev0 = now - 14*24*60*60*1000; // previous 7 days
    const valsNow: number[] = [];
    const valsPrev: number[] = [];
    for (const st of sortedStudents) {
      const evs = (ratingsByStudent[st.id] || []).filter(r=>r.scale_id===scaleId).sort((a,b)=>a.recorded_at-b.recorded_at);
      const lastNow = [...evs].filter(r=>r.recorded_at>=t0).pop();
      const lastPrev = [...evs].filter(r=>r.recorded_at>=tPrev0 && r.recorded_at<t0).pop();
      if (lastNow) valsNow.push(computePercent(lastNow.value, min, max));
      if (lastPrev) valsPrev.push(computePercent(lastPrev.value, min, max));
    }
    const avg = (arr:number[]) => arr.length? arr.reduce((a,b)=>a+b,0)/arr.length : 0;
    const nowPct = avg(valsNow);
    const prevPct = avg(valsPrev);
    return { pct: nowPct, delta: nowPct - prevPct };
  }

  const goal1Stats = useMemo(()=>weeklyProgress(goal1), [goal1, sortedStudents, ratingsByStudent, scales]);
  const goal2Stats = useMemo(()=>weeklyProgress(goal2), [goal2, sortedStudents, ratingsByStudent, scales]);

  return (
    <section className="space-y-4">
      <h1 className="text-2xl font-semibold">{t('nav.dashboard')}</h1>

      <div className="flex items-center gap-3 flex-wrap">
        <label className="text-sm text-gray-700">{t('common.class')}
          <select value={selectedClass} onChange={(e)=>setSelectedClass(e.target.value)} className="ml-2 rounded border px-2 py-1 text-sm">
            {classes.map((c)=>(<option key={c} value={c}>{c}</option>))}
          </select>
        </label>
        <label className="text-sm text-gray-700">{t('common.scale')}
          <select value={selectedScaleId} onChange={(e)=>setSelectedScaleId(e.target.value)} className="ml-2 rounded border px-2 py-1 text-sm">
            {scales.map((s)=>{ const l=tScaleLabels(s, t); return (<option key={s.id} value={s.id}>{l.left} ↔ {l.right}</option>); })}
          </select>
        </label>
        <div className="flex items-center gap-2">
          <button className="rounded-md border px-2 py-1 text-sm hover:bg-gray-50" onClick={()=>applyBatch(+1)} disabled={!selectedScaleId || selectedIds.size===0}>+1</button>
          <button className="rounded-md border px-2 py-1 text-sm hover:bg-gray-50" onClick={()=>applyBatch(-1)} disabled={!selectedScaleId || selectedIds.size===0}>-1</button>
          {lastBatch && <button className="rounded-md border px-2 py-1 text-sm hover:bg-gray-50" onClick={undoBatch}>Undo</button>}
        </div>
        <div className="ml-auto flex items-center gap-2 text-xs">
          <span>{t('common.legend')}:</span>
          <div className="h-3 w-40 rounded" style={{ background: 'linear-gradient(90deg, hsl(220 80% 50%), hsl(0 80% 50%))' }} />
          <span>0%</span>
          <span>100%</span>
        </div>
        {selectedClass && (
          <button className="rounded-md bg-brand px-3 py-1.5 text-sm text-white hover:bg-brand-dark" onClick={()=>generateClassSummaryPDF(selectedClass)}>{t('common.download_pdf')}</button>
        )}
      </div>

      {sortScale && (
        <div className="rounded-md border bg-white shadow-sm p-3">
          <div className="mb-2 text-sm text-gray-700">{t('dashboard.class_average')} ({tScaleLabels(sortScale, t).left} ↔ {tScaleLabels(sortScale, t).right})</div>
          <div className="h-3 w-full rounded bg-gray-100 overflow-hidden">
            <div className="h-full" style={{ width: `${classAveragePct.toFixed(0)}%`, background: hueForPercent(classAveragePct) }} />
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_18rem] gap-4">
        <div className="rounded-md border bg-white shadow-sm overflow-auto">
          <div className="min-w-[640px]">
            <div className="sticky top-0 z-10 bg-white border-b">
              <div className="grid" style={{ gridTemplateColumns: `2.5rem 16rem repeat(${scales.length}, minmax(3rem, 1fr))` }}>
                <div className="px-3 py-2 text-sm font-medium text-gray-700">
                  <input type="checkbox" aria-label="Select all" onChange={(e)=> e.target.checked ? selectAll() : clearSelection()} />
                </div>
                <div className="px-3 py-2 text-sm font-medium text-gray-700">Student</div>
                {scales.map((sc) => { const l=tScaleLabels(sc,t); return (
                  <div key={sc.id} className="px-2 py-2 text-[11px] text-gray-600 text-center truncate">{l.left} ↔ {l.right}</div>
                );})}
              </div>
            </div>
            <div>
              {sortedStudents.map((st) => (
                <div key={st.id} className="grid border-t items-center" style={{ gridTemplateColumns: `2.5rem 16rem repeat(${scales.length}, minmax(3rem, 1fr))` }}>
                  <div className="px-3 py-2"><input type="checkbox" checked={selectedIds.has(st.id)} onChange={()=>toggleSelect(st.id)} /></div>
                  <div className="px-3 py-2 text-sm whitespace-nowrap overflow-hidden text-ellipsis">{st.class_name} • #{st.number} — {st.name}</div>
                  {scales.map((sc) => {
                    const val = getRatingValue(st.id, sc.id);
                    const min = sc.min ?? -3;
                    const max = sc.max ?? 3;
                    const pct = val == null ? null : computePercent(val, min, max);
                    const bg = pct == null ? '#e5e7eb' : hueForPercent(pct);
                    return (
                      <div key={sc.id} className="px-2 py-2 text-center text-[11px]" style={{ background: `linear-gradient(${bg}, ${bg})`, color: '#1118270a' }}>
                        <span className="text-gray-900">{pct == null ? '—' : `${pct.toFixed(0)}%`}</span>
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <QuickGroups
            className={selectedClass}
            students={sortedStudents}
            selected={selectedIds}
            onSelectSet={setSelectedIds}
          />
          <div className="rounded-md border bg-white shadow-sm p-3">
            <div className="text-sm font-medium mb-2">Goals</div>
            <div className="space-y-2 text-sm">
              <div className="flex items-center gap-2">
                <span className="text-gray-700">1.</span>
                <select value={goal1} onChange={(e)=>setGoal1(e.target.value)} className="rounded border px-2 py-1 text-sm flex-1">
                  <option value="">—</option>
                  {scales.map(s=> (<option key={s.id} value={s.id}>{tScaleLabels(s,t).left} ↔ {tScaleLabels(s,t).right}</option>))}
                </select>
                <Trend pct={goal1Stats.pct} delta={goal1Stats.delta} />
              </div>
              <div className="flex items-center gap-2">
                <span className="text-gray-700">2.</span>
                <select value={goal2} onChange={(e)=>setGoal2(e.target.value)} className="rounded border px-2 py-1 text-sm flex-1">
                  <option value="">—</option>
                  {scales.map(s=> (<option key={s.id} value={s.id}>{tScaleLabels(s,t).left} ↔ {tScaleLabels(s,t).right}</option>))}
                </select>
                <Trend pct={goal2Stats.pct} delta={goal2Stats.delta} />
              </div>
            </div>
          </div>
          <div className="rounded-md border bg-white shadow-sm p-3">
            <div className="text-sm font-medium mb-2">Top improvements (7 days)</div>
            <ul className="space-y-1 text-sm">
              {improvements.top.length === 0 && <li className="text-gray-600">No data</li>}
              {improvements.top.map((x) => (
                <li key={x.id} className="flex items-center justify-between">
                  <span className="truncate mr-2">{x.name}</span>
                  <span className="text-emerald-700">+{x.delta.toFixed(1)}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="rounded-md border bg-white shadow-sm p-3">
            <div className="text-sm font-medium mb-2">Largest drops (7 days)</div>
            <ul className="space-y-1 text-sm">
              {improvements.drops.length === 0 && <li className="text-gray-600">No data</li>}
              {improvements.drops.map((x) => (
                <li key={x.id} className="flex items-center justify-between">
                  <span className="truncate mr-2">{x.name}</span>
                  <span className="text-red-700">{x.delta.toFixed(1)}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="rounded-md border bg-white shadow-sm p-3">
            <div className="text-sm font-medium mb-2">Alerts</div>
            <ul className="space-y-1 text-sm max-h-64 overflow-auto">
              {alerts.length === 0 && <li className="text-gray-600">No alerts</li>}
              {alerts.map((a, idx) => (
                <li key={idx} className="flex items-center justify-between">
                  <div className="truncate mr-2">
                    <span className="font-medium">{a.student}</span>
                    <span className="mx-1">—</span>
                    <span className="text-gray-700">{a.scale}</span>
                    <span className="mx-1 text-red-700">{a.delta.toFixed(1)}</span>
                  </div>
                  <span className="text-xs text-gray-600">{new Date(a.when).toLocaleString()}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}

function Trend({ pct, delta }: { pct: number; delta: number }) {
  const up = delta >= 0.01;
  const down = delta <= -0.01;
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full border ${up? 'bg-emerald-50 border-emerald-300 text-emerald-800': (down? 'bg-red-50 border-red-300 text-red-800':'bg-gray-50 border-gray-300 text-gray-700')}`}>
      {pct.toFixed(0)}% {up? '▲': (down? '▼':'•')} {Math.abs(delta).toFixed(1)}
    </span>
  );
}

function QuickGroups({ className, students, selected, onSelectSet }: { className: string; students: { id: number; name: string }[]; selected: Set<number>; onSelectSet: (s: Set<number>) => void }) {
  const key = `groups_${className || 'all'}`;
  const [groups, setGroups] = useState<Array<{ name: string; ids: number[] }>>([]);
  const [groupName, setGroupName] = useState('Team A');
  useEffect(() => {
    const raw = localStorage.getItem(key);
    setGroups(raw ? JSON.parse(raw) : []);
  }, [key]);
  const save = (gs: Array<{ name: string; ids: number[] }>) => {
    setGroups(gs);
    localStorage.setItem(key, JSON.stringify(gs));
  };
  const saveCurrent = () => {
    const ids = Array.from(selected);
    if (!ids.length || !groupName.trim()) return;
    const gs = groups.filter(g=>g.name!==groupName.trim());
    gs.push({ name: groupName.trim(), ids });
    save(gs);
  };
  const selectGroup = (ids: number[]) => { onSelectSet(new Set(ids)); };
  const removeGroup = (name: string) => save(groups.filter(g=>g.name!==name));
  return (
    <div className="rounded-md border bg-white shadow-sm p-3">
      <div className="text-sm font-medium mb-2">Quick groups</div>
      <div className="flex items-center gap-2 mb-2">
        <input value={groupName} onChange={(e)=>setGroupName(e.target.value)} className="rounded border px-2 py-1 text-sm" placeholder="Group name" />
        <button className="rounded-md border px-2 py-1 text-sm hover:bg-gray-50" onClick={saveCurrent}>Save selection</button>
      </div>
      <ul className="space-y-1 text-sm">
        {groups.length===0 && <li className="text-gray-600">No groups</li>}
        {groups.map(g => (
          <li key={g.name} className="flex items-center justify-between">
            <span className="truncate mr-2">{g.name} <span className="text-xs text-gray-600">({g.ids.length})</span></span>
            <div className="flex items-center gap-2">
              <button className="rounded-md border px-2 py-1 text-xs hover:bg-gray-50" onClick={()=>selectGroup(g.ids)}>Select</button>
              <button className="rounded-md border px-2 py-1 text-xs hover:bg-red-50 text-red-700" onClick={()=>removeGroup(g.name)}>Delete</button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
