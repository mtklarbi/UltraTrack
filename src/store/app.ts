import { create } from 'zustand';
import type { Student, Scale, Rating, Note, CheckDef } from '../db';
import {
  listStudents as repoListStudents,
  upsertScale as repoUpsertScale,
  listScales as repoListScales,
  deleteScale as repoDeleteScale,
  updateScalesOrder as repoUpdateScalesOrder,
  listRatingsByStudent as repoListRatingsByStudent,
  upsertRating as repoUpsertRating,
  getScale as repoGetScale,
  listNotesByStudent as repoListNotesByStudent,
  upsertNote as repoUpsertNote,
} from '../repository';
import { useSyncStore } from './sync';

export type FilterMode = 'prefix' | 'fuzzy';

export function clamp(value: number, min = -3, max = 3) {
  return Math.max(min, Math.min(max, value));
}

export function computePercent(value: number, min: number, max: number): number {
  if (max === min) return 0;
  const clamped = clamp(value, min, max);
  const pct = ((clamped - min) / (max - min)) * 100;
  return Math.max(0, Math.min(100, pct));
}

function isPrefix(query: string, target: string) {
  return target.startsWith(query);
}

function isFuzzy(query: string, target: string) {
  // simple subsequence match
  let qi = 0;
  const q = query.toLowerCase();
  const t = target.toLowerCase();
  for (let i = 0; i < t.length && qi < q.length; i++) {
    if (t[i] === q[qi]) qi++;
  }
  return qi === q.length;
}

type RatingsByStudent = Record<number, Rating[]>;

export type AppState = {
  // students
  students: Student[];
  studentFilterQuery: string;
  studentFilterMode: FilterMode;
  setStudentFilter: (query: string, mode?: FilterMode) => void;
  loadStudents: () => Promise<void>;
  getFilteredStudents: () => Student[];

  // active student
  activeStudentId: number | null;
  setActiveStudent: (id: number | null) => void;

  // scales
  scales: Scale[];
  loadScales: () => Promise<void>;
  upsertScale: (s: Omit<Scale, 'updated_at'> & Partial<Pick<Scale, 'updated_at'>>) => Promise<void>;
  deleteScale: (id: string) => Promise<void>;
  reorderScales: (ids: string[]) => Promise<void>;

  // ratings
  ratingsByStudent: RatingsByStudent;
  loadRatingsForStudent: (studentId: number) => Promise<void>;
  getRatingValue: (studentId: number, scaleId: string) => number | undefined;
  setRating: (studentId: number, scaleId: string, value: number) => Promise<number>; // returns clamped value
  upsertRating: (studentId: number, scaleId: string, delta: number) => Promise<number>; // returns clamped value
  computePercent: (value: number, min: number, max: number) => number;

  // recent students
  recentStudentIds: number[];
  addRecentStudent: (id: number) => void;
  getRecentStudents: () => Student[];

  // notes
  notesByStudent: Record<number, Note[]>;
  loadNotesForStudent: (studentId: number) => Promise<void>;
  addNote: (input: { student_id: number; text: string; tags?: string[] }) => Promise<void>;

  // checks
  checks: CheckDef[];
  loadChecks: () => Promise<void>;
  checkMarksByStudent: Record<number, Record<string, boolean>>; // studentId -> { checkId: value }
  loadCheckMarksForStudent: (studentId: number) => Promise<void>;
  setCheckMark: (studentId: number, checkId: string, value: boolean) => Promise<void>;

  // student admin
  addStudent: (input: { class_name: string; number: number; first_name: string; last_name: string; gender?: string }) => Promise<number>;
  updateStudent: (input: { id: number; first_name?: string; last_name?: string; class_name?: string; number?: number; gender?: string }) => Promise<void>;
  updateStudentIdAndInfo: (input: { id: number; new_id?: number; class_name?: string; number?: number; first_name?: string; last_name?: string; gender?: string }) => Promise<number>;
  deleteStudent: (id: number) => Promise<void>;
  deleteClass: (class_name: string) => Promise<void>;
};

