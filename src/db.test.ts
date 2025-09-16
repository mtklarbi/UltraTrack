import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { db } from './db';
import {
  upsertStudent,
  getStudent,
  listStudents,
  deleteStudent,
  upsertScale,
  getScale,
  listScales,
  upsertRating,
  listRatingsByStudent,
  getRating,
  deleteRating,
  upsertNote,
  listNotesByStudent,
  getNote,
  deleteNote,
} from './repository';

const rid = () => Math.random().toString(36).slice(2);

describe('SemDiff Dexie v4 DB', () => {
  beforeAll(async () => {
    await db.open();
  });

  beforeEach(async () => {
    await db.transaction('rw', db.students, db.scales, db.ratings, db.notes, async () => {
      await Promise.all([
        db.students.clear(),
        db.scales.clear(),
        db.ratings.clear(),
        db.notes.clear(),
      ]);
    });
  });

  it('opens the database', async () => {
    expect(db.name).toBe('semdiff');
    // Opening happened in beforeAll; ensure tables exist
    const tables = db.tables.map(t => t.name).sort();
    expect(tables).toEqual(['notes', 'ratings', 'scales', 'students']);
  });

  it('CRUD students', async () => {
    const id = await upsertStudent({
      class_name: '1A',
      number: 17,
      first_name: 'Jane',
      last_name: 'Doe',
      gender: 'F',
    });
    expect(typeof id).toBe('number');

    const s = await getStudent(id!);
    expect(s?.first_name).toBe('Jane');

    const all = await listStudents();
    expect(all.length).toBe(1);

    await deleteStudent(id!);
    const s2 = await getStudent(id!);
    expect(s2).toBeUndefined();
  });

  it('CRUD scales + ratings', async () => {
    // student
    const sid = await upsertStudent({ class_name: '1A', number: 5, first_name: 'John', last_name: 'Smith' });
    // scale
    await upsertScale({ id: 'participation', left_label: 'Low', right_label: 'High' });
    const sc = await getScale('participation');
    expect(sc?.min).toBe(-3);
    expect(sc?.max).toBe(3);

    // rating
    const rid1 = rid();
    const now = Date.now();
    await upsertRating({ id: rid1, student_id: sid!, scale_id: 'participation', value: 2, recorded_at: now });

    let ratings = await listRatingsByStudent(sid!);
    expect(ratings.length).toBe(1);
    expect(ratings[0].value).toBe(2);

    // update rating
    await upsertRating({ id: rid1, student_id: sid!, scale_id: 'participation', value: -1, recorded_at: now });
    const r = await getRating(rid1);
    expect(r?.value).toBe(-1);

    // add another
    const rid2 = rid();
    await upsertRating({ id: rid2, student_id: sid!, scale_id: 'participation', value: 3, recorded_at: now + 100 });
    ratings = await listRatingsByStudent(sid!);
    expect(ratings.map(x => x.id).sort()).toEqual([rid1, rid2].sort());

    // delete
    await deleteRating(rid1);
    const r2 = await getRating(rid1);
    expect(r2).toBeUndefined();
  });

  it('CRUD notes', async () => {
    const sid = await upsertStudent({ class_name: '2B', number: 3, first_name: 'Ava', last_name: 'Lee' });
    const n1 = rid();
    const n2 = rid();
    const t0 = Date.now();

    await upsertNote({ id: n1, student_id: sid!, text: 'Doing great', recorded_at: t0 });
    await upsertNote({ id: n2, student_id: sid!, text: 'Needs help with math', recorded_at: t0 + 50 });

    const notes = await listNotesByStudent(sid!);
    expect(notes.length).toBe(2);
    expect(notes[0].recorded_at).toBeLessThanOrEqual(notes[1].recorded_at);

    const g = await getNote(n1);
    expect(g?.text).toContain('great');

    await deleteNote(n1);
    const g2 = await getNote(n1);
    expect(g2).toBeUndefined();
  });
});

