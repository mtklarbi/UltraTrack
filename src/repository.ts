import { db, type Student, type Scale, type Rating, type Note, type SeatingPlan, type IncidentType, type Incident, type WeeklyGrade, type BehaviorSettings, type DailyStar, type StarCategory, type Absence, type GradeScale, type GradeThreshold } from './db';

const now = () => Date.now();

// Students
export async function upsertStudent(s: Omit<Student, 'updated_at'> & Partial<Pick<Student, 'updated_at'>>): Promise<number> {
  const row: Student = { updated_at: s.updated_at ?? now(), ...s } as Student;
  return db.students.put(row);
}

export async function getStudent(id: number) {
  return db.students.get(id);
}

export async function listStudents(): Promise<Student[]> {
  const items = await db.students.toArray();
  return items.sort((a, b) => a.last_name.localeCompare(b.last_name) || a.first_name.localeCompare(b.first_name));
}

export async function deleteStudent(id: number) {
  await db.transaction('rw', db.ratings, db.notes, db.students, async () => {
    await db.ratings.where('student_id').equals(id).delete();
    await db.notes.where('student_id').equals(id).delete();
    await db.students.delete(id);
  });
}

export async function addStudent(s: Omit<Student, 'id' | 'updated_at'> & Partial<Pick<Student, 'updated_at'>>): Promise<number> {
  const row: Student = { updated_at: s.updated_at ?? Date.now(), ...s } as Student;
  return db.students.add(row);
}

export async function listClasses(): Promise<string[]> {
  const all = await db.students.toArray();
  return Array.from(new Set(all.map((s) => s.class_name))).sort();
}

export async function deleteClassCascade(className: string): Promise<void> {
  const ids = (await db.students.where('class_name').equals(className).toArray()).map((s) => s.id!).filter(Boolean) as number[];
  await db.transaction('rw', db.ratings, db.notes, db.students, async () => {
    if (ids.length) {
      await db.ratings.where('student_id').anyOf(ids).delete();
      await db.notes.where('student_id').anyOf(ids).delete();
    }
    await db.students.where('class_name').equals(className).delete();
  });
}

// Scales
export async function upsertScale(s: Omit<Scale, 'updated_at' | 'sort_index'> & Partial<Pick<Scale, 'updated_at' | 'sort_index'>>): Promise<string> {
  const base: Scale = { min: -3, max: 3, updated_at: now(), ...s };
  // If inserting new scale without sort_index, append to end
  const existing = await db.scales.get(base.id);
  if (!existing && base.sort_index == null) {
    const last = await db.scales.orderBy('sort_index').last();
    base.sort_index = (last?.sort_index ?? -1) + 1;
  }
  await db.scales.put(base);
  return base.id;
}

export async function getScale(id: string) {
  return db.scales.get(id);
}

export async function listScales(): Promise<Scale[]> {
  const items = await db.scales.toArray();
  return items.sort((a, b) => (a.sort_index ?? 0) - (b.sort_index ?? 0) || a.id.localeCompare(b.id));
}

export async function deleteScale(id: string) {
  await db.scales.delete(id);
}

export async function updateScalesOrder(ids: string[]) {
  await db.transaction('rw', db.scales, async () => {
    let i = 0;
    for (const id of ids) {
      const s = await db.scales.get(id);
      if (s) {
        s.sort_index = i++;
        s.updated_at = now();
        await db.scales.put(s);
      }
    }
  });
}

// Ratings
export async function upsertRating(r: Omit<Rating, 'updated_at'> & Partial<Pick<Rating, 'updated_at'>>): Promise<string> {
  // Treat as append-only event: always write with provided id
  const row: Rating = { updated_at: r.updated_at ?? now(), ...r } as Rating;
  await db.ratings.put(row);
  return row.id;
}

export async function getRating(id: string) {
  return db.ratings.get(id);
}

export async function listRatingsByStudent(studentId: number): Promise<Rating[]> {
  return db.ratings.where('student_id').equals(studentId).sortBy('recorded_at');
}

export async function listRatingsByScale(scaleId: string): Promise<Rating[]> {
  return db.ratings.where('scale_id').equals(scaleId).sortBy('recorded_at');
}

export async function deleteRating(id: string) {
  await db.ratings.delete(id);
}

// Notes
export async function upsertNote(n: Omit<Note, 'updated_at'> & Partial<Pick<Note, 'updated_at'>>): Promise<string> {
  const row: Note = { updated_at: n.updated_at ?? now(), ...n } as Note;
  await db.notes.put(row);
  return row.id;
}

export async function getNote(id: string) {
  return db.notes.get(id);
}

export async function listNotesByStudent(studentId: number): Promise<Note[]> {
  return db.notes.where('student_id').equals(studentId).sortBy('recorded_at');
}

