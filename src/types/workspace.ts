// AzaleaOS Full - OS Tab types & limits
// honey: limit enforced frontend + backend is authority; backend/native capability is final gate, frontend only mirrors UX.

export interface OsTab {
  id: string;
  name: string;
  createdAt: number;
  order: number;
}

// Canonical Full limits - single source of truth for frontend.
// Backend capability contract remains authority at runtime.
export const MAX_OS_TABS = 10 as const;
export const MAX_APPS_PER_OS_TAB = 10 as const;
