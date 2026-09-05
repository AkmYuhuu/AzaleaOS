// §18 / STEP 10 - backend is authority for lifecycle. Frontend only mirrors.
export type LifecycleState =
  | "ACTIVE"
  | "BACKGROUND"
  | "OPTIMIZING"
  | "PROTECTED"
  | "GAME"
  | "ERROR"
  | "UNAVAILABLE";

export type LifecycleEvent = {
  appTabId: string;
  osTabId: string;
  state: LifecycleState;
  at: number;
  reason?: string;
  detail?: string;
};

import type { AppTabState } from "./appTab";

// Calm language per §12
export const LIFECYCLE_DESCRIPTIONS: Record<LifecycleState, { label: string; detail: string }> = {
  ACTIVE: { label: "Active", detail: "Foreground application" },
  BACKGROUND: { label: "Background", detail: "Background resource reduction" },
  OPTIMIZING: { label: "Optimizing", detail: "Adaptive optimization - background resource reduction" },
  PROTECTED: { label: "Protected", detail: "Protected task - will not be optimized" },
  GAME: { label: "Game", detail: "Game application - excluded from normal management" },
  ERROR: { label: "Error", detail: "Backend reported an issue" },
  UNAVAILABLE: { label: "Unavailable", detail: "Not available for management" },
};

export function mapLifecycleToAppTabState(s: LifecycleState): AppTabState {
  switch (s) {
    case "ACTIVE": return "active";
    case "BACKGROUND": return "background";
    case "OPTIMIZING": return "optimizing";
    case "PROTECTED": return "protected";
    case "GAME": return "game";
    case "ERROR": return "error";
    case "UNAVAILABLE": return "unavailable";
  }
}

export function mapAppTabStateToLifecycle(s: AppTabState): LifecycleState {
  switch (s) {
    case "active": return "ACTIVE";
    case "background": return "BACKGROUND";
    case "optimizing": return "OPTIMIZING";
    case "protected": return "PROTECTED";
    case "game": return "GAME";
    case "error": return "ERROR";
    case "unavailable": return "UNAVAILABLE";
  }
}
