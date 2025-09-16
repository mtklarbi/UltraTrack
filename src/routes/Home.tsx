import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { listClasses, ensureSeatingForClass, upsertSeatingPlan, listStudents } from '../repository';
import type { Student } from '../db';
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

  // Load seating + students for selected class
  useEffect(() => {
    if (!selectedClass) return;
    let cancelled = false;
    setLoading(true);
    const load = async () => {
      const plan = await ensureSeatingForClass(selectedClass);
      if (cancelled) return;
      setSeats(plan.seats.slice());
      const all = await listStudents();
      if (cancelled) return;
      const map = new Map(all.map((s) => [s.id!, s] as const));
      setStudentsById(map);
      setLoading(false);
      localStorage.setItem('selectedClass', selectedClass);
    };
    load();
    return () => { cancelled = true; };
  }, [selectedClass]);

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
      </div>

      {loading ? (
        <div className="text-gray-600">{t('common.loading')}</div>
      ) : (
        <div className="space-y-3">
          <div className="rounded-md border border-gray-200 bg-white p-3 shadow-sm">
            <div className="grid grid-cols-8 gap-2">
              {seatGrid.flat().map(({ idx, student }) => (
                <div
                  key={idx}
                  onDragOver={allowDrop}
                  onDrop={(e) => onDropSeat(idx, e)}
                  className={`h-20 rounded border flex items-center justify-center text-sm select-none transition-colors ${student ? 'bg-gray-50 border-gray-300' : 'bg-white border-dashed border-gray-300 text-gray-400'}`}
                >
                  {student ? (
                    <div
                      draggable
                      onDragStart={(e) => onDragStart(idx, e)}
                      className="w-full h-full flex flex-col items-center justify-center cursor-move"
                      title={`${student.last_name} ${student.first_name}`}
                      onClick={() => navigate(`/student/${student.id}`)}
                    >
                      <div className="font-medium truncate max-w-[95%]">{student.last_name} {student.first_name}</div>
                      <div className="text-[11px] text-gray-600">#{student.number}</div>
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
