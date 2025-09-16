import { useEffect, useMemo, useRef, useState } from 'react';
import { matchSorter } from 'match-sorter';
import { useNavigate } from 'react-router-dom';
import { useAppStore } from '../store/app';
import { useTranslation } from 'react-i18next';
import type { Student } from '../db';

function timeAgo(ts?: number) {
  if (!ts) return '';
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  return `${d}d`;
}

export default function SearchBox() {
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);
  const { t } = useTranslation();
  const [raw, setRaw] = useState('');
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);

  const students = useAppStore((s) => s.students);
  const loadStudents = useAppStore((s) => s.loadStudents);
  const addRecentStudent = useAppStore((s) => s.addRecentStudent);
  const recentStudents = useAppStore((s) => s.getRecentStudents)();

  // Load students on mount if not loaded
  useEffect(() => {
    if (!students.length) void loadStudents();
  }, [students.length, loadStudents]);

  // Debounce input updates (200ms)
  useEffect(() => {
    const t = setTimeout(() => setQ(raw.trim()), 200);
    return () => clearTimeout(t);
  }, [raw]);

  const indexed = useMemo(() => students.map((s) => ({
    key: `${s.first_name} ${s.last_name}`.toLowerCase(),
    student: s,
  })), [students]);

  const prefixMatches: Student[] = useMemo(() => {
    if (!q) return [];
    const ql = q.toLowerCase();
    return indexed.filter((r) => r.key.startsWith(ql)).map((r) => r.student);
  }, [indexed, q]);

  const fuzzyMatches: Student[] = useMemo(() => {
    if (!q) return [];
    const results = matchSorter(indexed, q, {
      keys: [(r) => r.key],
      threshold: matchSorter.rankings.CONTAINS,
    });
    return results.map((r) => r.student);
  }, [indexed, q]);

  const combined: Student[] = useMemo(() => {
    if (!q) return recentStudents.slice(0, 8);
    const map = new Map<number, Student>();
    for (const s of [...prefixMatches, ...fuzzyMatches]) {
      if (s.id != null && !map.has(s.id)) map.set(s.id, s);
    }
    return Array.from(map.values()).slice(0, 12);
  }, [q, prefixMatches, fuzzyMatches, recentStudents]);

  const openFirst = () => {
    const first = combined[0];
    if (first?.id != null) {
      addRecentStudent(first.id);
      navigate(`/student/${first.id}`);
      setOpen(false);
      inputRef.current?.blur();
    }
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      openFirst();
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  };

  return (
    <div className="relative w-64" onKeyDown={onKeyDown}>
      <input
        ref={inputRef}
        value={raw}
        onChange={(e) => { setRaw(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-brand"
        placeholder={t('search.students')}
        aria-label="Search students"
      />
      {open && (
        <div className="absolute mt-1 w-[28rem] max-w-[85vw] z-50 rounded-md border border-gray-200 bg-white shadow-lg">
          <ul className="max-h-80 overflow-auto py-1">
            {combined.length === 0 ? (
              <li className="px-3 py-2 text-sm text-gray-500">No matches</li>
            ) : (
              combined.map((s) => (
                <li
                  key={s.id}
                  className="px-3 py-2 cursor-pointer hover:bg-gray-50 flex items-center justify-between"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    if (s.id != null) {
                      addRecentStudent(s.id);
                      navigate(`/student/${s.id}`);
                      setOpen(false);
                    }
                  }}
                >
                  <div className="flex items-center gap-2">
                    <span className="text-xs rounded bg-gray-100 px-2 py-0.5 text-gray-700">#{s.number}</span>
                    <span className="text-xs rounded bg-gray-100 px-2 py-0.5 text-gray-700">{s.class_name}</span>
                    <span className="text-sm">{s.first_name} {s.last_name}</span>
                  </div>
                  <span className="text-[10px] rounded-full bg-emerald-50 text-emerald-700 px-2 py-0.5">edited {timeAgo(s.updated_at)}</span>
                </li>
              ))
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
