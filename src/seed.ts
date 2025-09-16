import { db } from './db';
import { upsertScale, upsertStudent } from './repository';

const FIRST_NAMES = [
  'Emma','Léa','Lucas','Noah','Chloé','Louis','Mia','Hugo','Lina','Arthur',
  'Jules','Léo','Zoé','Eva','Paul','Sarah','Enzo','Liam','Nina','Tom',
];

const LAST_NAMES = [
  'Martin','Bernard','Dubois','Thomas','Robert','Richard','Petit','Durand','Leroy','Moreau',
  'Simon','Laurent','Lefebvre','Michel','Garcia','David','Bertrand','Roux','Vincent','Fournier',
];

function pick<T>(arr: T[]) { return arr[Math.floor(Math.random() * arr.length)]; }

export async function ensureSeedData() {
  await db.open();

  const studentCount = await db.students.count();
  if (studentCount === 0) {
    const classes = ['3APIC', '2APIC'];
    const toCreate = 50;
    const batch: Promise<unknown>[] = [];
    for (let i = 0; i < toCreate; i++) {
      const class_name = i < toCreate / 2 ? classes[0] : classes[1];
      const number = (i % (toCreate / 2)) + 1; // 1..25 within class
      const first = pick(FIRST_NAMES);
      const last = pick(LAST_NAMES);
      const gender = Math.random() > 0.5 ? 'F' : 'M';
      batch.push(
        upsertStudent({
          class_name,
          number,
          first_name: first,
          last_name: last,
          gender,
        })
      );
    }
    await Promise.all(batch);
  }

  // Seed default French scales
  const scales = [
    { id: 'interesse', left_label: 'Intéressé', right_label: 'Pas intéressé' },
    { id: 'motivant', left_label: 'Motivant', right_label: 'Démotivant' },
    { id: 'stimulant', left_label: 'Stimulant', right_label: 'Ennuyeux' },
    { id: 'actif', left_label: 'Actif', right_label: 'Paresseux' },
    { id: 'perseverance', left_label: 'Persévérance', right_label: 'Abandon' },
    { id: 'soigneux', left_label: 'Soigneux', right_label: 'Négligent' },
    { id: 'autonome', left_label: 'Autonome', right_label: 'Dépendant' },
    { id: 'respectueux', left_label: 'Respectueux', right_label: 'Irrespectueux' },
  ];
  for (const s of scales) {
    const existing = await db.scales.get(s.id);
    if (!existing) {
      await upsertScale(s);
    }
  }
}

export async function resetAndSeed() {
  await db.open();
  await db.transaction('rw', db.students, db.scales, db.ratings, db.notes, async () => {
    await db.ratings.clear();
    await db.notes.clear();
    await db.scales.clear();
    await db.students.clear();
  });
  await ensureSeedData();
}
