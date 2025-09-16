import { describe, it, expect, beforeEach } from 'vitest';
import { useAppStore, computePercent } from './app';
import { db } from '../db';
import { upsertStudent, upsertScale } from '../repository';

async function resetDB() {
  await db.open();
  await db.transaction('rw', db.students, db.scales, db.ratings, db.notes, async () => {
    await db.ratings.clear();
    await db.notes.clear();
    await db.scales.clear();
    await db.students.clear();
  });
}

describe('Zustand App Store', () => {
  beforeEach(async () => {
    await resetDB();
    // reset store state between tests
    useAppStore.setState({
      students: [],
      studentFilterQuery: '',
      studentFilterMode: 'prefix',
      activeStudentId: null,
      scales: [],
      ratingsByStudent: {},
    } as any);
  });

  it('loads students and filters by prefix and fuzzy', async () => {
    const a = await upsertStudent({ class_name: '3APIC', number: 1, first_name: 'Anna', last_name: 'Alpha' });
    await upsertStudent({ class_name: '3APIC', number: 2, first_name: 'Anabelle', last_name: 'Amber' });
    await upsertStudent({ class_name: '2APIC', number: 9, first_name: 'Bob', last_name: 'Beta' });

    await useAppStore.getState().loadStudents();

    // prefix
    useAppStore.getState().setStudentFilter('an');
    let filtered = useAppStore.getState().getFilteredStudents();
    expect(filtered.length).toBe(2);

    // fuzzy
    useAppStore.getState().setStudentFilter('abl', 'fuzzy');
    filtered = useAppStore.getState().getFilteredStudents();
    // 'Anabelle Amber' matches subsequence 'a' 'b' 'l'
    expect(filtered.length).toBe(1);
    expect(filtered[0].first_name).toBe('Anabelle');
  });

  it('scales CRUD and reload', async () => {
    // create
    await useAppStore.getState().upsertScale({ id: 'test', left_label: 'Low', right_label: 'High', min: -2, max: 2 });
    await useAppStore.getState().loadScales();
    let scales = useAppStore.getState().scales;
    expect(scales.find((s) => s.id === 'test')?.min).toBe(-2);

    // update
    await useAppStore.getState().upsertScale({ id: 'test', left_label: 'Min', right_label: 'Max', min: -5, max: 5 });
    scales = useAppStore.getState().scales;
    expect(scales.find((s) => s.id === 'test')?.max).toBe(5);

    // delete
    await useAppStore.getState().deleteScale('test');
    scales = useAppStore.getState().scales;
    expect(scales.find((s) => s.id === 'test')).toBeUndefined();
  });

  it('ratings set & upsert with clamping', async () => {
    const sid = await upsertStudent({ class_name: '3APIC', number: 6, first_name: 'Cara', last_name: 'Cyan' });
    await upsertScale({ id: 'participation', left_label: 'Low', right_label: 'High', min: -3, max: 3 });

    // load ratings (empty)
    await useAppStore.getState().loadRatingsForStudent(sid!);

    // increase by 2 from 0
    let v = await useAppStore.getState().upsertRating(sid!, 'participation', 2);
    expect(v).toBe(2);

    // clamp at max 3
    v = await useAppStore.getState().upsertRating(sid!, 'participation', 10);
    expect(v).toBe(3);

    // set direct to below min -> clamp to -3
    v = await useAppStore.getState().setRating(sid!, 'participation', -10);
    expect(v).toBe(-3);
  });

  it('computePercent returns 0..100', () => {
    expect(computePercent(0, -3, 3)).toBeCloseTo(50, 5);
    expect(computePercent(-3, -3, 3)).toBeCloseTo(0, 5);
    expect(computePercent(3, -3, 3)).toBeCloseTo(100, 5);
  });
});

