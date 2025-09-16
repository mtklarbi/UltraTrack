import { db, type Student, type Scale, type Rating, type Note, type SeatingPlan } from './db';

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