export const useAppStore = create<AppState>((set, get) => ({
  // students
  students: [],
  studentFilterQuery: '',
  studentFilterMode: 'prefix',
  setStudentFilter: (query, mode) => set((s) => ({
    studentFilterQuery: query,
    studentFilterMode: mode ?? s.studentFilterMode,
  })),
  loadStudents: async () => {
    const students = await repoListStudents();
    set({ students });
  },
  getFilteredStudents: () => {
    const { students, studentFilterMode, studentFilterQuery } = get();
    const q = studentFilterQuery.trim().toLowerCase();
    if (!q) return students;
    return students.filter((s) => {
      const hay = `${s.last_name} ${s.first_name} ${s.class_name} ${s.number}`.toLowerCase();
      return studentFilterMode === 'prefix' ? isPrefix(q, hay) : isFuzzy(q, hay);
    });
  },

  // active student
  activeStudentId: null,
  setActiveStudent: (id) => set({ activeStudentId: id }),

  // scales
  scales: [],
  loadScales: async () => {
    const scales = await repoListScales();
    set({ scales });
  },
  upsertScale: async (s) => {
    await repoUpsertScale(s);
    const scales = await repoListScales();
    set({ scales });
    const sc = scales.find(x=>x.id===s.id);
    if (sc) {
      const { enqueueChange } = await import('../syncClient');
      await enqueueChange('scales', sc, sc.updated_at);
    }
  },
  deleteScale: async (id) => {
    await repoDeleteScale(id);
    const scales = await repoListScales();
    set({ scales });
  },
  reorderScales: async (ids) => {
    await repoUpdateScalesOrder(ids);
    const scales = await repoListScales();
    set({ scales });
    const { enqueueChange } = await import('../syncClient');
    for (const sc of scales) {
      await enqueueChange('scales', sc, sc.updated_at);
    }
  },

  // ratings
  ratingsByStudent: {},
  loadRatingsForStudent: async (studentId) => {
    const ratings = await repoListRatingsByStudent(studentId);
    set((s) => ({ ratingsByStudent: { ...s.ratingsByStudent, [studentId]: ratings } }));
  },
  getRatingValue: (studentId, scaleId) => {
    const list = get().ratingsByStudent[studentId];
    if (!list) return undefined;
    let latest: Rating | undefined;
    for (const r of list) {
      if (r.scale_id !== scaleId) continue;
      if (!latest || r.recorded_at > latest.recorded_at) latest = r;
    }
    return latest?.value;
  },
  setRating: async (studentId, scaleId, value) => {
    const sync = useSyncStore.getState();
    sync.startSync();
    const scale = await repoGetScale(scaleId);
    const min = scale?.min ?? -3;
    const max = scale?.max ?? 3;
    const clamped = clamp(value, min, max);
    const list = get().ratingsByStudent[studentId] || [];
    const id = (globalThis.crypto?.randomUUID ? globalThis.crypto.randomUUID() : Math.random().toString(36).slice(2));
    const ts = Date.now();
    await repoUpsertRating({ id, student_id: studentId, scale_id: scaleId, value: clamped, recorded_at: ts });
    const updated: Rating = { id, student_id: studentId, scale_id: scaleId, value: clamped, recorded_at: ts, updated_at: ts };
    const newList = [...list, updated].sort((a, b) => a.recorded_at - b.recorded_at);
    set((s) => ({ ratingsByStudent: { ...s.ratingsByStudent, [studentId]: newList } }));
    const { enqueueChange } = await import('../syncClient');
    await enqueueChange('ratings', updated, updated.updated_at);
    sync.endSync();
    return clamped;
  },
  upsertRating: async (studentId, scaleId, delta) => {
    const value = get().getRatingValue(studentId, scaleId) ?? 0;
    return get().setRating(studentId, scaleId, value + delta);
  },
  computePercent: (value, min, max) => computePercent(value, min, max),

  // recent students
  recentStudentIds: [],
  addRecentStudent: (id) => set((s) => {
    const list = [id, ...s.recentStudentIds.filter((x) => x !== id)].slice(0, 8);
    return { recentStudentIds: list };
  }),
  getRecentStudents: () => {
    const { recentStudentIds, students } = get();
    const byId = new Map(students.map((s) => [s.id!, s] as const));
    return recentStudentIds.map((id) => byId.get(id)).filter(Boolean) as Student[];
  },

  // notes
  notesByStudent: {},
  loadNotesForStudent: async (studentId) => {
    const notes = await repoListNotesByStudent(studentId);
    set((s) => ({ notesByStudent: { ...s.notesByStudent, [studentId]: notes } }));
  },
  addNote: async ({ student_id, text, tags }) => {
    const sync = useSyncStore.getState();
    sync.startSync();
    const id = (globalThis.crypto?.randomUUID ? globalThis.crypto.randomUUID() : Math.random().toString(36).slice(2));
    const ts = Date.now();
    await repoUpsertNote({ id, student_id, text, tags, recorded_at: ts });
    const note: Note = { id, student_id, text, tags, recorded_at: ts, updated_at: ts };
    const list = get().notesByStudent[student_id] || [];
    const newList = [note, ...list].sort((a, b) => b.recorded_at - a.recorded_at);
    set((s) => ({ notesByStudent: { ...s.notesByStudent, [student_id]: newList } }));
    const { enqueueChange } = await import('../syncClient');
    await enqueueChange('notes', note, note.updated_at);
    sync.endSync();
  },

  // checks
  checks: [],
  loadChecks: async () => {
    const { listChecks } = await import('../repository');
    const checks = await listChecks();
    set({ checks });
  },
  checkMarksByStudent: {},
  loadCheckMarksForStudent: async (studentId) => {
    const { getCheckMarksForStudent } = await import('../repository');
    const marks = await getCheckMarksForStudent(studentId);
    set((s) => ({ checkMarksByStudent: { ...s.checkMarksByStudent, [studentId]: marks } }));
  },
  setCheckMark: async (studentId, checkId, value) => {
    const { setCheckMark } = await import('../repository');
    await setCheckMark(studentId, checkId, value);
    set((s) => ({ checkMarksByStudent: { ...s.checkMarksByStudent, [studentId]: { ...(s.checkMarksByStudent[studentId]||{}), [checkId]: value } } }));
  },

  // student admin
  addStudent: async (input) => {
    const { addStudent } = await import('../repository');
    const id = await addStudent({ ...input });
    await get().loadStudents();
    return id;
  },
  updateStudent: async (input) => {
    const { getStudent, upsertStudent } = await import('../repository');
    const existing = await getStudent(input.id);
    if (!existing) return;
    const updated = { ...existing, ...input, updated_at: Date.now() } as Student;
    await upsertStudent(updated);
    await get().loadStudents();
  },
  updateStudentIdAndInfo: async (input) => {
    const { updateStudentCascade } = await import('../repository');
    const newId = await updateStudentCascade(input);
    await get().loadStudents();
    return newId;
  },
  deleteStudent: async (id) => {
    const { deleteStudent } = await import('../repository');
    await deleteStudent(id);
    set((s) => {
      const r = { ...s.ratingsByStudent }; delete r[id];
      const n = { ...s.notesByStudent }; delete n[id];
      return { ratingsByStudent: r, notesByStudent: n } as any;
    });
    await get().loadStudents();
  },
  deleteClass: async (class_name) => {
    const { deleteClassCascade } = await import('../repository');
    await deleteClassCascade(class_name);
    set({ ratingsByStudent: {}, notesByStudent: {} });
    await get().loadStudents();
  },
}));
