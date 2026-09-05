// AzaleaOS Full - Settings types. Full-only, no Lite surface.
// honey: config is in-memory for MVP; Tauri store is authority later. Limits are readonly info.

export type Theme = "dark" | "light" | "system";
export type SidebarModeDefault = "expanded" | "compact";
export type AnimationLevel = "full" | "reduced" | "none";
export type AdaptiveMode = "Smart" | "Conservative" | "Aggressive";
export type PerAppPolicy = "smart" | "never" | "preferBackground" | "gameProtection";
export type CrashReport = "ask" | "localOnly";
export type UpdateChannel = "stable" | "beta";
export type DiagnosticsLevel = "minimal" | "verbose";
export type UiUpdateFrequency = "normal" | "reduced";
export type OpenBehavior = "inAzalea" | "external";

export type CategoryId =
  | "general"
  | "appearance"
  | "workspace"
  | "applications"
  | "resourceManagement"
  | "sidebar"
  | "shortcuts"
  | "notifications"
  | "files"
  | "performance"
  | "privacy"
  | "dataStorage"
  | "updates"
  | "advanced";

export interface SettingsState {
  general: {
    launchWithWindows: boolean;
    startMinimized: boolean;
    restoreLastWorkspace: boolean;
    restoreAppLayout: boolean;
    confirmClose: boolean;
  };
  appearance: {
    theme: Theme;
    accentColor: string;
    sidebarModeDefault: SidebarModeDefault;
    animationLevel: AnimationLevel;
    transparency: number;
  };
  workspace: {
    maxOsTabsInfo: 10;
    maxAppsPerOsInfo: 10;
  };
  applications: {
    autoDiscover: boolean;
    perAppPolicy: Record<string, PerAppPolicy>;
  };
  resourceManagement: {
    adaptive: boolean;
    mode: AdaptiveMode;
    perApp: Record<string, PerAppPolicy>;
  };
  sidebar: {
    defaultMode: SidebarModeDefault;
    position: "left";
    autoHide: boolean;
    showAppCount: boolean;
    showResourceState: boolean;
  };
  shortcuts: {
    map: Record<string, string>;
  };
  notifications: {
    optimizationNotice: boolean;
    criticalMemory: boolean;
    appDetection: boolean;
    unsupportedGame: boolean;
    update: boolean;
    recovery: boolean;
  };
  files: {
    defaultSaveLocation: string;
    useWindowsPicker: boolean;
    defaultOpenBehavior: OpenBehavior;
    showRecent: boolean;
  };
  performance: {
    animations: boolean;
    uiUpdateFrequency: UiUpdateFrequency;
    hardwareAcceleration: boolean;
    backgroundActivity: boolean;
    startupOptimization: boolean;
  };
  privacy: {
    telemetry: false;
    cloudSync: false;
    networkRequirement: "NONE";
    crashReport: CrashReport;
  };
  dataStorage: {
    configSizeKb: number;
    cacheKb: number;
    logsKb: number;
    workspaceMetaKb: number;
  };
  updates: {
    channel: UpdateChannel;
    autoCheck: boolean;
    currentVersion: string;
  };
  advanced: {
    hardwareAccelerationAdvanced: boolean;
    diagnosticsLevel: DiagnosticsLevel;
  };
}

export const initialSettings: SettingsState = {
  general: {
    launchWithWindows: false,
    startMinimized: false,
    restoreLastWorkspace: true,
    restoreAppLayout: true,
    confirmClose: true,
  },
  appearance: {
    theme: "dark",
    accentColor: "#7c6dff",
    sidebarModeDefault: "expanded",
    animationLevel: "full",
    transparency: 92,
  },
  workspace: {
    maxOsTabsInfo: 10,
    maxAppsPerOsInfo: 10,
  },
  applications: {
    autoDiscover: true,
    perAppPolicy: {
      vscode: "smart",
      chrome: "preferBackground",
      discord: "smart",
      figma: "never",
    },
  },
  resourceManagement: {
    adaptive: true,
    mode: "Smart",
    perApp: {
      vscode: "smart",
      chrome: "preferBackground",
      discord: "smart",
      figma: "gameProtection",
    },
  },
  sidebar: {
    defaultMode: "expanded",
    position: "left",
    autoHide: false,
    showAppCount: true,
    showResourceState: true,
  },
  shortcuts: {
    map: {
      "Resource Bar": "Shift + Esc",
      "App Launcher": "Ctrl + Space",
      "Toggle Sidebar": "Ctrl + Alt + A",
      "Previous OS Tab": "Ctrl + Alt + Left",
      "Next OS Tab": "Ctrl + Alt + Right",
      "New OS Tab": "Ctrl + Alt + N",
      "Close OS Tab": "Ctrl + Alt + W",
      "Next App": "Ctrl + Tab",
      "Previous App": "Ctrl + Shift + Tab",
    },
  },
  notifications: {
    optimizationNotice: true,
    criticalMemory: true,
    appDetection: true,
    unsupportedGame: true,
    update: true,
    recovery: true,
  },
  files: {
    defaultSaveLocation: "%USERPROFILE%\\Documents",
    useWindowsPicker: true,
    defaultOpenBehavior: "inAzalea",
    showRecent: true,
  },
  performance: {
    animations: true,
    uiUpdateFrequency: "normal",
    hardwareAcceleration: true,
    backgroundActivity: true,
    startupOptimization: true,
  },
  privacy: {
    telemetry: false,
    cloudSync: false,
    networkRequirement: "NONE",
    crashReport: "ask",
  },
  dataStorage: {
    configSizeKb: 42,
    cacheKb: 1840,
    logsKb: 312,
    workspaceMetaKb: 18,
  },
  updates: {
    channel: "stable",
    autoCheck: true,
    currentVersion: "0.1.0",
  },
  advanced: {
    hardwareAccelerationAdvanced: true,
    diagnosticsLevel: "minimal",
  },
};

export const CATEGORY_ORDER: CategoryId[] = [
  "general",
  "appearance",
  "workspace",
  "applications",
  "resourceManagement",
  "sidebar",
  "shortcuts",
  "notifications",
  "files",
  "performance",
  "privacy",
  "dataStorage",
  "updates",
  "advanced",
];

export const CATEGORY_LABEL: Record<CategoryId, string> = {
  general: "General",
  appearance: "Appearance",
  workspace: "Workspace",
  applications: "Applications",
  resourceManagement: "Resource Management",
  sidebar: "Sidebar & Navigation",
  shortcuts: "Keyboard Shortcuts",
  notifications: "Notifications",
  files: "Files & Integration",
  performance: "Performance",
  privacy: "Privacy",
  dataStorage: "Data & Storage",
  updates: "Updates",
  advanced: "Advanced",
};
