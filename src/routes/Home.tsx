import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { listClasses, ensureSeatingForClass, upsertSeatingPlan, listStudents, listRatingsByStudent } from '../repository';
import type { Student, Rating } from '../db';
import { useAppStore } from '../store/app';
import { useNavigate } from 'react-router-dom';

type SeatIndex = number; // 0..47

export default function Home() {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const [classes, setClasses] = useState<string[] | null>(null);
  const [selectedClass, setSelectedClass] = useState<string | null>(null);
  const [studentsById, setStudentsById] = useState<Map<number, Student>>(new Map());
  const [seats, setSeats] = useState<Array<number | null>>([]); // 48 slots
  const [loading, setLoading] = useState(true);
  const scales = useAppStore((s) => s.scales);
  const loadScales = useAppStore((s) => s.loadScales);
  const [avgByStudent, setAvgByStudent] = useState<Map<number, number>>(new Map()); // 0..100 (kept for compatibility)
  const ratingsByStudent = useAppStore((s) => s.ratingsByStudent);
  const loadRatingsForStudent = useAppStore((s) => s.loadRatingsForStudent);
  const checks = useAppStore((s) => s.checks);
  const loadChecks = useAppStore((s) => s.loadChecks);
  const checkMarksByStudent = useAppStore((s) => s.checkMarksByStudent);
  const loadCheckMarksForStudent = useAppStore((s) => s.loadCheckMarksForStudent);

  // Load classes on mount
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const cls = await listClasses();
      if (cancelled) return;
      setClasses(cls);
      const initial = localStorage.getItem('selectedClass');
      const pick = initial && cls.includes(initial) ? initial : (cls[0] ?? null);
      setSelectedClass(pick);
    };
    load();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => { void loadChecks(); }, [loadChecks]);

  // Load seating + students for selected class
  useEffect(() => {
    if (!selectedClass) return;
    let cancelled = false;
    setLoading(true);
    const load = async () => {
      const plan = await ensureSeatingForClass(selectedClass);
      if (cancelled) return;
      setSeats(plan.seats.slice());
      const [all] = await Promise.all([listStudents()]);
      if (cancelled) return;
      const map = new Map(all.map((s) => [s.id!, s] as const));
      setStudentsById(map);
      if (!scales.length) await loadScales();
      // Ensure ratings are loaded for visible students so colors update immediately
      const ids = Array.from(new Set(plan.seats.filter((x): x is number => x != null)));
      await Promise.all(ids.map((id) => loadRatingsForStudent(id)));
      // Initial compute will happen in the effect below as well
      setLoading(false);
      localStorage.setItem('selectedClass', selectedClass);
    };
    load();
    return () => { cancelled = true; };
  }, [selectedClass, loadScales, scales.length]);

  // Ensure scales are loaded on initial mount
  useEffect(() => { if (!scales.length) void loadScales(); }, [scales.length, loadScales]);

  // When seats change (drag/drop), ensure ratings are loaded for newly visible students
  useEffect(() => {
    const ids = Array.from(new Set(seats.filter((x): x is number => x != null)));
    void Promise.all(ids.map((id) => { loadRatingsForStudent(id); loadCheckMarksForStudent(id); }));
  }, [seats, loadRatingsForStudent]);

  // Refresh ratings when the window regains focus (helps after navigating back)
  useEffect(() => {
    const onFocus = () => {
      const ids = Array.from(new Set(seats.filter((x): x is number => x != null)));
      void Promise.all(ids.map((id) => loadRatingsForStudent(id)));
    };
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [seats, loadRatingsForStudent]);

  // Recompute averages when seats, scales, or ratings change
  useEffect(() => {
    if (!seats.length) { setAvgByStudent(new Map()); return; }
    let cancelled = false;
    const run = async () => {
      const ids = Array.from(new Set(seats.filter((x): x is number => x != null)));
      // Use store ratings when available; fetch missing from DB
      const missing: number[] = ids.filter((id) => !ratingsByStudent[id] || ratingsByStudent[id].length === 0);
      const fetched = await Promise.all(missing.map((id) => listRatingsByStudent(id)));
      if (cancelled) return;
      const lists = new Map<number, Rating[]>();
      for (const id of ids) {
        const storeList = ratingsByStudent[id];
        if (storeList && storeList.length) lists.set(id, storeList);
      }
      for (let i = 0; i < missing.length; i++) {
        lists.set(missing[i], fetched[i]);
      }
      const latestBy = new Map<number, Map<string, Rating>>();
      for (const id of ids) {
        const list = lists.get(id) || [];
        const byScale = new Map<string, Rating>();
        for (const r of list) {
          const prev = byScale.get(r.scale_id);
          if (!prev || r.recorded_at > prev.recorded_at) byScale.set(r.scale_id, r);
        }
        latestBy.set(id, byScale);
      }
      const scById = new Map(scales.map(s => [s.id, s] as const));
      const pctMap = new Map<number, number>();
      for (const sid of ids) {
        const byScale = latestBy.get(sid) || new Map<string, Rating>();
        let sum = 0; let count = 0;
        for (const [scaleId, r] of byScale) {
          const sc = scById.get(scaleId);
          const min = sc?.min ?? -3; const max = sc?.max ?? 3;
          if (max === min) continue;
          const clamped = Math.max(min, Math.min(max, r.value));
          let pct = ((clamped - min) / (max - min)) * 100; // 0..100
          if (sc && sc.higher_is_better === false) pct = 100 - pct;
          sum += pct; count++;
        }
        if (count > 0) pctMap.set(sid, sum / count);
      }
      if (!cancelled) setAvgByStudent(pctMap);
    };
    run();
    return () => { cancelled = true; };
  }, [seats, scales, ratingsByStudent]);

  // Derive average map from current store data to reflect immediate edits
  const avgMap = useMemo(() => {
    const ids = Array.from(new Set(seats.filter((x): x is number => x != null)));
    const scById = new Map(scales.map(s => [s.id, s] as const));
    const pctMap = new Map<number, number>();
    for (const sid of ids) {
      const list = ratingsByStudent[sid] || [];
      const byScale = new Map<string, Rating>();
      for (const r of list) {
        const prev = byScale.get(r.scale_id);
        if (!prev || r.recorded_at > prev.recorded_at) byScale.set(r.scale_id, r);
      }
      let sum = 0; let count = 0;
      for (const [scaleId, r] of byScale) {
        const sc = scById.get(scaleId);
        const min = sc?.min ?? -3; const max = sc?.max ?? 3;
        if (max === min) continue;
        const clamped = Math.max(min, Math.min(max, r.value));
        let pct = ((clamped - min) / (max - min)) * 100;
        if (sc && sc.higher_is_better === false) pct = 100 - pct;
        sum += pct; count++;
      }
      if (count > 0) pctMap.set(sid, sum / count);
    }
    // Debug: log averages to help diagnose color updates
    if (ids.length) {
      try { console.debug('[Home] avgMap', Object.fromEntries(Array.from(pctMap.entries()))); } catch {}
    }
    return pctMap;
  }, [seats, scales, ratingsByStudent]);

  // Safety net: poll IndexedDB for latest ratings every 1.5s while on Accueil
  useEffect(() => {
    if (!seats.length || !scales.length) return;
    let stopped = false;
    const tick = async () => {
      const ids = Array.from(new Set(seats.filter((x): x is number => x != null)));
      const lists = await Promise.all(ids.map((id) => listRatingsByStudent(id)));
      if (stopped) return;
      const scById = new Map(scales.map(s => [s.id, s] as const));
      const pctMap = new Map<number, number>();
      for (let i = 0; i < ids.length; i++) {
        const sid = ids[i];
        const list = lists[i];
        const latest = new Map<string, Rating>();
        for (const r of list) {
          const prev = latest.get(r.scale_id);
          if (!prev || r.recorded_at > prev.recorded_at) latest.set(r.scale_id, r);
        }
        let sum = 0; let count = 0;
        for (const [scaleId, r] of latest) {
          const sc = scById.get(scaleId);
          const min = sc?.min ?? -3; const max = sc?.max ?? 3;
          if (max === min) continue;
          const clamped = Math.max(min, Math.min(max, r.value));
          let pct = ((clamped - min) / (max - min)) * 100;
          if (sc && sc.higher_is_better === false) pct = 100 - pct;
          sum += pct; count++;
        }
        if (count > 0) pctMap.set(sid, sum / count);
      }
      setAvgByStudent(pctMap);
    };
    const handle = setInterval(tick, 1500);
    // also run once immediately
    void tick();
    return () => { stopped = true; clearInterval(handle); };
  }, [seats, scales]);

  const seatGrid = useMemo(() => {
    // Always 6 rows x 8 cols
    const rows: Array<Array<{ idx: number; student: Student | null }>> = [];
    for (let r = 0; r < 6; r++) {
      const row: Array<{ idx: number; student: Student | null }> = [];
      for (let c = 0; c < 8; c++) {
        const idx = r * 8 + c;
        const sid = seats[idx] ?? null;
        row.push({ idx, student: sid != null ? studentsById.get(sid) ?? null : null });
      }
      rows.push(row);
    }
    return rows;
  }, [seats, studentsById]);

  const onDragStart = (idx: SeatIndex, e: React.DragEvent<HTMLDivElement>) => {
    e.dataTransfer.setData('text/plain', String(idx));
    e.dataTransfer.effectAllowed = 'move';
  };

  const onDropSeat = (targetIdx: SeatIndex, e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const srcStr = e.dataTransfer.getData('text/plain');
    if (srcStr == null) return;
    const srcIdx = Number(srcStr);
    if (Number.isNaN(srcIdx)) return;
    if (srcIdx === targetIdx) return;
    setSeats((prev) => {
      const next = prev.slice();
      const a = next[srcIdx] ?? null;
      const b = next[targetIdx] ?? null;
      next[srcIdx] = b;
      next[targetIdx] = a;
      void persist(next);
      return next;
    });
  };

  const persist = async (nextSeats: Array<number | null>) => {
    if (!selectedClass) return;
    await upsertSeatingPlan({ class_name: selectedClass, seats: nextSeats, updated_at: Date.now() });
  };

  const allowDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  return (
    <section className="space-y-4">
      <div className="flex items-center gap-3">
        <h1 className="text-2xl font-semibold">{t('common.class') || 'Class'}</h1>
        <div>
          {classes === null ? (
            <span className="text-gray-600 text-sm">{t('common.loading')}</span>
          ) : classes.length === 0 ? (
            <span className="text-gray-600 text-sm">No classes</span>
          ) : (
            <select
              className="rounded border px-2 py-1 text-sm"
              value={selectedClass ?? ''}
              onChange={(e) => setSelectedClass(e.target.value || null)}
            >
              {classes.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          )}
        </div>
        <button
          className="ml-auto rounded-md border px-2 py-1 text-sm hover:bg-gray-50"
          onClick={() => {
            const ids = Array.from(new Set(seats.filter((x): x is number => x != null)));
            Promise.all(ids.map((id) => loadRatingsForStudent(id))).then(()=>{
              // touch state to force rerender
              setSeats((s)=> s.slice());
              console.debug('[Home] manual refresh triggered');
            });
          }}
        >Refresh Colors</button>
      </div>

      {loading ? (
        <div className="text-gray-600">{t('common.loading')}</div>
      ) : (
        <div className="space-y-3">
          <div className="rounded-md border border-gray-200 bg-white p-3 shadow-sm">
            <div className="mb-2 text-xs text-gray-600">Card color = average of latest scale scores (red = low, green = high).</div>
            <div className="grid grid-cols-8 gap-2">
              {seatGrid.flat().map(({ idx, student }) => (
                <div
                  key={idx}
                  onDragOver={allowDrop}
                  onDrop={(e) => onDropSeat(idx, e)}
                  className={`h-20 rounded border flex items-center justify-center text-sm select-none transition-colors ${student ? '' : 'bg-white border-dashed border-gray-300 text-gray-400'}`}
                  style={(() => {
                    if (!student) return undefined;
                    const pct = avgMap.get(student.id!) ?? avgByStudent.get(student.id!);
                    if (pct == null) {
                      return { backgroundColor: '#F9FAFB', borderColor: '#D1D5DB' }; // gray-50/gray-300
                    }
                    // Map 0..100 -> hue 0 (red) .. 120 (green)
                    const hue = Math.round((pct / 100) * 120);
                    const bg = `hsl(${hue}, 85%, 85%)`; // Chrome-safe comma syntax
                    const border = `hsl(${hue}, 60%, 50%)`;
                    return { backgroundColor: bg, borderColor: border } as React.CSSProperties;
                  })()}
                >
                  {student ? (
                    <div
                      draggable
                      onDragStart={(e) => onDragStart(idx, e)}
                      className="w-full h-full flex flex-col items-center justify-center cursor-move"
                      title={`${student.last_name} ${student.first_name}`}
                      onClick={() => navigate(`/student/${student.id}`)}
                    >
                      <div className="font-medium truncate max-w-[95%] flex items-center gap-2">
                        <span className="inline-block w-2.5 h-2.5 rounded-full border" style={(() => {
                          const pct = avgMap.get(student.id!);
                          if (pct == null) return { backgroundColor: '#e5e7eb', borderColor: '#9ca3af' }; // gray
                          const hue = Math.round((pct / 100) * 120);
                          return { backgroundColor: `hsl(${hue}, 85%, 50%)`, borderColor: `hsl(${hue}, 60%, 35%)` } as React.CSSProperties;
                        })()} />
                        {student.last_name} {student.first_name}
                        {/* Homework/primary check indicator */}
                        {(() => {
                          if (!checks.length) return null;
                          const primary = checks.find(c=>c.id.toLowerCase()==='homework') || checks[0];
                          const marks = checkMarksByStudent[student.id!];
                          const val = marks ? !!marks[primary.id] : false;
                          const color = val ? '#10b981' : '#ef4444';
                          return <span title={`${primary.label}: ${val? 'Yes':'No'}`} className="inline-block w-2.5 h-2.5 rounded-full border ml-1" style={{ backgroundColor: color, borderColor: val? '#065f46' : '#7f1d1d' }} />;
                        })()}
                      </div>
                      <div className="text-[11px] text-gray-700">#{student.number}</div>
                      {(() => {
                        const pct = avgMap.get(student.id!) ?? avgByStudent.get(student.id!);
                        if (pct == null) return null;
                        return (
                          <div className="mt-1 text-[10px] px-1.5 py-0.5 rounded-full border bg-white/70" style={{ borderColor: 'inherit' }}>
                            Avg {Math.round(pct)}%
                          </div>
                        );
                      })()}
                    </div>
                  ) : (
                    <div className="text-xs">Empty</div>
                  )}
                </div>
              ))}
            </div>
            <div className="mt-2 text-xs text-gray-500">Drag and drop to rearrange seats. Click a student for stats.</div>
          </div>
        </div>
      )}
    </section>
  );
}
