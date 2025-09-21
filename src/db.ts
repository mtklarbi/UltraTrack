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
  // When true or undefined, higher numeric values are considered better.
  // When false, lower numeric values are considered better.
  higher_is_better?: boolean;
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

// Boolean checks (e.g., Homework done?)
export type CheckDef = {
  id: string; // e.g., 'homework'
  label: string; // e.g., 'Homework'
  sort_index?: number;
  updated_at: number;
};

export type CheckMark = {
  id: string; // `${student_id}:${check_id}`
  student_id: number;
  check_id: string;
  value: boolean;
  updated_at: number;
};

// Seating plan per class
export type SeatingPlan = {
  class_name: string; // primary key
  // 6x8 grid flattened to 48 cells; each cell is a student_id or null
  seats: Array<number | null>;
  updated_at: number;
};

export class SemDiffDB extends Dexie {
  students!: Table<Student, number>;
  scales!: Table<Scale, string>;
  ratings!: Table<Rating, string>;
  notes!: Table<Note, string>;
  changes!: Table<ChangeRow, number>;
  seating!: Table<SeatingPlan, string>;
  checks!: Table<CheckDef, string>;
  check_marks!: Table<CheckMark, string>;

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
      checks: 'id, sort_index, updated_at',
      check_marks: 'id, student_id, check_id, updated_at',
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
