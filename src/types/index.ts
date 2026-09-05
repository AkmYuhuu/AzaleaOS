// Step 1 foundation types - minimal, backend is authority for capabilities.
// No `any` usage. No cloud / auth types.

export type Edition = "full";

export interface Capabilities {
  readonly edition: Edition;
  readonly maxOsTabs: 10;
  readonly maxAppsPerOsTab: 10;
  readonly resourceManagement: "full";
  readonly advancedAutomation: true;
  readonly advancedCustomization: "full";
}

import { MAX_APPS_PER_OS_TAB, MAX_OS_TABS } from "./workspace";

export const FULL_CAPABILITIES: Capabilities = {
  edition: "full",
  maxOsTabs: MAX_OS_TABS,
  maxAppsPerOsTab: MAX_APPS_PER_OS_TAB,
  resourceManagement: "full",
  advancedAutomation: true,
  advancedCustomization: "full",
} as const;

// Forward-compatible placeholders - not used in Step 1 runtime
export type OsTabId = string;
export type AppTabId = string;
