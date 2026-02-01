import Dexie, { Table } from 'dexie';

// Types
export type Student = {
  id?: number; // auto-incremented
  class_name: string;
  number: number;
  first_name: string;
  last_name: string;
  gender?: string;
  updated_at: number;
};

export type Scale = {
  id: string; // e.g. 'behaviour', 'participation'
  left_label: string;
  right_label: string;
  min?: number; // default -3
  max?: number; // default 3
  sort_index?: number; // ordering
  updated_at: number;
};

export type Rating = {
  id: string; // unique id (e.g., uuid)
  student_id: number;
  scale_id: string;
  value: number;
  recorded_at: number;
  updated_at: number;
};

export type Note = {
  id: string; // unique id
  student_id: number;
  text: string;
  tags?: string[];
  recorded_at: number;
  updated_at: number;
};

// Seating plan per class
export type SeatingPlan = {
  class_name: string; // primary key
  // 6x8 grid flattened to 48 cells; each cell is a student_id or null
  seats: Array<number | null>;
  updated_at: number;
};

// Incident types (predefined behavior issues)
export type IncidentType = {
  id: string; // e.g., 'talking', 'late'
  label: string; // Display name
  points: number; // Points to deduct (positive number, will be subtracted)
  sort_index?: number;
  updated_at: number;
};

// Incidents (recorded behavior events)
export type Incident = {
  id: string;
  student_id: number;
  incident_type_id: string;
  points: number; // Actual points deducted (can be customized per incident)
  note?: string; // Optional custom note
  recorded_at: number;
  updated_at: number;
};

// Weekly behavior grades
export type WeeklyGrade = {
  id: string; // `${student_id}_${week_start}`
  student_id: number;
  week_start: number; // Monday timestamp
  initial_grade: number; // Starting grade (default 20)
  current_grade: number; // Current grade after deductions
  updated_at: number;
};

// Settings for behavior grade system
export type BehaviorSettings = {
  id: string; // 'default'
  initial_grade: number; // Default starting grade (20)
  reset_day: number; // 0 = Sunday, 1 = Monday, etc.
  updated_at: number;
};

// Star categories for simple tracking
export type StarCategory = 'participation' | 'homework' | 'attention';

// Daily star record for a student
export type DailyStar = {
  id: string; // `${student_id}_${date_str}_${category}`
  student_id: number;
  date: string; // YYYY-MM-DD format
  category: StarCategory;
  stars: number; // 0-3 stars
  recorded_at: number;
  updated_at: number;
};

// Absence record for a student on a specific date
export type Absence = {
  id: string; // `${student_id}_${date}`
  student_id: number;
  date: string; // YYYY-MM-DD format
  recorded_at: number;
  updated_at: number;
};

// Grade scale configuration
export type GradeScaleType = 'percentage' | 'letter' | 'numeric';

export type GradeScale = {
  id: string; // 'default'
  type: GradeScaleType;
  // For letter grades: thresholds for each letter (e.g., A=90, B=80, etc.)
  // For numeric grades: min and max values
  thresholds: GradeThreshold[];
  updated_at: number;
};

export type GradeThreshold = {
  label: string; // e.g., 'A', 'B', '18', '15'
  minPercent: number; // Minimum percentage for this grade (0-100)
};

export class SemDiffDB extends Dexie {
  students!: Table<Student, number>;
  scales!: Table<Scale, string>;
  ratings!: Table<Rating, string>;
  notes!: Table<Note, string>;
  changes!: Table<ChangeRow, number>;
  seating!: Table<SeatingPlan, string>;
  incidentTypes!: Table<IncidentType, string>;
  incidents!: Table<Incident, string>;
  weeklyGrades!: Table<WeeklyGrade, string>;
  behaviorSettings!: Table<BehaviorSettings, string>;
  dailyStars!: Table<DailyStar, string>;
  absences!: Table<Absence, string>;
  gradeScale!: Table<GradeScale, string>;