export async function deleteNote(id: string) {
  await db.notes.delete(id);
}

// Seating plans
export async function getSeatingPlan(className: string): Promise<SeatingPlan | undefined> {
  return db.seating.get(className);
}

export async function upsertSeatingPlan(plan: SeatingPlan): Promise<string> {
  await db.seating.put(plan);
  return plan.class_name;
}

export async function ensureSeatingForClass(className: string): Promise<SeatingPlan> {
  const existing = await getSeatingPlan(className);
  if (existing) return existing;
  const students = await db.students.where('class_name').equals(className).sortBy('last_name');
  const maxSeats = 48; // 6 x 8 grid
  const seats: Array<number | null> = new Array(maxSeats).fill(null);
  for (let i = 0; i < Math.min(students.length, maxSeats); i++) {
    seats[i] = students[i].id!;
  }
  const plan: SeatingPlan = { class_name: className, seats, updated_at: Date.now() };
  await upsertSeatingPlan(plan);
  return plan;
}

// Incident Types
export async function upsertIncidentType(t: Omit<IncidentType, 'updated_at' | 'sort_index'> & Partial<Pick<IncidentType, 'updated_at' | 'sort_index'>>): Promise<string> {
  const base: IncidentType = { updated_at: now(), ...t };
  const existing = await db.incidentTypes.get(base.id);
  if (!existing && base.sort_index == null) {
    const last = await db.incidentTypes.orderBy('sort_index').last();
    base.sort_index = (last?.sort_index ?? -1) + 1;
  }
  await db.incidentTypes.put(base);
  return base.id;
}

export async function listIncidentTypes(): Promise<IncidentType[]> {
  const items = await db.incidentTypes.toArray();
  return items.sort((a, b) => (a.sort_index ?? 0) - (b.sort_index ?? 0));
}

export async function deleteIncidentType(id: string): Promise<void> {
  await db.incidentTypes.delete(id);
}

export async function getIncidentType(id: string): Promise<IncidentType | undefined> {
  return db.incidentTypes.get(id);
}

// Default incident types
export const DEFAULT_INCIDENT_TYPES: Omit<IncidentType, 'updated_at'>[] = [
  { id: 'talking', label: 'Talking', points: 1, sort_index: 0 },
  { id: 'late', label: 'Late', points: 2, sort_index: 1 },
  { id: 'disruptive', label: 'Disruptive', points: 3, sort_index: 2 },
  { id: 'no-homework', label: 'No Homework', points: 2, sort_index: 3 },
  { id: 'phone', label: 'Phone Use', points: 2, sort_index: 4 },
];

export async function ensureDefaultIncidentTypes(): Promise<void> {
  const existing = await db.incidentTypes.count();
  if (existing === 0) {
    for (const t of DEFAULT_INCIDENT_TYPES) {
      await upsertIncidentType(t);
    }
  }
}

// Incidents
export async function upsertIncident(i: Omit<Incident, 'updated_at'> & Partial<Pick<Incident, 'updated_at'>>): Promise<string> {
  const row: Incident = { updated_at: now(), ...i };
  await db.incidents.put(row);
  return row.id;
}

export async function listIncidentsByStudent(studentId: number): Promise<Incident[]> {
  return db.incidents.where('student_id').equals(studentId).sortBy('recorded_at');
}

export async function listIncidentsByStudentForWeek(studentId: number, weekStart: number): Promise<Incident[]> {
  const weekEnd = weekStart + 7 * 24 * 60 * 60 * 1000;
  const all = await db.incidents.where('student_id').equals(studentId).toArray();
  return all.filter(i => i.recorded_at >= weekStart && i.recorded_at < weekEnd).sort((a, b) => a.recorded_at - b.recorded_at);
}

export async function deleteIncident(id: string): Promise<void> {
  await db.incidents.delete(id);
}

export async function getIncident(id: string): Promise<Incident | undefined> {
  return db.incidents.get(id);
}

// Weekly Grades
export function getWeekStart(date: Date = new Date(), resetDay: number = 1): number {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const day = d.getDay();
  const diff = (day - resetDay + 7) % 7;
  d.setDate(d.getDate() - diff);
  return d.getTime();
}

export async function getWeeklyGrade(studentId: number, weekStart: number): Promise<WeeklyGrade | undefined> {
  const id = `${studentId}_${weekStart}`;
  return db.weeklyGrades.get(id);
}

export async function upsertWeeklyGrade(g: Omit<WeeklyGrade, 'updated_at'> & Partial<Pick<WeeklyGrade, 'updated_at'>>): Promise<string> {
  const row: WeeklyGrade = { updated_at: now(), ...g };
  await db.weeklyGrades.put(row);
  return row.id;
}

