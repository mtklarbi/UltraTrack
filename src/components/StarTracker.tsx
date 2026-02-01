import { useEffect, useState } from 'react';
import type { StarCategory } from '../db';
import {
  getDailyStarsForStudent,
  setDailyStar,
  getTodayDateStr,
  getSemesterStarHistory,
  getSemesterAverage,
  type WeeklyStarRecord,
  type SemesterAverage,
} from '../repository';

export type StarTrackerProps = {
  studentId: number;
  date?: string; // defaults to today
  onUpdate?: () => void;
};

const CATEGORIES: { key: StarCategory; label: string; icon: string }[] = [
  { key: 'participation', label: 'Participation', icon: '🙋' },
  { key: 'homework', label: 'Homework', icon: '📝' },
  { key: 'attention', label: 'Attention', icon: '👀' },
];

export default function StarTracker({ studentId, date, onUpdate }: StarTrackerProps) {
  const [stars, setStars] = useState<Map<StarCategory, number>>(new Map());
  const [loading, setLoading] = useState(true);
  const [history, setHistory] = useState<WeeklyStarRecord[]>([]);
  const [average, setAverage] = useState<SemesterAverage | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const dateStr = date || getTodayDateStr();

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const [data, hist, avg] = await Promise.all([
        getDailyStarsForStudent(studentId, dateStr),
        getSemesterStarHistory(studentId),
        getSemesterAverage(studentId),
      ]);
      setStars(data);
      setHistory(hist);
      setAverage(avg);
      setLoading(false);
    };
    load();
  }, [studentId, dateStr]);

  const handleStarClick = async (category: StarCategory, clickedStar: number) => {
    const current = stars.get(category) ?? 0;
    // If clicking same star, toggle off (set to star-1), otherwise set to clicked star
    const newValue = current === clickedStar ? clickedStar - 1 : clickedStar;
    await setDailyStar(studentId, dateStr, category, newValue);
    setStars(new Map(stars).set(category, newValue));

    // Refresh history and average
    const [hist, avg] = await Promise.all([
      getSemesterStarHistory(studentId),
      getSemesterAverage(studentId),
    ]);
    setHistory(hist);
    setAverage(avg);
    onUpdate?.();
  };

  if (loading) {
    return (
      <div className="rounded-md border border-gray-200 bg-white p-4 shadow-sm animate-pulse">
        <div className="h-6 bg-gray-200 rounded w-1/3 mb-4"></div>
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-8 bg-gray-200 rounded"></div>
          ))}
        </div>
      </div>
    );
  }

  const totalStars = Array.from(stars.values()).reduce((sum, v) => sum + v, 0);
  const maxStars = CATEGORIES.length * 3;

  const getGradeLabel = (pct: number) => {
    if (pct >= 90) return { label: 'Excellent', color: 'text-emerald-600' };
    if (pct >= 75) return { label: 'Good', color: 'text-blue-600' };
    if (pct >= 60) return { label: 'Average', color: 'text-yellow-600' };
    if (pct >= 40) return { label: 'Needs Improvement', color: 'text-orange-600' };
    return { label: 'Poor', color: 'text-red-600' };
  };

  return (
    <div className="space-y-4">
      {/* Today's Stars */}
      <div className="rounded-md border border-gray-200 bg-white shadow-sm overflow-hidden">
        <div className="p-4 border-b border-gray-100">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-medium text-gray-700">Today's Stars</h3>
              <p className="text-xs text-gray-500">{new Date(dateStr).toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })}</p>
            </div>
            <div className="text-2xl font-bold text-amber-500">
              {totalStars}/{maxStars} ⭐
            </div>
          </div>
        </div>

        <div className="p-4 space-y-4">
          {CATEGORIES.map(({ key, label, icon }) => {
            const value = stars.get(key) ?? 0;
            return (
              <div key={key} className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-lg">{icon}</span>
                  <span className="text-sm font-medium text-gray-700">{label}</span>
                </div>
                <div className="flex items-center gap-1">
                  {[1, 2, 3].map((star) => (
                    <button
                      key={star}
                      type="button"
                      onClick={() => handleStarClick(key, star)}
                      className={`text-2xl transition-transform hover:scale-110 ${
                        star <= value ? 'text-amber-400' : 'text-gray-300'
                      }`}
                    >
                      ★
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Semester Average Card */}
      {average && average.totalWeeks > 0 && (
        <div className="rounded-md border border-gray-200 bg-white shadow-sm overflow-hidden">
          <div className="p-4 border-b border-gray-100">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-medium text-gray-700">Semester Average</h3>
                <p className="text-xs text-gray-500">{average.totalWeeks} weeks recorded</p>
              </div>
              <div className="text-right">
                <div className={`text-2xl font-bold ${getGradeLabel(average.overall).color}`}>
                  {average.overall.toFixed(0)}%
                </div>
                <div className={`text-xs ${getGradeLabel(average.overall).color}`}>
                  {getGradeLabel(average.overall).label}
                </div>
              </div>
            </div>
          </div>

          <div className="p-4">
            {/* Progress bar */}
            <div className="h-3 w-full rounded-full bg-gray-100 overflow-hidden mb-4">
              <div
                className={`h-full transition-all ${
                  average.overall >= 75 ? 'bg-emerald-500' :
                  average.overall >= 50 ? 'bg-yellow-500' : 'bg-red-500'
                }`}
                style={{ width: `${Math.min(100, average.overall)}%` }}
              />
            </div>

            {/* Category averages */}
            <div className="grid grid-cols-3 gap-3 text-center">
              {CATEGORIES.map(({ key, label, icon }) => {
                const avgVal = average[key];
                return (
                  <div key={key} className="p-2 rounded bg-gray-50">
                    <div className="text-lg">{icon}</div>
                    <div className="text-xs text-gray-500">{label}</div>
                    <div className="font-bold text-gray-700">{avgVal.toFixed(1)}/3</div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Week-by-Week History */}
      {history.length > 0 && (
        <div className="rounded-md border border-gray-200 bg-white shadow-sm overflow-hidden">
          <button
            type="button"
            className="w-full p-4 flex items-center justify-between text-left hover:bg-gray-50 transition-colors"
            onClick={() => setShowHistory(!showHistory)}
          >
            <div>
              <h3 className="text-sm font-medium text-gray-700">Weekly History</h3>
              <p className="text-xs text-gray-500">{history.length} sessions this semester</p>
            </div>
            <span className={`text-gray-400 transition-transform ${showHistory ? 'rotate-180' : ''}`}>
              ▼
            </span>
          </button>

          {showHistory && (
            <div className="border-t border-gray-100">
              <table className="w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="text-left px-4 py-2 font-medium text-gray-600">Date</th>
                    <th className="text-center px-2 py-2 font-medium text-gray-600">🙋</th>
                    <th className="text-center px-2 py-2 font-medium text-gray-600">📝</th>
                    <th className="text-center px-2 py-2 font-medium text-gray-600">👀</th>
                    <th className="text-right px-4 py-2 font-medium text-gray-600">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {[...history].reverse().map((week) => {
                    const pct = (week.total / week.maxPossible) * 100;
                    return (
                      <tr key={week.weekStart} className="border-t border-gray-100 hover:bg-gray-50">
                        <td className="px-4 py-2 text-gray-700">{week.weekLabel}</td>
                        <td className="px-2 py-2 text-center">
                          <span className={week.participation > 0 ? 'text-blue-600 font-medium' : 'text-gray-400'}>
                            {week.participation}
                          </span>
                        </td>
                        <td className="px-2 py-2 text-center">
                          <span className={week.homework > 0 ? 'text-green-600 font-medium' : 'text-gray-400'}>
                            {week.homework}
                          </span>
                        </td>
                        <td className="px-2 py-2 text-center">
                          <span className={week.attention > 0 ? 'text-purple-600 font-medium' : 'text-gray-400'}>
                            {week.attention}
                          </span>
                        </td>
                        <td className="px-4 py-2 text-right">
                          <span className={`font-medium ${
                            pct >= 75 ? 'text-emerald-600' :
                            pct >= 50 ? 'text-yellow-600' : 'text-red-600'
                          }`}>
                            {week.total}/9
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Empty state for new students */}
      {history.length === 0 && (
        <div className="rounded-md border border-dashed border-gray-300 bg-gray-50 p-6 text-center">
          <div className="text-gray-400 text-3xl mb-2">📊</div>
          <p className="text-sm text-gray-600">No history yet</p>
          <p className="text-xs text-gray-500">Star ratings will appear here as you record them each week</p>
        </div>
      )}
    </div>
  );
}
