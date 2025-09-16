import { create } from 'zustand';

type SyncState = {
  online: boolean;
  syncingCount: number;
  startSync: () => void;
  endSync: () => void;
  setOnline: (v: boolean) => void;
};

export const useSyncStore = create<SyncState>((set, get) => ({
  online: typeof navigator !== 'undefined' ? navigator.onLine : true,
  syncingCount: 0,
  startSync: () => set((s) => ({ syncingCount: s.syncingCount + 1 })),
  endSync: () => set((s) => ({ syncingCount: Math.max(0, s.syncingCount - 1) })),
  setOnline: (v) => set({ online: v }),
}));

export function syncStatusLabel(): 'Offline' | 'Syncing…' | 'All saved' {
  const s = useSyncStore.getState();
  if (!s.online) return 'Offline';
  return s.syncingCount > 0 ? 'Syncing…' : 'All saved';
}

