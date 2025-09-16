import { create } from 'zustand';

type SearchState = {
  query: string;
  setQuery: (q: string) => void;
  clear: () => void;
};

export const useSearchStore = create<SearchState>((set) => ({
  query: '',
  setQuery: (q) => set({ query: q }),
  clear: () => set({ query: '' }),
}));