export async function ensureWeeklyGradeForStudent(studentId: number, weekStart: number, initialGrade: number = 20): Promise<WeeklyGrade> {
  const id = `${studentId}_${weekStart}`;
  const existing = await db.weeklyGrades.get(id);
  if (existing) return existing;
  const grade: WeeklyGrade = {
    id,
    student_id: studentId,
    week_start: weekStart,
    initial_grade: initialGrade,
    current_grade: initialGrade,
    updated_at: now(),
  };
  await db.weeklyGrades.put(grade);
  return grade;
}

export async function listWeeklyGradesByStudent(studentId: number): Promise<WeeklyGrade[]> {
  return db.weeklyGrades.where('student_id').equals(studentId).sortBy('week_start');
}

export async function listWeeklyGradesForWeek(weekStart: number): Promise<WeeklyGrade[]> {
  return db.weeklyGrades.where('week_start').equals(weekStart).toArray();
}

// Behavior Settings
export async function getBehaviorSettings(): Promise<BehaviorSettings> {
  const settings = await db.behaviorSettings.get('default');
  if (settings) return settings;
  const defaultSettings: BehaviorSettings = {
    id: 'default',
    initial_grade: 20,
    reset_day: 1, // Monday
    updated_at: now(),
  };
  await db.behaviorSettings.put(defaultSettings);
  return defaultSettings;
}

export async function updateBehaviorSettings(updates: Partial<Omit<BehaviorSettings, 'id' | 'updated_at'>>): Promise<BehaviorSettings> {
  const current = await getBehaviorSettings();
  const updated: BehaviorSettings = { ...current, ...updates, updated_at: now() };
  await db.behaviorSettings.put(updated);
  return updated;
}

// Daily Stars
export function getTodayDateStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export async function getDailyStar(studentId: number, date: string, category: StarCategory): Promise<DailyStar | undefined> {
  const id = `${studentId}_${date}_${category}`;
  return db.dailyStars.get(id);
}

export async function setDailyStar(studentId: number, date: string, category: StarCategory, stars: number): Promise<DailyStar> {
  const id = `${studentId}_${date}_${category}`;
  const record: DailyStar = {
    id,
    student_id: studentId,
    date,
    category,
    stars: Math.max(0, Math.min(3, stars)),
    recorded_at: now(),
    updated_at: now(),
  };
  await db.dailyStars.put(record);
  return record;
}

export async function getDailyStarsForStudent(studentId: number, date: string): Promise<Map<StarCategory, number>> {
  const categories: StarCategory[] = ['participation', 'homework', 'attention'];
  const result = new Map<StarCategory, number>();
  for (const cat of categories) {
    const record = await getDailyStar(studentId, date, cat);
    result.set(cat, record?.stars ?? 0);
  }
  return result;
}

export async function listDailyStarsByStudent(studentId: number): Promise<DailyStar[]> {
  return db.dailyStars.where('student_id').equals(studentId).sortBy('date');
}

export async function listDailyStarsForDate(date: string): Promise<DailyStar[]> {
  return db.dailyStars.where('date').equals(date).toArray();
}

export async function getWeeklyStarSummary(studentId: number, weekStart: number): Promise<{ participation: number; homework: number; attention: number; total: number }> {
  const weekEnd = weekStart + 7 * 24 * 60 * 60 * 1000;
  const all = await db.dailyStars.where('student_id').equals(studentId).toArray();

  let participation = 0;
  let homework = 0;
  let attention = 0;

  for (const star of all) {
    const starDate = new Date(star.date).getTime();
    if (starDate >= weekStart && starDate < weekEnd) {
      if (star.category === 'participation') participation += star.stars;
      else if (star.category === 'homework') homework += star.stars;
      else if (star.category === 'attention') attention += star.stars;
    }
  }

  return { participation, homework, attention, total: participation + homework + attention };
}

// Get all weeks with star data for a student (for semester history)
export type WeeklyStarRecord = {
  weekStart: string; // YYYY-MM-DD of week start
  weekLabel: string; // e.g., "Jan 6 - Jan 12"
  participation: number;
  homework: number;
  attention: number;
  total: number;
  maxPossible: number; // Always 9 for one class session per week
};

