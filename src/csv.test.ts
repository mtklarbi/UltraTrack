import { describe, it, expect, beforeEach } from 'vitest';
import { db } from './db';
import { exportStudentsCSV, importStudentsCSV, exportRatingsCSV, importRatingsCSV } from './csv';
import { upsertScale } from './repository';

async function resetDB() {
  await db.open();
  await db.transaction('rw', db.students, db.scales, db.ratings, db.notes, async () => {
    await db.ratings.clear();
    await db.notes.clear();
    await db.scales.clear();
    await db.students.clear();
  });
}

describe('CSV export/import', () => {
  beforeEach(async () => {
    await resetDB();
  });

  it('round-trips students and latest ratings', async () => {
    // Seed
    const s1 = await db.students.add({ class_name: 'X', number: 1, first_name: 'Alice', last_name: 'A', updated_at: Date.now() });
    const s2 = await db.students.add({ class_name: 'X', number: 2, first_name: 'Bob', last_name: 'B', updated_at: Date.now() });
    await upsertScale({ id: 'participation', left_label: 'Low', right_label: 'High', min: -3, max: 3 });
    await db.ratings.bulkAdd([
      { id: 'r1', student_id: s1!, scale_id: 'participation', value: 1, recorded_at: 1000, updated_at: 1000 },
      { id: 'r2', student_id: s1!, scale_id: 'participation', value: 2, recorded_at: 2000, updated_at: 2000 },
      { id: 'r3', student_id: s2!, scale_id: 'participation', value: -1, recorded_at: 1500, updated_at: 1500 },
    ]);

    // Export
    const studentsCSV = await exportStudentsCSV();
    const ratingsCSV = await exportRatingsCSV();

    // Wipe and import
    await resetDB();
    await upsertScale({ id: 'participation', left_label: 'Low', right_label: 'High', min: -3, max: 3 });
    const resS = await importStudentsCSV(studentsCSV, { duplicateStrategy: 'merge' });
    expect(resS.inserted).toBe(2);
    const resR = await importRatingsCSV(ratingsCSV, { defaultClassName: 'X' });
    expect(resR.inserted).toBe(2); // latest per student only

    const allStudents = await db.students.toArray();
    expect(allStudents.map(s=>s.first_name).sort()).toEqual(['Alice','Bob']);
    const ratings = await db.ratings.toArray();
    // Should contain latest for s1 (value=2 at 2000) and s2 (-1 at 1500)
    const map = new Map(ratings.map(r=>[`${r.student_id}|${r.scale_id}`, r.value]));
    const s1Id = allStudents.find(s=>s.number===1)!.id!;
    const s2Id = allStudents.find(s=>s.number===2)!.id!;
    expect(map.get(`${s1Id}|participation`)).toBe(2);
    expect(map.get(`${s2Id}|participation`)).toBe(-1);
  });
});

