import { db, type Student } from './db';
import { encodeCSV, parseCSV } from './utils/csv';

export async function exportStudentsCSV(): Promise<string> {
  const students = await db.students.toArray();
  const header = ['class_name', 'year', 'number', 'first_name', 'last_name'];
  const rows = [header, ...students.map((s) => [s.class_name, '', s.number, s.first_name, s.last_name])];
  return encodeCSV(rows);
}

export async function exportRatingsCSV(): Promise<string> {
  const [students, scales, ratings] = await Promise.all([
    db.students.toArray(),
    db.scales.toArray(),
    db.ratings.toArray(),
  ]);
  const latest = new Map<string, { value: number; recorded_at: number }>();
  for (const r of ratings) {
    const key = `${r.student_id}|${r.scale_id}`;
    const prev = latest.get(key);
    if (!prev || r.recorded_at > prev.recorded_at) latest.set(key, { value: r.value, recorded_at: r.recorded_at });
  }
  const byId = new Map(students.map((s) => [s.id!, s] as const));
  const header = ['student_number', 'class_name', 'scale_id', 'value', 'recorded_at'];
  const rows = [header];
  for (const s of students) {
    for (const sc of scales) {
      const key = `${s.id}|${sc.id}`;
      const rec = latest.get(key);
      if (rec) {
        rows.push([s.number, s.class_name, sc.id, rec.value, rec.recorded_at]);
      }
    }
  }
  return encodeCSV(rows);
}

export type ImportStudentsOptions = {
  duplicateStrategy: 'merge' | 'skip';
};

export async function importStudentsCSV(text: string, opts: ImportStudentsOptions): Promise<{ inserted: number; merged: number; skipped: number }> {
  const rows = parseCSV(text);
  if (rows.length === 0) return { inserted: 0, merged: 0, skipped: 0 };
  const header = rows[0].map((h) => h.trim());
  const idx = (name: string) => header.findIndex((h) => h === name);
  const iClass = idx('class_name');
  const iNumber = idx('number');
  const iFirst = idx('first_name');
  const iLast = idx('last_name');
  if (iClass === -1 || iNumber === -1 || iFirst === -1 || iLast === -1) throw new Error('Invalid students.csv header');

  let inserted = 0, merged = 0, skipped = 0;
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    const class_name = row[iClass];
    const number = Number(row[iNumber]);
    const first_name = row[iFirst];
    const last_name = row[iLast];
    const existing = (await db.students.where('class_name').equals(class_name).toArray()).find((s) => s.number === number);
    if (existing) {
      if (opts.duplicateStrategy === 'merge') {
        existing.first_name = first_name;
        existing.last_name = last_name;
        existing.updated_at = Date.now();
        await db.students.put(existing);
        merged++;
      } else {
        skipped++;
      }
    } else {
      await db.students.add({ class_name, number, first_name, last_name, updated_at: Date.now() });
      inserted++;
    }
  }
  return { inserted, merged, skipped };
}

export type ImportRatingsOptions = {
  defaultClassName?: string; // used if CSV has no class_name column
};

export async function importRatingsCSV(text: string, opts: ImportRatingsOptions): Promise<{ inserted: number; skipped: number }> {
  const rows = parseCSV(text);
  if (rows.length === 0) return { inserted: 0, skipped: 0 };
  const header = rows[0].map((h) => h.trim());
  const idx = (name: string) => header.findIndex((h) => h === name);
  const iStudentNumber = idx('student_number');
  const iScale = idx('scale_id');
  const iValue = idx('value');
  const iRecorded = idx('recorded_at');
  const iClass = idx('class_name');
  if (iStudentNumber === -1 || iScale === -1 || iValue === -1 || iRecorded === -1) throw new Error('Invalid ratings.csv header');

  const scales = await db.scales.toArray();
  const scaleIds = new Set(scales.map((s) => s.id));
  const students = await db.students.toArray();

  let inserted = 0, skipped = 0;
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    const number = Number(row[iStudentNumber]);
    const scale_id = row[iScale];
    const value = Number(row[iValue]);
    const recorded_at = Number(row[iRecorded]);
    const class_name = iClass !== -1 ? row[iClass] : (opts.defaultClassName ?? '');
    if (!scaleIds.has(scale_id)) { skipped++; continue; }
    const student: Student | undefined = students.find((s) => s.number === number && (!class_name || s.class_name === class_name));
    if (!student) { skipped++; continue; }
    const id = (globalThis.crypto?.randomUUID ? globalThis.crypto.randomUUID() : Math.random().toString(36).slice(2));
    await db.ratings.put({ id, student_id: student.id!, scale_id, value, recorded_at, updated_at: recorded_at });
    inserted++;
  }
  return { inserted, skipped };
}

