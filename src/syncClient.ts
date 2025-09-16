import { db, type ChangeEntity, type ChangeRow } from './db';
import { getApiBase, getToken } from './api';
import { useSyncStore } from './store/sync';

const LAST_SYNC_KEY = 'semdiff_last_sync';

export async function enqueueChange(entity: ChangeEntity, data: any, updated_at: number) {
  await db.changes.add({ entity, data, updated_at });
}

function getLastSync(): number {
  const v = localStorage.getItem(LAST_SYNC_KEY);
  return v ? Number(v) : 0;
}

function setLastSync(ts: number) {
  localStorage.setItem(LAST_SYNC_KEY, String(ts));
}

export async function syncNow() {
  const sync = useSyncStore.getState();
  sync.startSync();
  try {
    await db.open();
    const changes = await db.changes.toArray();
    const grouped = {
      students: [] as any[],
      scales: [] as any[],
      ratings: [] as any[],
      notes: [] as any[],
    };
    for (const ch of changes) {
      (grouped as any)[ch.entity].push(ch.data);
    }

    const base = getApiBase();
    const token = getToken();
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    // Push changes (ignore errors if no token or offline)
    if (changes.length) {
      const res = await fetch(`${base}/sync`, { method: 'POST', headers, body: JSON.stringify(grouped) });
      if (res.ok) {
        await db.changes.clear();
      }
    }

    // Pull updates since last sync
    const since = getLastSync();
    const res2 = await fetch(`${base}/sync?since=${since}`, { headers });
    if (res2.ok) {
      const payload = await res2.json();
      const now = Date.now();
      await db.transaction('rw', db.students, db.scales, db.ratings, db.notes, async () => {
        // last-write-wins by updated_at for students, scales, notes
        for (const s of payload.students || []) {
          const local = await db.students.get(s.id);
          if (!local || (s.updated_at ?? 0) > (local.updated_at ?? 0)) {
            await db.students.put(s);
          }
        }
        for (const sc of payload.scales || []) {
          const local = await db.scales.get(sc.id);
          if (!local || (sc.updated_at ?? 0) > (local.updated_at ?? 0)) {
            await db.scales.put(sc);
          }
        }
        for (const n of payload.notes || []) {
          const local = await db.notes.get(n.id);
          if (!local || (n.updated_at ?? 0) > (local.updated_at ?? 0)) {
            await db.notes.put(n);
          }
        }
        // Ratings: append/update by id
        for (const r of payload.ratings || []) {
          const local = await db.ratings.get(r.id);
          if (!local || (r.updated_at ?? 0) > (local.updated_at ?? 0)) {
            await db.ratings.put(r);
          }
        }
      });
      setLastSync(now);
    }
  } catch (e) {
    // ignore; stay offline
  } finally {
    sync.endSync();
  }
}

// Auto-sync on online
if (typeof window !== 'undefined') {
  window.addEventListener('online', () => { syncNow().catch(()=>{}); });
}