  constructor() {
    super('semdiff');
    this.version(1).stores({
      students: '++id, class_name, number, first_name, last_name, gender, updated_at',
      scales: 'id, updated_at',
      ratings: 'id, student_id, scale_id, recorded_at, updated_at',
      notes: 'id, student_id, recorded_at, updated_at',
    });
    this.version(2)
      .stores({
        students: '++id, class_name, number, first_name, last_name, gender, updated_at',
        scales: 'id, sort_index, updated_at',
        ratings: 'id, student_id, scale_id, recorded_at, updated_at',
        notes: 'id, student_id, recorded_at, updated_at',
      })
      .upgrade(async (tx) => {
        const t = tx.table('scales');
        const arr: any[] = await t.toArray();
        let i = 0;
        // Assign sort_index in a deterministic way (by id)
        for (const s of arr.sort((a, b) => String(a.id).localeCompare(String(b.id)))) {
          if (s.sort_index == null) {
            s.sort_index = i++;
            await t.put(s);
          }
        }
      });
    this.version(3).stores({
      students: '++id, class_name, number, first_name, last_name, gender, updated_at',
      scales: 'id, sort_index, updated_at',
      ratings: 'id, student_id, scale_id, recorded_at, updated_at',
      notes: 'id, student_id, recorded_at, updated_at',
    });
    this.version(4).stores({
      students: '++id, class_name, number, first_name, last_name, gender, updated_at',
      scales: 'id, sort_index, updated_at',
      ratings: 'id, student_id, scale_id, recorded_at, updated_at',
      notes: 'id, student_id, recorded_at, updated_at',
      changes: '++id, entity, updated_at'
    });
    this.version(5).stores({
      students: '++id, class_name, number, first_name, last_name, gender, updated_at',
      scales: 'id, sort_index, updated_at',
      ratings: 'id, student_id, scale_id, recorded_at, updated_at',
      notes: 'id, student_id, recorded_at, updated_at',
      changes: '++id, entity, updated_at',
      seating: 'class_name, updated_at',
    });
    this.version(6).stores({
      students: '++id, class_name, number, first_name, last_name, gender, updated_at',
      scales: 'id, sort_index, updated_at',
      ratings: 'id, student_id, scale_id, recorded_at, updated_at',
      notes: 'id, student_id, recorded_at, updated_at',
      changes: '++id, entity, updated_at',
      seating: 'class_name, updated_at',
      incidentTypes: 'id, sort_index, updated_at',
      incidents: 'id, student_id, incident_type_id, recorded_at, updated_at',
      weeklyGrades: 'id, student_id, week_start, updated_at',
      behaviorSettings: 'id',
    });
    this.version(7).stores({
      students: '++id, class_name, number, first_name, last_name, gender, updated_at',
      scales: 'id, sort_index, updated_at',
      ratings: 'id, student_id, scale_id, recorded_at, updated_at',
      notes: 'id, student_id, recorded_at, updated_at',
      changes: '++id, entity, updated_at',
      seating: 'class_name, updated_at',
      incidentTypes: 'id, sort_index, updated_at',
      incidents: 'id, student_id, incident_type_id, recorded_at, updated_at',
      weeklyGrades: 'id, student_id, week_start, updated_at',
      behaviorSettings: 'id',
      dailyStars: 'id, student_id, date, category, updated_at',
    });
    this.version(8).stores({
      students: '++id, class_name, number, first_name, last_name, gender, updated_at',
      scales: 'id, sort_index, updated_at',
      ratings: 'id, student_id, scale_id, recorded_at, updated_at',
      notes: 'id, student_id, recorded_at, updated_at',
      changes: '++id, entity, updated_at',
      seating: 'class_name, updated_at',
      incidentTypes: 'id, sort_index, updated_at',
      incidents: 'id, student_id, incident_type_id, recorded_at, updated_at',
      weeklyGrades: 'id, student_id, week_start, updated_at',
      behaviorSettings: 'id',
      dailyStars: 'id, student_id, date, category, updated_at',
      absences: 'id, student_id, date, updated_at',
      gradeScale: 'id',
    });
  }
}

export const db = new SemDiffDB();

export type ChangeEntity = 'students' | 'scales' | 'ratings' | 'notes';
export type ChangeRow = {
  id?: number;
  entity: ChangeEntity;
  data: any;
  updated_at: number;
};
