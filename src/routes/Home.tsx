import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  listClasses,
  ensureSeatingForClass,
  upsertSeatingPlan,
  listStudents,
  getTodayDateStr,
  getDailyStarsForStudent,
  setDailyStar,
  getBehaviorSettings,
  getWeekStart,
  ensureWeeklyGradeForStudent,
  getSemesterAverage,
  isAbsent,
  markAbsent,
  removeAbsence,
} from '../repository';
import type { Student, StarCategory } from '../db';
import { useNavigate } from 'react-router-dom';

type SeatIndex = number; // 0..47

type StudentData = {
  student: Student;
  stars: Map<StarCategory, number>;
  totalStars: number;
  grade: number;
  initialGrade: number;
  semesterAvg: number | null; // Percentage 0-100
  isAbsent: boolean;
};

// Get the day of week as a string key for localStorage
function getDayKey(): string {
  const days = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
  return days[new Date().getDay()];
}

export default function Home() {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const [classes, setClasses] = useState<string[] | null>(null);
  const [selectedClass, setSelectedClass] = useState<string | null>(null);
  const [studentsData, setStudentsData] = useState<Map<number, StudentData>>(new Map());
  const [seats, setSeats] = useState<Array<number | null>>([]); // 48 slots
  const [loading, setLoading] = useState(true);
  const [initialGrade, setInitialGrade] = useState(20);
  const [showBulkActions, setShowBulkActions] = useState(false);

  // Load classes on mount
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const cls = await listClasses();
      if (cancelled) return;
      setClasses(cls);

      // Priority: 1) Day-specific class, 2) Last used class, 3) First class
      const dayKey = getDayKey();
      const dayClass = localStorage.getItem(`classFor_${dayKey}`);
      const lastClass = localStorage.getItem('selectedClass');

      let pick: string | null = null;
      if (dayClass && cls.includes(dayClass)) {
        pick = dayClass;
      } else if (lastClass && cls.includes(lastClass)) {
        pick = lastClass;
      } else {
        pick = cls[0] ?? null;
      }
      setSelectedClass(pick);
    };
    load();
    return () => { cancelled = true; };
  }, []);

  // Load seating + students + stars + grades for selected class
  useEffect(() => {
    if (!selectedClass) return;
    let cancelled = false;
    setLoading(true);
    const load = async () => {
      const plan = await ensureSeatingForClass(selectedClass);
      if (cancelled) return;
      setSeats(plan.seats.slice());

      const settings = await getBehaviorSettings();
      setInitialGrade(settings.initial_grade);
      const weekStart = getWeekStart(new Date(), settings.reset_day);
      const today = getTodayDateStr();

      const all = await listStudents();
      if (cancelled) return;

      const dataMap = new Map<number, StudentData>();
      for (const student of all) {
        if (student.class_name !== selectedClass) continue;
        const stars = await getDailyStarsForStudent(student.id!, today);
        const totalStars = (stars.get('participation') ?? 0) + (stars.get('homework') ?? 0) + (stars.get('attention') ?? 0);
        const gradeRecord = await ensureWeeklyGradeForStudent(student.id!, weekStart, settings.initial_grade);
        const semesterData = await getSemesterAverage(student.id!);
        const absent = await isAbsent(student.id!, today);
        dataMap.set(student.id!, {
          student,
          stars,
          totalStars,
          grade: gradeRecord.current_grade,
          initialGrade: settings.initial_grade,
          semesterAvg: semesterData.totalWeeks > 0 ? semesterData.overall : null,
          isAbsent: absent,
        });
      }
      setStudentsData(dataMap);
      setLoading(false);

      // Save class selection
      localStorage.setItem('selectedClass', selectedClass);
      localStorage.setItem(`classFor_${getDayKey()}`, selectedClass);
    };
    load();
    return () => { cancelled = true; };
  }, [selectedClass]);

  // Keyboard shortcuts for class selection (1-9)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if typing in an input
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement) {
        return;
      }

      // Number keys 1-9 for class selection
      if (e.key >= '1' && e.key <= '9' && classes) {
        const index = parseInt(e.key) - 1;
        if (index < classes.length) {
          e.preventDefault();
          setSelectedClass(classes[index]);
        }
      }

      // 'b' for bulk actions toggle
      if (e.key === 'b' || e.key === 'B') {
        e.preventDefault();
        setShowBulkActions(prev => !prev);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [classes]);

  const seatGrid = useMemo(() => {
    // Always 6 rows x 8 cols
    const rows: Array<Array<{ idx: number; data: StudentData | null }>> = [];
    for (let r = 0; r < 6; r++) {
      const row: Array<{ idx: number; data: StudentData | null }> = [];
      for (let c = 0; c < 8; c++) {
        const idx = r * 8 + c;
        const sid = seats[idx] ?? null;
        row.push({ idx, data: sid != null ? studentsData.get(sid) ?? null : null });
      }
      rows.push(row);
    }
    return rows;
  }, [seats, studentsData]);

  // Class summary
  const classSummary = useMemo(() => {
    const entries = Array.from(studentsData.values());
    if (entries.length === 0) return { totalStars: 0, maxStars: 0, avgGrade: 0, avgSemester: null as number | null };
    const totalStars = entries.reduce((sum, e) => sum + e.totalStars, 0);
    const maxStars = entries.length * 9;
    const avgGrade = entries.reduce((sum, e) => sum + e.grade, 0) / entries.length;

    // Calculate average semester performance
    const withSemester = entries.filter(e => e.semesterAvg !== null);
    const avgSemester = withSemester.length > 0
      ? withSemester.reduce((sum, e) => sum + (e.semesterAvg ?? 0), 0) / withSemester.length
      : null;

    return { totalStars, maxStars, avgGrade, avgSemester };
  }, [studentsData]);

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

  const handleQuickStar = async (studentId: number, category: StarCategory, e: React.MouseEvent) => {
    e.stopPropagation();
    const today = getTodayDateStr();
    const current = studentsData.get(studentId);
    if (!current) return;
    const currentStars = current.stars.get(category) ?? 0;
    const newStars = currentStars >= 3 ? 0 : currentStars + 1;
    await setDailyStar(studentId, today, category, newStars);

    // Update local state
    const newStarsMap = new Map(current.stars);
    newStarsMap.set(category, newStars);
    const newTotal = (newStarsMap.get('participation') ?? 0) + (newStarsMap.get('homework') ?? 0) + (newStarsMap.get('attention') ?? 0);
    setStudentsData(prev => {
      const next = new Map(prev);
      next.set(studentId, { ...current, stars: newStarsMap, totalStars: newTotal });
      return next;
    });
  };

  // Bulk star actions
  const handleBulkStar = useCallback(async (category: StarCategory, value: number) => {
    const today = getTodayDateStr();
    const updates: Promise<void>[] = [];

    for (const [studentId, data] of studentsData.entries()) {
      updates.push(
        setDailyStar(studentId, today, category, value).then(() => {})
      );
    }

    await Promise.all(updates);

    // Update local state
    setStudentsData(prev => {
      const next = new Map(prev);
      for (const [studentId, data] of next.entries()) {
        const newStarsMap = new Map(data.stars);
        newStarsMap.set(category, value);
        const newTotal = (newStarsMap.get('participation') ?? 0) + (newStarsMap.get('homework') ?? 0) + (newStarsMap.get('attention') ?? 0);
        next.set(studentId, { ...data, stars: newStarsMap, totalStars: newTotal });
      }
      return next;
    });
  }, [studentsData]);

  const handleResetAllStars = useCallback(async () => {
    const today = getTodayDateStr();
    const updates: Promise<void>[] = [];

    for (const studentId of studentsData.keys()) {
      updates.push(setDailyStar(studentId, today, 'participation', 0).then(() => {}));
      updates.push(setDailyStar(studentId, today, 'homework', 0).then(() => {}));
      updates.push(setDailyStar(studentId, today, 'attention', 0).then(() => {}));
    }

    await Promise.all(updates);

    // Update local state
    setStudentsData(prev => {
      const next = new Map(prev);
      for (const [studentId, data] of next.entries()) {
        const newStarsMap = new Map<StarCategory, number>();
        newStarsMap.set('participation', 0);
        newStarsMap.set('homework', 0);
        newStarsMap.set('attention', 0);
        next.set(studentId, { ...data, stars: newStarsMap, totalStars: 0 });
      }
      return next;
    });
  }, [studentsData]);

  const handleToggleAbsence = async (studentId: number, e: React.MouseEvent) => {
    e.stopPropagation();
    const today = getTodayDateStr();
    const current = studentsData.get(studentId);
    if (!current) return;

    if (current.isAbsent) {
      await removeAbsence(studentId, today);
    } else {
      await markAbsent(studentId, today);
    }

    // Update local state
    setStudentsData(prev => {
      const next = new Map(prev);
      next.set(studentId, { ...current, isAbsent: !current.isAbsent });
      return next;
    });
  };

  const getGradeColor = (grade: number, initial: number) => {
    const pct = (grade / initial) * 100;
    if (pct >= 80) return 'border-emerald-400';
    if (pct >= 60) return 'border-yellow-400';
    return 'border-red-400';
  };

  const getGradeBg = (grade: number, initial: number, semesterAvg: number | null) => {
    // If student is struggling (semester avg < 50%), use a distinct background
    if (semesterAvg !== null && semesterAvg < 50) {
      return 'bg-red-100';
    }
    const pct = (grade / initial) * 100;
    if (pct >= 80) return 'bg-emerald-50';
    if (pct >= 60) return 'bg-yellow-50';
    return 'bg-red-50';
  };

  const getSemesterColor = (avg: number | null) => {
    if (avg === null) return 'text-gray-400';
    if (avg >= 75) return 'text-emerald-600';
    if (avg >= 50) return 'text-yellow-600';
    return 'text-red-600';
  };

  return (
    <section className="space-y-4">
      <div className="flex items-center gap-3 flex-wrap">
        <h1 className="text-2xl font-semibold">{t('common.class') || 'Class'}</h1>
        <div>
          {classes === null ? (
            <span className="text-gray-600 text-sm">{t('common.loading')}</span>
          ) : classes.length === 0 ? (
            <span className="text-gray-600 text-sm">No classes</span>
          ) : (
            <div className="flex items-center gap-2">
              <select
                className="rounded border px-2 py-1 text-sm"
                value={selectedClass ?? ''}
                onChange={(e) => setSelectedClass(e.target.value || null)}
              >
                {classes.map((c, i) => (
                  <option key={c} value={c}>{c} {i < 9 ? `[${i + 1}]` : ''}</option>
                ))}
              </select>
              <span className="text-xs text-gray-400">Press 1-9</span>
            </div>
          )}
        </div>

        {!loading && studentsData.size > 0 && (
          <div className="ml-auto flex items-center gap-4 text-sm">
            <div className="flex items-center gap-2">
              <span className="text-gray-600">Stars:</span>
              <span className="font-bold text-amber-500">{classSummary.totalStars}/{classSummary.maxStars} ⭐</span>
            </div>
            {classSummary.avgSemester !== null && (
              <div className="flex items-center gap-2">
                <span className="text-gray-600">Semester:</span>
                <span className={`font-bold ${getSemesterColor(classSummary.avgSemester)}`}>
                  {classSummary.avgSemester.toFixed(0)}%
                </span>
              </div>
            )}
            <div className="flex items-center gap-2">
              <span className="text-gray-600">Behavior:</span>
              <span className={`font-bold ${classSummary.avgGrade >= initialGrade * 0.8 ? 'text-emerald-600' : classSummary.avgGrade >= initialGrade * 0.6 ? 'text-yellow-600' : 'text-red-600'}`}>
                {classSummary.avgGrade.toFixed(1)}/{initialGrade}
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Bulk Actions Bar */}
      {!loading && studentsData.size > 0 && (
        <div className="rounded-md border border-gray-200 bg-white shadow-sm overflow-hidden">
          <button
            type="button"
            onClick={() => setShowBulkActions(!showBulkActions)}
            className="w-full px-4 py-2 flex items-center justify-between text-left hover:bg-gray-50 transition-colors"
          >
            <span className="text-sm font-medium text-gray-700">
              Bulk Actions <span className="text-gray-400 font-normal">(press B)</span>
            </span>
            <span className={`text-gray-400 transition-transform ${showBulkActions ? 'rotate-180' : ''}`}>
              ▼
            </span>
          </button>

          {showBulkActions && (
            <div className="px-4 py-3 border-t border-gray-100 space-y-3">
              <div className="flex flex-wrap gap-2">
                <span className="text-sm text-gray-600 mr-2">Give all students:</span>
                <button
                  type="button"
                  onClick={() => handleBulkStar('participation', 1)}
                  className="px-3 py-1 text-xs rounded bg-blue-100 text-blue-700 hover:bg-blue-200 transition-colors"
                >
                  🙋 +1 Participation
                </button>
                <button
                  type="button"
                  onClick={() => handleBulkStar('homework', 1)}
                  className="px-3 py-1 text-xs rounded bg-green-100 text-green-700 hover:bg-green-200 transition-colors"
                >
                  📝 +1 Homework
                </button>
                <button
                  type="button"
                  onClick={() => handleBulkStar('attention', 1)}
                  className="px-3 py-1 text-xs rounded bg-purple-100 text-purple-700 hover:bg-purple-200 transition-colors"
                >
                  👀 +1 Attention
                </button>
              </div>
              <div className="flex flex-wrap gap-2">
                <span className="text-sm text-gray-600 mr-2">Max stars (3):</span>
                <button
                  type="button"
                  onClick={() => handleBulkStar('participation', 3)}
                  className="px-3 py-1 text-xs rounded bg-blue-50 text-blue-600 hover:bg-blue-100 transition-colors border border-blue-200"
                >
                  🙋 Max
                </button>
                <button
                  type="button"
                  onClick={() => handleBulkStar('homework', 3)}
                  className="px-3 py-1 text-xs rounded bg-green-50 text-green-600 hover:bg-green-100 transition-colors border border-green-200"
                >
                  📝 Max
                </button>
                <button
                  type="button"
                  onClick={() => handleBulkStar('attention', 3)}
                  className="px-3 py-1 text-xs rounded bg-purple-50 text-purple-600 hover:bg-purple-100 transition-colors border border-purple-200"
                >
                  👀 Max
                </button>
              </div>
              <div className="pt-2 border-t border-gray-100">
                <button
                  type="button"
                  onClick={handleResetAllStars}
                  className="px-3 py-1 text-xs rounded bg-red-50 text-red-600 hover:bg-red-100 transition-colors border border-red-200"
                >
                  ↺ Reset All Stars Today
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {loading ? (
        <div className="text-gray-600">{t('common.loading')}</div>
      ) : (
        <div className="space-y-3">
          <div className="rounded-md border border-gray-200 bg-white p-3 shadow-sm overflow-x-auto">
            <div className="grid grid-cols-8 gap-2 min-w-[700px]">
              {seatGrid.flat().map(({ idx, data }) => (
                <div
                  key={idx}
                  onDragOver={allowDrop}
                  onDrop={(e) => onDropSeat(idx, e)}
                  className={`min-h-[110px] rounded border-2 flex flex-col select-none transition-colors ${
                    data
                      ? data.isAbsent
                        ? 'bg-gray-200 border-gray-400 opacity-60'
                        : `${getGradeBg(data.grade, data.initialGrade, data.semesterAvg)} ${getGradeColor(data.grade, data.initialGrade)}`
                      : 'bg-white border-dashed border-gray-300 text-gray-400'
                  }`}
                >
                  {data ? (
                    <div
                      draggable
                      onDragStart={(e) => onDragStart(idx, e)}
                      className="w-full h-full flex flex-col cursor-move p-1"
                    >
                      {/* Absent indicator + name */}
                      <div className="flex items-start justify-between">
                        <button
                          type="button"
                          onClick={(e) => handleToggleAbsence(data.student.id!, e)}
                          className={`w-5 h-5 rounded text-[10px] flex items-center justify-center transition-colors ${
                            data.isAbsent
                              ? 'bg-gray-500 text-white'
                              : 'bg-gray-100 text-gray-400 hover:bg-orange-100 hover:text-orange-600'
                          }`}
                          title={data.isAbsent ? 'Mark as present' : 'Mark as absent'}
                        >
                          {data.isAbsent ? '✗' : '○'}
                        </button>
                        <div
                          className="text-center flex-1 hover:text-brand cursor-pointer"
                          onClick={() => navigate(`/student/${data.student.id}`)}
                          title={`${data.student.last_name} ${data.student.first_name}`}
                        >
                          <div className="font-medium text-xs truncate">{data.student.last_name}</div>
                          <div className="text-[10px] text-gray-600">#{data.student.number}</div>
                        </div>
                        <div className="w-5"></div>
                      </div>

                      {/* Absent label */}
                      {data.isAbsent && (
                        <div className="text-center text-[10px] text-gray-600 font-medium">
                          ABSENT
                        </div>
                      )}

                      {/* Grades row: behavior + semester avg */}
                      <div className="flex justify-center gap-2 text-[10px] font-medium mt-1">
                        <span className={`${data.grade >= data.initialGrade * 0.8 ? 'text-emerald-700' : data.grade >= data.initialGrade * 0.6 ? 'text-yellow-700' : 'text-red-700'}`}>
                          {data.grade}/{data.initialGrade}
                        </span>
                        <span className={getSemesterColor(data.semesterAvg)}>
                          {data.semesterAvg !== null ? `${data.semesterAvg.toFixed(0)}%` : '—'}
                        </span>
                      </div>

                      {/* Struggling indicator */}
                      {data.semesterAvg !== null && data.semesterAvg < 50 && (
                        <div className="text-center text-[9px] text-red-600 font-medium">
                          ⚠️ Needs help
                        </div>
                      )}

                      {/* Quick star buttons */}
                      <div className="flex justify-center gap-1 mt-auto pt-1">
                        <button
                          type="button"
                          onClick={(e) => handleQuickStar(data.student.id!, 'participation', e)}
                          className={`w-6 h-6 rounded text-xs flex items-center justify-center transition-colors ${
                            (data.stars.get('participation') ?? 0) > 0
                              ? 'bg-blue-100 text-blue-700 border border-blue-300'
                              : 'bg-gray-100 text-gray-400 border border-gray-200 hover:bg-blue-50'
                          }`}
                          title={`Participation: ${data.stars.get('participation') ?? 0}/3`}
                        >
                          🙋
                        </button>
                        <button
                          type="button"
                          onClick={(e) => handleQuickStar(data.student.id!, 'homework', e)}
                          className={`w-6 h-6 rounded text-xs flex items-center justify-center transition-colors ${
                            (data.stars.get('homework') ?? 0) > 0
                              ? 'bg-green-100 text-green-700 border border-green-300'
                              : 'bg-gray-100 text-gray-400 border border-gray-200 hover:bg-green-50'
                          }`}
                          title={`Homework: ${data.stars.get('homework') ?? 0}/3`}
                        >
                          📝
                        </button>
                        <button
                          type="button"
                          onClick={(e) => handleQuickStar(data.student.id!, 'attention', e)}
                          className={`w-6 h-6 rounded text-xs flex items-center justify-center transition-colors ${
                            (data.stars.get('attention') ?? 0) > 0
                              ? 'bg-purple-100 text-purple-700 border border-purple-300'
                              : 'bg-gray-100 text-gray-400 border border-gray-200 hover:bg-purple-50'
                          }`}
                          title={`Attention: ${data.stars.get('attention') ?? 0}/3`}
                        >
                          👀
                        </button>
                      </div>

                      {/* Star count indicator */}
                      {data.totalStars > 0 && (
                        <div className="text-center text-[10px] text-amber-600 font-medium">
                          {data.totalStars}/9 ⭐
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="flex items-center justify-center h-full text-xs">Empty</div>
                  )}
                </div>
              ))}
            </div>
            <div className="mt-3 flex items-center justify-between text-xs text-gray-500">
              <span>Drag to rearrange seats. Click name for details.</span>
              <div className="flex items-center gap-3">
                <span className="flex items-center gap-1"><span className="w-3 h-3 rounded border-2 border-emerald-400 bg-emerald-50"></span> Good</span>
                <span className="flex items-center gap-1"><span className="w-3 h-3 rounded border-2 border-yellow-400 bg-yellow-50"></span> Warning</span>
                <span className="flex items-center gap-1"><span className="w-3 h-3 rounded border-2 border-red-400 bg-red-100"></span> Struggling</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
