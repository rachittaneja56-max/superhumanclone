import { create } from 'zustand';

interface UIState {
  selectedEmailId: string | null;
  focusLayer: number;
  commandPaletteOpen: boolean;
  setSelectedEmail: (id: string | null) => void;
  openPalette: () => void;
  closePalette: () => void;
  pushFocusLayer: () => void;
  popFocusLayer: () => void;
}

export const useUIStore = create<UIState>((set) => ({
  selectedEmailId: null,
  focusLayer: 0,
  commandPaletteOpen: false,
  setSelectedEmail: (id) => set({ selectedEmailId: id }),
  openPalette: () => set({ commandPaletteOpen: true, focusLayer: 1 }),
  closePalette: () => set((state) => ({ commandPaletteOpen: false, focusLayer: Math.max(0, state.focusLayer - 1) })),
  pushFocusLayer: () => set((state) => ({ focusLayer: state.focusLayer + 1 })),
  popFocusLayer: () => set((state) => ({ focusLayer: Math.max(0, state.focusLayer - 1) })),
}));
