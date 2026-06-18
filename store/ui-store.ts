import { create } from 'zustand';

interface UIState {
  selectedEmailId: string | null;
  selectedEmailIds: string[];
  focusLayer: number;
  commandPaletteOpen: boolean;
  agentPanelOpen: boolean;
  activeHITLAction: any | null;
  cheatsheetOpen: boolean;
  setSelectedEmail: (id: string | null) => void;
  setSelectedEmailIds: (ids: string[]) => void;
  toggleSelectedEmail: (id: string) => void;
  clearSelectedEmails: () => void;
  openPalette: () => void;
  closePalette: () => void;
  openCheatsheet: () => void;
  closeCheatsheet: () => void;
  toggleCheatsheet: () => void;
  openAgentPanel: () => void;
  closeAgentPanel: () => void;
  toggleAgentPanel: () => void;
  pushFocusLayer: () => void;
  popFocusLayer: () => void;
  setActiveHITLAction: (action: any | null) => void;
}

export const useUIStore = create<UIState>((set) => ({
  selectedEmailId: null,
  selectedEmailIds: [],
  focusLayer: 0,
  commandPaletteOpen: false,
  agentPanelOpen: false,
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
  openPalette: () =>
    set((state) =>
      state.commandPaletteOpen
        ? state
        : { commandPaletteOpen: true, focusLayer: state.focusLayer + 1 }
    ),
  closePalette: () =>
    set((state) =>
      state.commandPaletteOpen
        ? { commandPaletteOpen: false, focusLayer: Math.max(0, state.focusLayer - 1) }
        : state
    ),
  openCheatsheet: () =>
    set((state) =>
      state.cheatsheetOpen
        ? state
        : { cheatsheetOpen: true, focusLayer: state.focusLayer + 1 }
    ),
  closeCheatsheet: () =>
    set((state) =>
      state.cheatsheetOpen
        ? { cheatsheetOpen: false, focusLayer: Math.max(0, state.focusLayer - 1) }
        : state
    ),
  toggleCheatsheet: () =>
    set((state) =>
      state.cheatsheetOpen
        ? { cheatsheetOpen: false, focusLayer: Math.max(0, state.focusLayer - 1) }
        : { cheatsheetOpen: true, focusLayer: state.focusLayer + 1 }
    ),
  openAgentPanel: () => set({ agentPanelOpen: true }),
  closeAgentPanel: () => set({ agentPanelOpen: false }),
  toggleAgentPanel: () => set((state) => ({ agentPanelOpen: !state.agentPanelOpen })),
  pushFocusLayer: () => set((state) => ({ focusLayer: state.focusLayer + 1 })),
  popFocusLayer: () => set((state) => ({ focusLayer: Math.max(0, state.focusLayer - 1) })),
  setActiveHITLAction: (action) => set({ activeHITLAction: action }),
}));
