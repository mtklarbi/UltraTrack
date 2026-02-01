import { useEffect, useMemo, useState } from 'react';
import type { IncidentType, Incident, WeeklyGrade } from '../db';
import {
  getWeekStart,
  ensureWeeklyGradeForStudent,
  getWeeklyGrade,
  upsertWeeklyGrade,
  upsertIncident,
  listIncidentsByStudentForWeek,
  getBehaviorSettings,
  getIncidentType,
  deleteIncident,
} from '../repository';
import IncidentButtons from './IncidentButtons';

export type BehaviorGradeCardProps = {
  studentId: number;
  onGradeChange?: (grade: number) => void;
};

export default function BehaviorGradeCard({ studentId, onGradeChange }: BehaviorGradeCardProps) {
  const [weeklyGrade, setWeeklyGrade] = useState<WeeklyGrade | null>(null);
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [incidentTypeMap, setIncidentTypeMap] = useState<Map<string, IncidentType>>(new Map());
  const [loading, setLoading] = useState(true);
  const [weekStart, setWeekStart] = useState<number>(0);
  const [initialGrade, setInitialGrade] = useState(20);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const settings = await getBehaviorSettings();
      setInitialGrade(settings.initial_grade);
      const ws = getWeekStart(new Date(), settings.reset_day);
      setWeekStart(ws);

      const grade = await ensureWeeklyGradeForStudent(studentId, ws, settings.initial_grade);
      setWeeklyGrade(grade);

      const weekIncidents = await listIncidentsByStudentForWeek(studentId, ws);
      setIncidents(weekIncidents);

      // Build incident type map
      const typeMap = new Map<string, IncidentType>();
      for (const inc of weekIncidents) {
        if (!typeMap.has(inc.incident_type_id)) {
          const type = await getIncidentType(inc.incident_type_id);
          if (type) typeMap.set(inc.incident_type_id, type);
        }
      }
      setIncidentTypeMap(typeMap);

      setLoading(false);
    };
    load();
  }, [studentId]);

  const recalculateGrade = async (incidentsList: Incident[]) => {
    const totalDeductions = incidentsList.reduce((sum, inc) => sum + inc.points, 0);
    const newGrade = Math.max(0, initialGrade - totalDeductions);

    if (weeklyGrade) {
      const updatedGrade: WeeklyGrade = {
        ...weeklyGrade,
        current_grade: newGrade,
        updated_at: Date.now(),
      };
      await upsertWeeklyGrade(updatedGrade);
      setWeeklyGrade(updatedGrade);
      onGradeChange?.(newGrade);
    }

    return newGrade;
  };

  const handleIncident = async (incidentType: IncidentType, customPoints?: number, customNote?: string) => {
    const points = customPoints ?? incidentType.points;
    const id = crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2);
    const ts = Date.now();

    const incident: Incident = {
      id,
      student_id: studentId,
      incident_type_id: incidentType.id,
      points,
      note: customNote || incidentType.label,
      recorded_at: ts,
      updated_at: ts,
    };

    await upsertIncident(incident);

    const newIncidents = [...incidents, incident];
    setIncidents(newIncidents);

    // Update type map if needed
    if (!incidentTypeMap.has(incidentType.id)) {
      setIncidentTypeMap(new Map(incidentTypeMap).set(incidentType.id, incidentType));
    }

    await recalculateGrade(newIncidents);
  };

  const handleDeleteIncident = async (incidentId: string) => {
    await deleteIncident(incidentId);
    const newIncidents = incidents.filter(i => i.id !== incidentId);
    setIncidents(newIncidents);
    await recalculateGrade(newIncidents);
  };

  const gradeColor = useMemo(() => {
    if (!weeklyGrade) return 'text-gray-700';
    const pct = (weeklyGrade.current_grade / initialGrade) * 100;
    if (pct >= 80) return 'text-emerald-600';
    if (pct >= 60) return 'text-yellow-600';
    if (pct >= 40) return 'text-orange-600';
    return 'text-red-600';
  }, [weeklyGrade, initialGrade]);

  const progressPct = useMemo(() => {
    if (!weeklyGrade) return 100;
    return Math.max(0, Math.min(100, (weeklyGrade.current_grade / initialGrade) * 100));
  }, [weeklyGrade, initialGrade]);

  const progressColor = useMemo(() => {
    if (progressPct >= 80) return 'bg-emerald-500';
    if (progressPct >= 60) return 'bg-yellow-500';
    if (progressPct >= 40) return 'bg-orange-500';
    return 'bg-red-500';
  }, [progressPct]);

  const formatDate = (ts: number) => {
    return new Date(ts).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
  };

  const formatTime = (ts: number) => {
    return new Date(ts).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  };

  if (loading) {
    return (
      <div className="rounded-md border border-gray-200 bg-white p-4 shadow-sm animate-pulse">
        <div className="h-6 bg-gray-200 rounded w-1/3 mb-4"></div>
        <div className="h-4 bg-gray-200 rounded w-full mb-2"></div>
        <div className="h-4 bg-gray-200 rounded w-2/3"></div>
      </div>
    );
  }

  return (
    <div className="rounded-md border border-gray-200 bg-white shadow-sm overflow-hidden">
      <div className="p-4 border-b border-gray-100">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h3 className="text-sm font-medium text-gray-700">Behavior Grade</h3>
            <p className="text-xs text-gray-500">Week of {formatDate(weekStart)}</p>
          </div>
          <div className={`text-3xl font-bold ${gradeColor}`}>
            {weeklyGrade?.current_grade ?? initialGrade}/{initialGrade}
          </div>
        </div>

        <div className="h-3 w-full rounded-full bg-gray-100 overflow-hidden">
          <div
            className={`h-full transition-all duration-300 ${progressColor}`}
            style={{ width: `${progressPct}%` }}
          />
        </div>
      </div>

      <div className="p-4 border-b border-gray-100">
        <h4 className="text-sm font-medium text-gray-700 mb-2">Record Incident</h4>
        <IncidentButtons onIncident={handleIncident} />
      </div>

      {incidents.length > 0 && (
        <div className="p-4">
          <h4 className="text-sm font-medium text-gray-700 mb-2">This Week's Incidents ({incidents.length})</h4>
          <ul className="space-y-2 max-h-48 overflow-auto">
            {incidents.slice().reverse().map((inc) => {
              const type = incidentTypeMap.get(inc.incident_type_id);
              return (
                <li key={inc.id} className="flex items-center justify-between text-sm bg-red-50 rounded px-2 py-1.5">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="font-medium text-red-700">-{inc.points}</span>
                    <span className="text-gray-700 truncate">{inc.note || type?.label || 'Incident'}</span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-xs text-gray-500">{formatTime(inc.recorded_at)}</span>
                    <button
                      type="button"
                      onClick={() => handleDeleteIncident(inc.id)}
                      className="text-xs text-gray-400 hover:text-red-600"
                      title="Remove incident"
                    >
                      ✕
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
