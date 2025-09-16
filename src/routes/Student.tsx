import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { jsPDF } from 'jspdf';
import { generateStudentPDF } from '../pdf';
import SemanticScaleCard from '../components/SemanticScaleCard';
import { Line, LineChart, ResponsiveContainer } from 'recharts';
import { useAppStore } from '../store/app';
import { getStudent } from '../repository';
import type { Student as StudentType } from '../db';
import { useTranslation } from 'react-i18next';
import { tScaleLabels } from '../utils/scaleLabels';

export default function Student() {
  const { id } = useParams();
  const studentId = Number(id);
  const [student, setStudent] = useState<StudentType | null>(null);
  const [saved, setSaved] = useState(false);
  const { t } = useTranslation();

  const scales = useAppStore((s) => s.scales);
  const loadScales = useAppStore((s) => s.loadScales);
  const loadRatingsForStudent = useAppStore((s) => s.loadRatingsForStudent);
  const getRatingValue = useAppStore((s) => s.getRatingValue);
  const setRating = useAppStore((s) => s.setRating);
  const ratings = useAppStore((s) => s.ratingsByStudent[studentId] || []);
  const computePercent = useAppStore((s) => s.computePercent);
  const notes = useAppStore((s) => s.notesByStudent[studentId] || []);
  const loadNotesForStudent = useAppStore((s) => s.loadNotesForStudent);
  const addNote = useAppStore((s) => s.addNote);

  const [tab, setTab] = useState<'scales' | 'history'>('scales');
  const [historyTab, setHistoryTab] = useState<'ratings' | 'notes'>('ratings');
  const [noteModal, setNoteModal] = useState(false);
  const [noteText, setNoteText] = useState('');
  const TAGS = ['Retard','Perturbation','Devoir non rendu','Absent','Participation'];
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [tagFilter, setTagFilter] = useState<string | 'all'>('all');

  function timeAgo(ts: number) {
    const s = Math.floor((Date.now() - ts) / 1000);
    if (s < 60) return `${s}s`;
    const m = Math.floor(s / 60);
    if (m < 60) return `${m}m`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h`;
    const d = Math.floor(h / 24);
    return `${d}d`;
  }

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      const s = await getStudent(studentId);
      if (!cancelled) setStudent(s ?? null);
    };
    run();
    return () => { cancelled = true; };
  }, [studentId]);

  useEffect(() => {
    if (!scales.length) void loadScales();
    void loadRatingsForStudent(studentId);
    void loadNotesForStudent(studentId);
  }, [studentId, scales.length, loadScales, loadRatingsForStudent, loadNotesForStudent]);

  const title = useMemo(() => {
    if (!student) return `${t('common.students')} #${studentId}`;
    return `${student.first_name} ${student.last_name}`;
  }, [student, studentId, t]);

  const exportPdf = () => {
    generateStudentPDF(studentId).catch((e)=>console.warn('PDF error', e));
  };

  const handleChange = async (scaleId: string, value: number) => {
    await setRating(studentId, scaleId, value);
    setSaved(true);
    setTimeout(() => setSaved(false), 800);
  };

  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1">
          <h1 className="text-xl font-semibold truncate">{title}</h1>
          {student && (
            <div className="text-sm text-gray-600">{student.class_name} • #{student.number}</div>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button className="rounded-md border px-3 py-1.5 text-sm hover:bg-gray-50" onClick={()=>{ setNoteModal(true); setNoteText(''); setSelectedTags([]); }}>{t('common.add_note')}</button>
          <div className="rounded-md overflow-hidden border">
            <button className={`px-3 py-1.5 text-sm ${tab==='scales'?'bg-gray-50':''}`} onClick={()=>setTab('scales')}>{t('common.scales')}</button>
            <button className={`px-3 py-1.5 text-sm ${tab==='history'?'bg-gray-50':''}`} onClick={()=>setTab('history')}>{t('common.history')}</button>
          </div>
          <button onClick={exportPdf} className="rounded-md bg-brand px-3 py-1.5 text-sm text-white hover:bg-brand-dark">{t('common.export_pdf')}</button>
        </div>
      </div>

      {tab === 'scales' ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {scales.map((sc) => {
            const value = getRatingValue(studentId, sc.id) ?? 0;
            const min = sc.min ?? -3;
            const max = sc.max ?? 3;
            const points = ratings.filter(r => r.scale_id === sc.id).slice(-10).map((r, idx) => ({ x: idx + 1, y: r.value }));
            const pct = computePercent(value, min, max);
            const labels = tScaleLabels(sc, t);
            return (
              <div key={sc.id} className="space-y-2">
                <SemanticScaleCard
                  left={labels.left}
                  right={labels.right}
                  value={value}
                  min={min}
                  max={max}
                  onChange={(v) => handleChange(sc.id, v)}
                />
                <div className="h-12 rounded border border-gray-200 bg-white px-2">
                  <div className="flex items-center justify-between text-xs text-gray-600">
                    <span>{t('student.last_10')}</span>
                    <span>{pct.toFixed(0)}%</span>
                  </div>
                  <div className="h-6">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={points}>
                        <Line type="monotone" dataKey="y" stroke="#0ea5e9" strokeWidth={2} dot={false} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <div className="rounded-md overflow-hidden border">
              <button className={`px-3 py-1.5 text-sm ${historyTab==='ratings'?'bg-gray-50':''}`} onClick={()=>setHistoryTab('ratings')}>{t('common.ratings')}</button>
              <button className={`px-3 py-1.5 text-sm ${historyTab==='notes'?'bg-gray-50':''}`} onClick={()=>setHistoryTab('notes')}>{t('common.notes')}</button>
            </div>
            {historyTab==='notes' && (
              <div className="flex items-center gap-2 flex-wrap">
                <button onClick={()=>setTagFilter('all')} className={`text-xs rounded-full border px-2 py-1 ${tagFilter==='all'?'bg-brand text-white border-brand':'border-gray-300'}`}>{t('common.all')}</button>
                {TAGS.map((t)=>(
                  <button key={t} onClick={()=>setTagFilter(t)} className={`text-xs rounded-full border px-2 py-1 ${tagFilter===t?'bg-brand text-white border-brand':'border-gray-300'}`}>{t}</button>
                ))}
              </div>
            )}
          </div>

          {historyTab==='ratings' ? (
            <div className="rounded-md border border-gray-200 bg-white shadow-sm overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="text-left px-3 py-2 font-medium text-gray-700">{t('common.time') ?? 'Time'}</th>
                    <th className="text-left px-3 py-2 font-medium text-gray-700">{t('common.scale')}</th>
                    <th className="text-left px-3 py-2 font-medium text-gray-700">{t('common.change') ?? 'Change'}</th>
                  </tr>
                </thead>
                <tbody>
                  {(() => {
                    const events = ratings.slice().sort((a,b)=>a.recorded_at-b.recorded_at);
                    const lastByScale = new Map<string, number>();
                    const rows: { t: number; scale: string; from: number | null; to: number }[] = [];
                    for (const r of events) {
                      const prev = lastByScale.get(r.scale_id) ?? null;
                      lastByScale.set(r.scale_id, r.value);
                      const sc = scales.find(s=>s.id===r.scale_id);
                      rows.push({ t: r.recorded_at, scale: sc? `${sc.left_label} ↔ ${sc.right_label}`: r.scale_id, from: prev, to: r.value });
                    }
                    rows.sort((a,b)=>b.t-a.t);
                    return rows.map((row, i) => (
                      <tr key={i} className="border-t">
                        <td className="px-3 py-2 text-gray-600">{new Date(row.t).toLocaleString()}</td>
                        <td className="px-3 py-2">{row.scale}</td>
                        <td className="px-3 py-2">{row.from === null ? '—' : row.from} → {row.to}</td>
                      </tr>
                    ));
                  })()}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="space-y-2">
              {notes
                .filter(n => tagFilter==='all' ? true : (n.tags||[]).includes(tagFilter))
                .map((n) => (
                <div key={n.id} className="rounded-md border bg-white shadow-sm p-3">
                  <div className="flex items-center justify-between text-xs text-gray-600">
                    <span>{timeAgo(n.recorded_at)} ago</span>
                    <div className="flex gap-1 flex-wrap">
                      {(n.tags||[]).map(tag => (
                        <span key={tag} className="text-[10px] rounded-full bg-gray-100 text-gray-700 px-2 py-0.5 border border-gray-200">{tag}</span>
                      ))}
                    </div>
                  </div>
                  <div className="mt-1 text-sm whitespace-pre-wrap">{n.text}</div>
                </div>
              ))}
              {notes.length === 0 && (
                <div className="text-sm text-gray-600">{t('student.no_notes') ?? 'No notes yet.'}</div>
              )}
            </div>
          )}
        </div>
      )}

      {saved && (
        <div className="fixed bottom-4 right-4 rounded-md bg-emerald-600 text-white px-3 py-2 shadow-lg">{t('common.saved')}</div>
      )}

      {noteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onClick={()=>setNoteModal(false)}>
          <div className="w-full max-w-lg rounded-md bg-white shadow-lg" onClick={(e)=>e.stopPropagation()}>
            <div className="border-b px-4 py-2 font-medium">{t('common.add_note')}</div>
            <div className="p-4 space-y-3">
              <textarea value={noteText} onChange={(e)=>setNoteText(e.target.value)} className="w-full h-32 rounded border px-2 py-1 text-sm" placeholder={t('student.write_note') ?? 'Write a note...'} />
              <div className="flex items-center gap-2 flex-wrap">
                {TAGS.map(t => {
                  const active = selectedTags.includes(t);
                  return (
                    <button key={t} type="button" onClick={()=> setSelectedTags(active ? selectedTags.filter(x=>x!==t) : [...selectedTags, t])} className={`text-xs rounded-full border px-2 py-1 ${active? 'bg-brand text-white border-brand':'border-gray-300'}`}>{t}</button>
                  );
                })}
              </div>
            </div>
            <div className="border-t px-4 py-2 flex items-center justify-end gap-2">
              <button className="rounded-md border px-3 py-1.5 text-sm hover:bg-gray-50" onClick={()=>setNoteModal(false)}>Cancel</button>
              <button
                className="rounded-md bg-brand px-3 py-1.5 text-sm text-white hover:bg-brand-dark disabled:opacity-50"
                disabled={!noteText.trim()}
                onClick={async ()=>{
                  await addNote({ student_id: studentId, text: noteText.trim(), tags: selectedTags.length? selectedTags: undefined });
                  setNoteModal(false);
                }}
              >Save</button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
