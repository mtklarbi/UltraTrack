import { db, type Student, type Scale, type Rating, type Note, type SeatingPlan, type CheckDef, type CheckMark } from './db';

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

export async function updateStudentCascade(input: { id: number; new_id?: number; class_name?: string; number?: number; first_name?: string; last_name?: string; gender?: string }): Promise<number> {
  const existing = await db.students.get(input.id);
  if (!existing) throw new Error('Student not found');
  const targetId = input.new_id ?? existing.id!;
  if (targetId !== existing.id) {
    const conflict = await db.students.get(targetId);
    if (conflict) throw new Error('Target student ID already exists');
  }

  const nextStudent: Student = {
    ...existing,
    class_name: input.class_name ?? existing.class_name,
    number: input.number ?? existing.number,
    first_name: input.first_name ?? existing.first_name,
    last_name: input.last_name ?? existing.last_name,
    gender: input.gender ?? existing.gender,
    id: targetId,
    updated_at: now(),
  };

  await db.transaction('rw', db.students, db.ratings, db.notes, db.seating, async () => {
    // If changing id: update references first
    if (targetId !== existing.id) {
      await db.ratings.where('student_id').equals(existing.id!).modify({ student_id: targetId });
      await db.notes.where('student_id').equals(existing.id!).modify({ student_id: targetId });
      // Update seating occurrences
      const plans = await db.seating.toArray();
      for (const plan of plans) {
        let changed = false;
        const seats = plan.seats.slice();
        for (let i = 0; i < seats.length; i++) {
          if (seats[i] === existing.id) { seats[i] = targetId; changed = true; }
        }
        if (changed) { plan.seats = seats; plan.updated_at = now(); await db.seating.put(plan); }
      }
      // Replace student row: add new, delete old
      await db.students.put(nextStudent);
      await db.students.delete(existing.id!);
    } else {
      await db.students.put(nextStudent);
    }

    // Handle class move: remove from old class seating, add to new class seating
    if (existing.class_name !== nextStudent.class_name) {
      const oldPlan = await db.seating.get(existing.class_name);
      if (oldPlan) {
        const seats = oldPlan.seats.slice();
        let changed = false;
        for (let i = 0; i < seats.length; i++) {
          if (seats[i] === targetId) { seats[i] = null; changed = true; }
        }
        if (changed) { oldPlan.seats = seats; oldPlan.updated_at = now(); await db.seating.put(oldPlan); }
      }
      let newPlan = await db.seating.get(nextStudent.class_name);
      if (!newPlan) {
        newPlan = await ensureSeatingForClass(nextStudent.class_name);
      }
      if (newPlan && !newPlan.seats.includes(targetId)) {
        const seats = newPlan.seats.slice();
        const idx = seats.findIndex((s) => s == null);
        if (idx !== -1) seats[idx] = targetId; // place in first empty seat
        newPlan.seats = seats; newPlan.updated_at = now();
        await db.seating.put(newPlan);
      }
    }
  });

  return targetId;
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
  const base: Scale = { min: -3, max: 3, updated_at: now(), higher_is_better: s.higher_is_better ?? true, ...s } as Scale;
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

// Checks (boolean flags per student)
export async function listChecks(): Promise<CheckDef[]> {
  const items = await db.checks.toArray();
  return items.sort((a,b)=> (a.sort_index ?? 0) - (b.sort_index ?? 0) || a.id.localeCompare(b.id));
}

export async function upsertCheck(def: Omit<CheckDef, 'updated_at' | 'sort_index'> & Partial<Pick<CheckDef, 'updated_at' | 'sort_index'>>): Promise<string> {
  const row: CheckDef = { updated_at: now(), sort_index: def.sort_index, ...def } as CheckDef;
  // append to end if new without sort_index
  const existing = await db.checks.get(row.id);
  if (!existing && row.sort_index == null) {
    const last = await db.checks.orderBy('sort_index').last();
    row.sort_index = (last?.sort_index ?? -1) + 1;
  }
  await db.checks.put(row);
  return row.id;
}

export async function deleteCheck(id: string) {
  await db.transaction('rw', db.checks, db.check_marks, async () => {
    await db.checks.delete(id);
    await db.check_marks.where('check_id').equals(id).delete();
  });
}

export async function updateChecksOrder(ids: string[]) {
  await db.transaction('rw', db.checks, async () => {
    let i = 0;
    for (const id of ids) {
      const c = await db.checks.get(id);
      if (c) { c.sort_index = i++; c.updated_at = now(); await db.checks.put(c); }
    }
  });
}

export async function getCheckMarksForStudent(studentId: number): Promise<Record<string, boolean>> {
  const list = await db.check_marks.where('student_id').equals(studentId).toArray();
  const map: Record<string, boolean> = {};
  for (const r of list) map[r.check_id] = r.value;
  return map;
}

export async function setCheckMark(studentId: number, checkId: string, value: boolean): Promise<void> {
  const id = `${studentId}:${checkId}`;
  const row: CheckMark = { id, student_id: studentId, check_id: checkId, value, updated_at: now() };
  await db.check_marks.put(row);
}
