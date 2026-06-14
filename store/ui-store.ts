import { create } from 'zustand';

/** Shape of an active HITL action card */
export interface HITLActionState {
  actionId: string;
  actionType: string;
  humanReadable: string;
  expiresAt: string;
  payload?: Record<string, unknown>;
}

interface UIState {
  selectedEmailId: string | null;
  focusLayer: number;
  commandPaletteOpen: boolean;
  cheatsheetOpen: boolean;
  activeHITLAction: HITLActionState | null;
  setSelectedEmail: (id: string | null) => void;
  openPalette: () => void;
  closePalette: () => void;
  toggleCheatsheet: () => void;
  pushFocusLayer: () => void;
  popFocusLayer: () => void;
  setActiveHITLAction: (action: HITLActionState | null) => void;
}

export const useUIStore = create<UIState>((set) => ({
  selectedEmailId: null,
  focusLayer: 0,
  commandPaletteOpen: false,
  cheatsheetOpen: false,
  activeHITLAction: null,
  setSelectedEmail: (id) => set({ selectedEmailId: id }),
  openPalette: () => set({ commandPaletteOpen: true, focusLayer: 1 }),
  closePalette: () => set((state) => ({ commandPaletteOpen: false, focusLayer: Math.max(0, state.focusLayer - 1) })),
  toggleCheatsheet: () => set((state) => ({ cheatsheetOpen: !state.cheatsheetOpen })),
  pushFocusLayer: () => set((state) => ({ focusLayer: state.focusLayer + 1 })),
  popFocusLayer: () => set((state) => ({ focusLayer: Math.max(0, state.focusLayer - 1) })),
  setActiveHITLAction: (action) => set({ activeHITLAction: action }),
}));
