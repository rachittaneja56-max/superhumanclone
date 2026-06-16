import { create } from 'zustand';

interface UIState {
  selectedEmailId: string | null;
  selectedEmailIds: string[];
  focusLayer: number;
  commandPaletteOpen: boolean;
  activeHITLAction: any | null;
  cheatsheetOpen: boolean;
  setSelectedEmail: (id: string | null) => void;
  setSelectedEmailIds: (ids: string[]) => void;
  toggleSelectedEmail: (id: string) => void;
  clearSelectedEmails: () => void;
  openPalette: () => void;
  closePalette: () => void;
  toggleCheatsheet: () => void;
  pushFocusLayer: () => void;
  popFocusLayer: () => void;
  setActiveHITLAction: (action: any | null) => void;
}

export const useUIStore = create<UIState>((set) => ({
  selectedEmailId: null,
  selectedEmailIds: [],
  focusLayer: 0,
  commandPaletteOpen: false,
  activeHITLAction: null,
  cheatsheetOpen: false,
  setSelectedEmail: (id) => set({ selectedEmailId: id }),
  setSelectedEmailIds: (ids) => set({ selectedEmailIds: ids }),
  toggleSelectedEmail: (id) =>
    set((state) => ({
      selectedEmailIds: state.selectedEmailIds.includes(id)
        ? state.selectedEmailIds.filter((item) => item !== id)
        : [...state.selectedEmailIds, id],
    })),
  clearSelectedEmails: () => set({ selectedEmailIds: [] }),
  openPalette: () => set({ commandPaletteOpen: true, focusLayer: 1 }),
  closePalette: () => set((state) => ({ commandPaletteOpen: false, focusLayer: Math.max(0, state.focusLayer - 1) })),
  toggleCheatsheet: () => set((state) => ({ cheatsheetOpen: !state.cheatsheetOpen })),
  pushFocusLayer: () => set((state) => ({ focusLayer: state.focusLayer + 1 })),
  popFocusLayer: () => set((state) => ({ focusLayer: Math.max(0, state.focusLayer - 1) })),
  setActiveHITLAction: (action) => set({ activeHITLAction: action }),
}));
