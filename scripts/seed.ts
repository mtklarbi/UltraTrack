// Node-based seeding script
// Setup fake IndexedDB for Dexie in Node
import 'fake-indexeddb/auto';
import { resetAndSeed } from '../src/seed';
import { db } from '../src/db';

async function main() {
  await resetAndSeed();
  const counts = {
    students: await db.students.count(),
    scales: await db.scales.count(),
    ratings: await db.ratings.count(),
    notes: await db.notes.count(),
  };
  // eslint-disable-next-line no-console
  console.log('Seed complete:', counts);
  await db.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