export async function getSemesterStarHistory(studentId: number): Promise<WeeklyStarRecord[]> {
  const all = await db.dailyStars.where('student_id').equals(studentId).toArray();
  if (all.length === 0) return [];

  // Group stars by date
  const byDate = new Map<string, { participation: number; homework: number; attention: number }>();
  for (const star of all) {
    if (!byDate.has(star.date)) {
      byDate.set(star.date, { participation: 0, homework: 0, attention: 0 });
    }
    const entry = byDate.get(star.date)!;
    if (star.category === 'participation') entry.participation = star.stars;
    else if (star.category === 'homework') entry.homework = star.stars;
    else if (star.category === 'attention') entry.attention = star.stars;
  }

  // Convert to week records (one entry per date since class is once per week)
  const records: WeeklyStarRecord[] = [];
  const sortedDates = Array.from(byDate.keys()).sort();

  for (const dateStr of sortedDates) {
    const data = byDate.get(dateStr)!;
    const date = new Date(dateStr);
    const endDate = new Date(date);
    endDate.setDate(endDate.getDate() + 6);

    records.push({
      weekStart: dateStr,
      weekLabel: `${date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`,
      participation: data.participation,
      homework: data.homework,
      attention: data.attention,
      total: data.participation + data.homework + data.attention,
      maxPossible: 9,
    });
  }

  return records;
}

// Calculate semester averages
export type SemesterAverage = {
  participation: number;
  homework: number;
  attention: number;
  overall: number; // Percentage 0-100
  totalWeeks: number;
};

export async function getSemesterAverage(studentId: number): Promise<SemesterAverage> {
  const history = await getSemesterStarHistory(studentId);
  const absences = await listAbsencesByStudent(studentId);
  const absentDates = new Set(absences.map(a => a.date));

  // Filter out absent days from history
  const presentHistory = history.filter(h => !absentDates.has(h.weekStart));

  if (presentHistory.length === 0) {
    return { participation: 0, homework: 0, attention: 0, overall: 0, totalWeeks: 0 };
  }

  const totalWeeks = presentHistory.length;
  const sumParticipation = presentHistory.reduce((sum, w) => sum + w.participation, 0);
  const sumHomework = presentHistory.reduce((sum, w) => sum + w.homework, 0);
  const sumAttention = presentHistory.reduce((sum, w) => sum + w.attention, 0);
  const sumTotal = presentHistory.reduce((sum, w) => sum + w.total, 0);
  const maxTotal = totalWeeks * 9;

  return {
    participation: sumParticipation / totalWeeks,
    homework: sumHomework / totalWeeks,
    attention: sumAttention / totalWeeks,
    overall: maxTotal > 0 ? (sumTotal / maxTotal) * 100 : 0,
    totalWeeks,
  };
}

// Absences
export async function markAbsent(studentId: number, date: string): Promise<Absence> {
  const id = `${studentId}_${date}`;
  const record: Absence = {
    id,
    student_id: studentId,
    date,
    recorded_at: now(),
    updated_at: now(),
  };
  await db.absences.put(record);
  return record;
}

export async function removeAbsence(studentId: number, date: string): Promise<void> {
  const id = `${studentId}_${date}`;
  await db.absences.delete(id);
}

export async function isAbsent(studentId: number, date: string): Promise<boolean> {
  const id = `${studentId}_${date}`;
  const record = await db.absences.get(id);
  return !!record;
}

export async function listAbsencesByStudent(studentId: number): Promise<Absence[]> {
  return db.absences.where('student_id').equals(studentId).sortBy('date');
}

export async function listAbsencesForDate(date: string): Promise<Absence[]> {
  return db.absences.where('date').equals(date).toArray();
}

export async function getAbsenceCount(studentId: number): Promise<number> {
  return db.absences.where('student_id').equals(studentId).count();
}

// Grade Scale Configuration
export const DEFAULT_GRADE_THRESHOLDS: GradeThreshold[] = [
  { label: 'A', minPercent: 90 },
  { label: 'B', minPercent: 80 },
  { label: 'C', minPercent: 70 },
  { label: 'D', minPercent: 60 },
  { label: 'F', minPercent: 0 },
];

export async function getGradeScale(): Promise<GradeScale> {
  const scale = await db.gradeScale.get('default');
  if (scale) return scale;

  const defaultScale: GradeScale = {
    id: 'default',
    type: 'letter',
    thresholds: DEFAULT_GRADE_THRESHOLDS,
    updated_at: now(),
  };
  await db.gradeScale.put(defaultScale);
  return defaultScale;
}

export async function updateGradeScale(updates: Partial<Omit<GradeScale, 'id' | 'updated_at'>>): Promise<GradeScale> {
  const current = await getGradeScale();
  const updated: GradeScale = { ...current, ...updates, updated_at: now() };
  await db.gradeScale.put(updated);
  return updated;
}

export function convertPercentToGrade(percent: number, thresholds: GradeThreshold[]): string {
  // Sort thresholds by minPercent descending
  const sorted = [...thresholds].sort((a, b) => b.minPercent - a.minPercent);
  for (const t of sorted) {
    if (percent >= t.minPercent) {
      return t.label;
    }
  }
  return sorted[sorted.length - 1]?.label ?? 'F';
}
