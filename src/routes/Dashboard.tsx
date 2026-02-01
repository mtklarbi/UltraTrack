import { useEffect, useMemo, useState } from 'react';
import { useAppStore } from '../store/app';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import {
  getSemesterAverage,
  getSemesterStarHistory,
  getGradeScale,
  convertPercentToGrade,
  getAbsenceCount,
  type SemesterAverage,
  type WeeklyStarRecord,
} from '../repository';
import type { GradeScale } from '../db';

type StudentSemesterData = {
  id: number;
  name: string;
  class_name: string;
  number: number;
  semesterAvg: SemesterAverage;
  history: WeeklyStarRecord[];
  absenceCount: number;
};

export default function Dashboard() {
  const { t } = useTranslation();
  const students = useAppStore((s) => s.students);
  const loadStudents = useAppStore((s) => s.loadStudents);

  useEffect(() => { if (!students.length) void loadStudents(); }, [students.length, loadStudents]);

  const classes = useMemo(() => Array.from(new Set(students.map((s) => s.class_name))).sort(), [students]);
  const [selectedClass, setSelectedClass] = useState<string>('');
  const [sortBy, setSortBy] = useState<'name' | 'average' | 'weeks'>('average');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  useEffect(() => {
    if (!selectedClass && classes.length) setSelectedClass(classes[0]);
  }, [classes, selectedClass]);

  // Load semester data for all students in class
  const [semesterData, setSemesterData] = useState<Map<number, StudentSemesterData>>(new Map());
  const [gradeScale, setGradeScale] = useState<GradeScale | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadData = async () => {
      if (!selectedClass) return;
      setLoading(true);

      const scale = await getGradeScale();
      setGradeScale(scale);

      const data = new Map<number, StudentSemesterData>();
      const classStudents = students.filter(s => s.class_name === selectedClass);

      for (const student of classStudents) {
        const [semesterAvg, history, absenceCount] = await Promise.all([
          getSemesterAverage(student.id!),
          getSemesterStarHistory(student.id!),
          getAbsenceCount(student.id!),
        ]);
        data.set(student.id!, {
          id: student.id!,
          name: `${student.last_name} ${student.first_name}`,
          class_name: student.class_name,
          number: student.number,
          semesterAvg,
          history,
          absenceCount,
        });
      }

      setSemesterData(data);
      setLoading(false);
    };
    loadData();
  }, [students, selectedClass]);

  // Sorted student list
  const sortedStudents = useMemo(() => {
    const entries = Array.from(semesterData.values());
    return entries.sort((a, b) => {
      let cmp = 0;
      if (sortBy === 'name') {
        cmp = a.name.localeCompare(b.name);
      } else if (sortBy === 'average') {
        cmp = a.semesterAvg.overall - b.semesterAvg.overall;
      } else if (sortBy === 'weeks') {
        cmp = a.semesterAvg.totalWeeks - b.semesterAvg.totalWeeks;
      }
      return sortDir === 'desc' ? -cmp : cmp;
    });
  }, [semesterData, sortBy, sortDir]);

  // Class-wide stats
  const classStats = useMemo(() => {
    const entries = Array.from(semesterData.values());
    if (entries.length === 0) {
      return {
        avgOverall: 0,
        avgParticipation: 0,
        avgHomework: 0,
        avgAttention: 0,
        totalWeeks: 0,
        topStudents: [] as StudentSemesterData[],
        strugglingStudents: [] as StudentSemesterData[],
      };
    }

    const withData = entries.filter(e => e.semesterAvg.totalWeeks > 0);
    if (withData.length === 0) {
      return {
        avgOverall: 0,
        avgParticipation: 0,
        avgHomework: 0,
        avgAttention: 0,
        totalWeeks: 0,
        topStudents: [],
        strugglingStudents: [],
      };
    }

    const avgOverall = withData.reduce((sum, e) => sum + e.semesterAvg.overall, 0) / withData.length;
    const avgParticipation = withData.reduce((sum, e) => sum + e.semesterAvg.participation, 0) / withData.length;
    const avgHomework = withData.reduce((sum, e) => sum + e.semesterAvg.homework, 0) / withData.length;
    const avgAttention = withData.reduce((sum, e) => sum + e.semesterAvg.attention, 0) / withData.length;
    const maxWeeks = Math.max(...withData.map(e => e.semesterAvg.totalWeeks));

    const sorted = [...withData].sort((a, b) => b.semesterAvg.overall - a.semesterAvg.overall);
    const topStudents = sorted.slice(0, 5);
    const strugglingStudents = sorted.filter(s => s.semesterAvg.overall < 50).slice(-5).reverse();

    return {
      avgOverall,
      avgParticipation,
      avgHomework,
      avgAttention,
      totalWeeks: maxWeeks,
      topStudents,
      strugglingStudents,
    };
  }, [semesterData]);

  const handleSort = (col: 'name' | 'average' | 'weeks') => {
    if (sortBy === col) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(col);
      setSortDir(col === 'name' ? 'asc' : 'desc');
    }
  };

  const getSortIcon = (col: 'name' | 'average' | 'weeks') => {
    if (sortBy !== col) return '↕';
    return sortDir === 'asc' ? '↑' : '↓';
  };

  const getGradeLabel = (pct: number) => {
    if (pct >= 90) return { label: 'Excellent', color: 'text-emerald-600', bg: 'bg-emerald-100' };
    if (pct >= 75) return { label: 'Good', color: 'text-blue-600', bg: 'bg-blue-100' };
    if (pct >= 60) return { label: 'Average', color: 'text-yellow-600', bg: 'bg-yellow-100' };
    if (pct >= 40) return { label: 'Needs Work', color: 'text-orange-600', bg: 'bg-orange-100' };
    return { label: 'Struggling', color: 'text-red-600', bg: 'bg-red-100' };
  };

  // PDF Export
  const exportToPDF = () => {
    if (!gradeScale || sortedStudents.length === 0) return;

    const today = new Date().toLocaleDateString('ar-SA');

    // Open a new window and write content directly to preserve UTF-8
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      alert('Please allow popups for this site');
      return;
    }

    printWindow.document.write(`<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>تقرير الفصل - ${selectedClass}</title>
  <style>
    * { font-family: 'Segoe UI', Tahoma, Arial, 'Noto Sans Arabic', 'Arial Unicode MS', sans-serif; }
    body { margin: 20px; direction: rtl; unicode-bidi: embed; }
    h1 { color: #333; border-bottom: 2px solid #333; padding-bottom: 10px; text-align: right; }
    .meta { color: #666; margin-bottom: 20px; text-align: right; }
    table { width: 100%; border-collapse: collapse; margin-top: 20px; direction: rtl; }
    th, td { border: 1px solid #ddd; padding: 8px 12px; text-align: right; }
    th { background-color: #f5f5f5; font-weight: bold; }
    tr:nth-child(even) { background-color: #fafafa; }
    .grade-excellent { color: #059669; font-weight: bold; }
    .grade-good { color: #2563eb; font-weight: bold; }
    .grade-average { color: #d97706; font-weight: bold; }
    .grade-poor { color: #dc2626; font-weight: bold; }
    .summary { margin-top: 30px; padding: 15px; background: #f5f5f5; border-radius: 8px; text-align: right; }
    .summary h3 { margin-top: 0; }
    .center { text-align: center; }
    @media print { body { margin: 10px; } }
  </style>
</head>
<body>
  <h1>تقرير الفصل الدراسي: ${selectedClass}</h1>
  <div class="meta">
    التاريخ: ${today} | عدد الطلاب: ${sortedStudents.length} | الأسابيع المسجلة: ${classStats.totalWeeks}
  </div>

  <table>
    <thead>
      <tr>
        <th>#</th>
        <th>اسم الطالب</th>
        <th class="center">المشاركة</th>
        <th class="center">الواجب</th>
        <th class="center">الانتباه</th>
        <th class="center">المعدل %</th>
        <th class="center">الدرجة</th>
        <th class="center">الأسابيع</th>
        <th class="center">الغياب</th>
      </tr>
    </thead>
    <tbody>
      ${sortedStudents.map(st => {
        const hasData = st.semesterAvg.totalWeeks > 0;
        const letterGrade = hasData ? convertPercentToGrade(st.semesterAvg.overall, gradeScale.thresholds) : '—';
        const gradeClass = st.semesterAvg.overall >= 75 ? 'grade-excellent' :
                          st.semesterAvg.overall >= 60 ? 'grade-good' :
                          st.semesterAvg.overall >= 40 ? 'grade-average' : 'grade-poor';
        return `
          <tr>
            <td class="center">${st.number}</td>
            <td>${st.name}</td>
            <td class="center">${hasData ? st.semesterAvg.participation.toFixed(1) : '—'}</td>
            <td class="center">${hasData ? st.semesterAvg.homework.toFixed(1) : '—'}</td>
            <td class="center">${hasData ? st.semesterAvg.attention.toFixed(1) : '—'}</td>
            <td class="center">${hasData ? st.semesterAvg.overall.toFixed(0) + '%' : '—'}</td>
            <td class="center ${gradeClass}">${letterGrade}</td>
            <td class="center">${st.semesterAvg.totalWeeks}</td>
            <td class="center">${st.absenceCount}</td>
          </tr>
        `;
      }).join('')}
    </tbody>
  </table>

  <div class="summary">
    <h3>ملخص الصف</h3>
    <p><strong>معدل الصف:</strong> ${classStats.avgOverall.toFixed(0)}%</p>
    <p><strong>معدل المشاركة:</strong> ${classStats.avgParticipation.toFixed(1)}/3</p>
    <p><strong>معدل الواجب:</strong> ${classStats.avgHomework.toFixed(1)}/3</p>
    <p><strong>معدل الانتباه:</strong> ${classStats.avgAttention.toFixed(1)}/3</p>
  </div>

  <script>
    window.onload = function() {
      setTimeout(function() { window.print(); }, 500);
    };
  </script>
</body>
</html>`);
    printWindow.document.close();
  };

  return (
    <section className="space-y-4">
      <h1 className="text-2xl font-semibold">{t('nav.dashboard')} - Semester Overview</h1>

      <div className="flex items-center gap-3 flex-wrap">
        <label className="text-sm text-gray-700">{t('common.class')}
          <select value={selectedClass} onChange={(e) => setSelectedClass(e.target.value)} className="ml-2 rounded border px-2 py-1 text-sm">
            {classes.map((c) => (<option key={c} value={c}>{c}</option>))}
          </select>
        </label>
        <span className="text-sm text-gray-500">{semesterData.size} students</span>
        {classStats.totalWeeks > 0 && (
          <span className="text-sm text-gray-500">• {classStats.totalWeeks} weeks recorded</span>
        )}
        <button
          type="button"
          onClick={exportToPDF}
          disabled={loading || sortedStudents.length === 0}
          className="ml-auto px-4 py-1.5 text-sm rounded-md bg-brand text-white hover:bg-brand-dark disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
        >
          📄 Export PDF Report
        </button>
      </div>

      {loading ? (
        <div className="text-gray-600">{t('common.loading')}</div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_20rem] gap-4">
          {/* Student List */}
          <div className="rounded-md border bg-white shadow-sm overflow-auto max-h-[600px]">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50 sticky top-0">
                <tr>
                  <th
                    className="text-left px-4 py-2 font-medium text-gray-700 cursor-pointer hover:bg-gray-100"
                    onClick={() => handleSort('name')}
                  >
                    Student {getSortIcon('name')}
                  </th>
                  <th className="text-center px-2 py-2 font-medium text-gray-700">🙋</th>
                  <th className="text-center px-2 py-2 font-medium text-gray-700">📝</th>
                  <th className="text-center px-2 py-2 font-medium text-gray-700">👀</th>
                  <th
                    className="text-center px-4 py-2 font-medium text-gray-700 cursor-pointer hover:bg-gray-100"
                    onClick={() => handleSort('average')}
                  >
                    Avg {getSortIcon('average')}
                  </th>
                  <th className="text-center px-2 py-2 font-medium text-gray-700">Grade</th>
                  <th
                    className="text-center px-2 py-2 font-medium text-gray-700 cursor-pointer hover:bg-gray-100"
                    onClick={() => handleSort('weeks')}
                  >
                    Weeks {getSortIcon('weeks')}
                  </th>
                  <th className="text-center px-2 py-2 font-medium text-gray-700">Absent</th>
                </tr>
              </thead>
              <tbody>
                {sortedStudents.map((st) => {
                  const gradeInfo = getGradeLabel(st.semesterAvg.overall);
                  const hasData = st.semesterAvg.totalWeeks > 0;
                  const letterGrade = gradeScale && hasData
                    ? convertPercentToGrade(st.semesterAvg.overall, gradeScale.thresholds)
                    : '—';
                  return (
                    <tr key={st.id} className={`border-t hover:bg-gray-50 ${!hasData ? 'opacity-50' : ''}`}>
                      <td className="px-4 py-2">
                        <Link to={`/student/${st.id}`} className="text-brand hover:underline">
                          #{st.number} — {st.name}
                        </Link>
                      </td>
                      <td className="px-2 py-2 text-center">
                        {hasData ? (
                          <span className="text-blue-600 font-medium">{st.semesterAvg.participation.toFixed(1)}</span>
                        ) : '—'}
                      </td>
                      <td className="px-2 py-2 text-center">
                        {hasData ? (
                          <span className="text-green-600 font-medium">{st.semesterAvg.homework.toFixed(1)}</span>
                        ) : '—'}
                      </td>
                      <td className="px-2 py-2 text-center">
                        {hasData ? (
                          <span className="text-purple-600 font-medium">{st.semesterAvg.attention.toFixed(1)}</span>
                        ) : '—'}
                      </td>
                      <td className="px-2 py-2 text-center">
                        {hasData ? (
                          <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${gradeInfo.color} ${gradeInfo.bg}`}>
                            {st.semesterAvg.overall.toFixed(0)}%
                          </span>
                        ) : (
                          <span className="text-gray-400">—</span>
                        )}
                      </td>
                      <td className="px-2 py-2 text-center">
                        <span className={`inline-block px-2 py-0.5 rounded text-sm font-bold ${gradeInfo.color}`}>
                          {letterGrade}
                        </span>
                      </td>
                      <td className="px-2 py-2 text-center text-gray-600">
                        {st.semesterAvg.totalWeeks}
                      </td>
                      <td className="px-2 py-2 text-center">
                        {st.absenceCount > 0 ? (
                          <span className="text-orange-600 font-medium">{st.absenceCount}</span>
                        ) : (
                          <span className="text-gray-400">0</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Sidebar Stats */}
          <div className="space-y-4">
            {/* Class Semester Summary */}
            <div className="rounded-md border bg-white shadow-sm p-3">
              <div className="text-sm font-medium mb-2">Class Semester Average</div>
              {classStats.totalWeeks === 0 ? (
                <div className="text-sm text-gray-500">No data recorded yet</div>
              ) : (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-600">Overall</span>
                    <span className={`text-2xl font-bold ${getGradeLabel(classStats.avgOverall).color}`}>
                      {classStats.avgOverall.toFixed(0)}%
                    </span>
                  </div>
                  <div className="h-3 w-full rounded-full bg-gray-100 overflow-hidden">
                    <div
                      className={`h-full ${
                        classStats.avgOverall >= 75 ? 'bg-emerald-500' :
                        classStats.avgOverall >= 50 ? 'bg-yellow-500' : 'bg-red-500'
                      }`}
                      style={{ width: `${Math.min(100, classStats.avgOverall)}%` }}
                    />
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-xs">
                    <div className="text-center p-2 rounded bg-blue-50">
                      <div className="text-blue-600 font-medium">🙋</div>
                      <div className="text-gray-600">Participation</div>
                      <div className="font-bold text-blue-700">{classStats.avgParticipation.toFixed(1)}/3</div>
                    </div>
                    <div className="text-center p-2 rounded bg-green-50">
                      <div className="text-green-600 font-medium">📝</div>
                      <div className="text-gray-600">Homework</div>
                      <div className="font-bold text-green-700">{classStats.avgHomework.toFixed(1)}/3</div>
                    </div>
                    <div className="text-center p-2 rounded bg-purple-50">
                      <div className="text-purple-600 font-medium">👀</div>
                      <div className="text-gray-600">Attention</div>
                      <div className="font-bold text-purple-700">{classStats.avgAttention.toFixed(1)}/3</div>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Top Performers */}
            {classStats.topStudents.length > 0 && (
              <div className="rounded-md border bg-white shadow-sm p-3">
                <div className="text-sm font-medium mb-2 flex items-center gap-1">
                  <span>🏆</span> Top Performers
                </div>
                <ul className="space-y-2">
                  {classStats.topStudents.map((s, i) => (
                    <li key={s.id} className="flex items-center justify-between text-sm">
                      <span className="flex items-center gap-2">
                        <span className={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold ${
                          i === 0 ? 'bg-amber-100 text-amber-700' :
                          i === 1 ? 'bg-gray-200 text-gray-700' :
                          i === 2 ? 'bg-orange-100 text-orange-700' :
                          'bg-gray-100 text-gray-600'
                        }`}>
                          {i + 1}
                        </span>
                        <Link to={`/student/${s.id}`} className="hover:text-brand truncate max-w-[120px]">
                          {s.name}
                        </Link>
                      </span>
                      <span className={`font-medium ${getGradeLabel(s.semesterAvg.overall).color}`}>
                        {s.semesterAvg.overall.toFixed(0)}%
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Struggling Students */}
            {classStats.strugglingStudents.length > 0 && (
              <div className="rounded-md border border-red-200 bg-red-50 shadow-sm p-3">
                <div className="text-sm font-medium mb-2 flex items-center gap-1 text-red-700">
                  <span>⚠️</span> Need Attention
                </div>
                <ul className="space-y-2">
                  {classStats.strugglingStudents.map((s) => (
                    <li key={s.id} className="flex items-center justify-between text-sm">
                      <Link to={`/student/${s.id}`} className="hover:text-red-800 text-red-700 truncate max-w-[140px]">
                        {s.name}
                      </Link>
                      <span className="font-medium text-red-600">
                        {s.semesterAvg.overall.toFixed(0)}%
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Grade Distribution */}
            {classStats.totalWeeks > 0 && (
              <div className="rounded-md border bg-white shadow-sm p-3">
                <div className="text-sm font-medium mb-2">Grade Distribution</div>
                <div className="space-y-1 text-xs">
                  {[
                    { label: 'Excellent (90%+)', min: 90, color: 'bg-emerald-500' },
                    { label: 'Good (75-89%)', min: 75, max: 90, color: 'bg-blue-500' },
                    { label: 'Average (60-74%)', min: 60, max: 75, color: 'bg-yellow-500' },
                    { label: 'Needs Work (40-59%)', min: 40, max: 60, color: 'bg-orange-500' },
                    { label: 'Struggling (<40%)', max: 40, color: 'bg-red-500' },
                  ].map(({ label, min, max, color }) => {
                    const count = sortedStudents.filter(s => {
                      if (s.semesterAvg.totalWeeks === 0) return false;
                      const pct = s.semesterAvg.overall;
                      if (min !== undefined && max !== undefined) return pct >= min && pct < max;
                      if (min !== undefined) return pct >= min;
                      if (max !== undefined) return pct < max;
                      return false;
                    }).length;
                    const pct = sortedStudents.filter(s => s.semesterAvg.totalWeeks > 0).length;
                    const width = pct > 0 ? (count / pct) * 100 : 0;
                    return (
                      <div key={label} className="flex items-center gap-2">
                        <span className="w-28 text-gray-600">{label}</span>
                        <div className="flex-1 h-4 bg-gray-100 rounded overflow-hidden">
                          <div className={`h-full ${color}`} style={{ width: `${width}%` }} />
                        </div>
                        <span className="w-8 text-right font-medium">{count}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
