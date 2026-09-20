import { create } from "zustand";
import type { BodyId } from "./bodies";

export type SolarState = {
  paused: boolean;
  speed: number;
  selectedId: BodyId | null;
  showLabels: boolean;
  showOrbits: boolean;
  showTrails: boolean;
  showGalacticMotion: boolean;
  galacticSpeed: number;
  hoveredId: BodyId | null;
  togglePaused: () => void;
  setPaused: (paused: boolean) => void;
  setSpeed: (speed: number) => void;
  select: (id: BodyId | null) => void;
  setHovered: (id: BodyId | null) => void;
  setShowLabels: (value: boolean) => void;
  setShowOrbits: (value: boolean) => void;
  setShowTrails: (value: boolean) => void;
  setShowGalacticMotion: (value: boolean) => void;
  setGalacticSpeed: (value: number) => void;
};

export const SPEED_MIN = 0.25;
export const SPEED_MAX = 4000;
export const SPEED_DEFAULT = 48;

export const useSolar = create<SolarState>((set) => ({
  paused: false,
  speed: SPEED_DEFAULT,
  selectedId: null,
  showLabels: true,
  showOrbits: true,
  showTrails: true,
  showGalacticMotion: true,
  galacticSpeed: 1,
  hoveredId: null,
  togglePaused: () => set((s) => ({ paused: !s.paused })),
  setPaused: (paused) => set({ paused }),
  setSpeed: (speed) => set({ speed: Math.min(SPEED_MAX, Math.max(SPEED_MIN, speed)) }),
  select: (id) => set({ selectedId: id }),
  setHovered: (id) => set({ hoveredId: id }),
  setShowLabels: (showLabels) => set({ showLabels }),
  setShowOrbits: (showOrbits) => set({ showOrbits }),
  setShowTrails: (showTrails) => set({ showTrails }),
  setShowGalacticMotion: (showGalacticMotion) => set({ showGalacticMotion }),
  setGalacticSpeed: (galacticSpeed) => set({ galacticSpeed: Math.min(3, Math.max(0.1, galacticSpeed)) }),
}));
