import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { generateStudentPDF } from '../pdf';
import BehaviorGradeCard from '../components/BehaviorGradeCard';
import StarTracker from '../components/StarTracker';
import { useAppStore } from '../store/app';
import { getStudent } from '../repository';
import type { Student as StudentType } from '../db';
import { useTranslation } from 'react-i18next';

export default function Student() {
  const { id } = useParams();
  const studentId = Number(id);
  const [student, setStudent] = useState<StudentType | null>(null);
  const { t } = useTranslation();

  const notes = useAppStore((s) => s.notesByStudent[studentId] || []);
  const loadNotesForStudent = useAppStore((s) => s.loadNotesForStudent);
  const addNote = useAppStore((s) => s.addNote);

  const [tab, setTab] = useState<'stars' | 'behavior' | 'notes'>('stars');
  const [noteModal, setNoteModal] = useState(false);
  const [noteText, setNoteText] = useState('');
  const TAGS = ['Retard', 'Perturbation', 'Devoir non rendu', 'Absent', 'Participation'];
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
    void loadNotesForStudent(studentId);
  }, [studentId, loadNotesForStudent]);

  const title = useMemo(() => {
    if (!student) return `${t('common.students')} #${studentId}`;
    return `${student.first_name} ${student.last_name}`;
  }, [student, studentId, t]);

  const exportPdf = () => {
    generateStudentPDF(studentId).catch((e) => console.warn('PDF error', e));
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
          <button className="rounded-md border px-3 py-1.5 text-sm hover:bg-gray-50" onClick={() => { setNoteModal(true); setNoteText(''); setSelectedTags([]); }}>{t('common.add_note')}</button>
          <div className="rounded-md overflow-hidden border">
            <button className={`px-3 py-1.5 text-sm ${tab === 'stars' ? 'bg-gray-50' : ''}`} onClick={() => setTab('stars')}>Stars</button>
            <button className={`px-3 py-1.5 text-sm ${tab === 'behavior' ? 'bg-gray-50' : ''}`} onClick={() => setTab('behavior')}>Behavior</button>
            <button className={`px-3 py-1.5 text-sm ${tab === 'notes' ? 'bg-gray-50' : ''}`} onClick={() => setTab('notes')}>{t('common.notes')}</button>
          </div>
          <button onClick={exportPdf} className="rounded-md bg-brand px-3 py-1.5 text-sm text-white hover:bg-brand-dark">{t('common.export_pdf')}</button>
        </div>
      </div>

      {tab === 'stars' ? (
        <div className="max-w-md">
          <StarTracker studentId={studentId} />
        </div>
      ) : tab === 'behavior' ? (
        <div className="max-w-lg">
          <BehaviorGradeCard studentId={studentId} />
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex items-center gap-2 flex-wrap">
            <button onClick={() => setTagFilter('all')} className={`text-xs rounded-full border px-2 py-1 ${tagFilter === 'all' ? 'bg-brand text-white border-brand' : 'border-gray-300'}`}>{t('common.all')}</button>
            {TAGS.map((tag) => (
              <button key={tag} onClick={() => setTagFilter(tag)} className={`text-xs rounded-full border px-2 py-1 ${tagFilter === tag ? 'bg-brand text-white border-brand' : 'border-gray-300'}`}>{tag}</button>
            ))}
          </div>

          <div className="space-y-2">
            {notes
              .filter(n => tagFilter === 'all' ? true : (n.tags || []).includes(tagFilter))
              .map((n) => (
                <div key={n.id} className="rounded-md border bg-white shadow-sm p-3">
                  <div className="flex items-center justify-between text-xs text-gray-600">
                    <span>{timeAgo(n.recorded_at)} ago</span>
                    <div className="flex gap-1 flex-wrap">
                      {(n.tags || []).map(tag => (
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
        </div>
      )}

      {noteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onClick={() => setNoteModal(false)}>
          <div className="w-full max-w-lg rounded-md bg-white shadow-lg" onClick={(e) => e.stopPropagation()}>
            <div className="border-b px-4 py-2 font-medium">{t('common.add_note')}</div>
            <div className="p-4 space-y-3">
              <textarea value={noteText} onChange={(e) => setNoteText(e.target.value)} className="w-full h-32 rounded border px-2 py-1 text-sm" placeholder={t('student.write_note') ?? 'Write a note...'} />
              <div className="flex items-center gap-2 flex-wrap">
                {TAGS.map(tag => {
                  const active = selectedTags.includes(tag);
                  return (
                    <button key={tag} type="button" onClick={() => setSelectedTags(active ? selectedTags.filter(x => x !== tag) : [...selectedTags, tag])} className={`text-xs rounded-full border px-2 py-1 ${active ? 'bg-brand text-white border-brand' : 'border-gray-300'}`}>{tag}</button>
                  );
                })}
              </div>
            </div>
            <div className="border-t px-4 py-2 flex items-center justify-end gap-2">
              <button className="rounded-md border px-3 py-1.5 text-sm hover:bg-gray-50" onClick={() => setNoteModal(false)}>Cancel</button>
              <button
                className="rounded-md bg-brand px-3 py-1.5 text-sm text-white hover:bg-brand-dark disabled:opacity-50"
                disabled={!noteText.trim()}
                onClick={async () => {
                  await addNote({ student_id: studentId, text: noteText.trim(), tags: selectedTags.length ? selectedTags : undefined });
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
