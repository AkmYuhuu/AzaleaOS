import { create } from "zustand";
import type {
  AdaptiveSnapshot,
  AppResource,
  ProtectedTask,
  ResourceHistoryPoint,
  ResourceStreamPayload,
  SystemSnapshot,
} from "../types/resources";

type ResourceStore = {
  snapshot: SystemSnapshot | null;
  apps: AppResource[];
  adaptive: AdaptiveSnapshot | null;
  protectedTasks: ProtectedTask[];
  history: ResourceHistoryPoint[];
  isBarOpen: boolean;
  isCenterOpen: boolean;
  setBarOpen: (v: boolean) => void;
  toggleBar: () => void;
  setCenterOpen: (v: boolean) => void;
  toggleCenter: () => void;
  openCenter: () => void;
  closeCenter: () => void;
  updateFromStream: (payload: ResourceStreamPayload) => void;
};

export const useResourceStore = create<ResourceStore>((set, get) => ({
  snapshot: null,
  apps: [],
  adaptive: null,
  protectedTasks: [],
  history: [],
  isBarOpen: false,
  isCenterOpen: false,
  setBarOpen: (v) => set({ isBarOpen: v }),
  toggleBar: () => set({ isBarOpen: !get().isBarOpen }),
  setCenterOpen: (v) => set({ isCenterOpen: v }),
  toggleCenter: () => set({ isCenterOpen: !get().isCenterOpen }),
  openCenter: () => set({ isCenterOpen: true }),
  closeCenter: () => set({ isCenterOpen: false }),
  updateFromStream: (payload) =>
    set({
      snapshot: payload.snapshot,
      apps: payload.apps,
      adaptive: payload.adaptive,
      protectedTasks: payload.protectedTasks,
      history: payload.history,
    }),
}));
