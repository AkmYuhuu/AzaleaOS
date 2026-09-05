// honey: backend authority for PID/handle. Frontend only mirrors AppIntegrationState/AppRuntime; do not trust frontend for real windowId/processId.

export type IntegrationKind = "managed" | "embedded" | "external" | "unsupported";

export interface AppIntegrationState {
  kind: IntegrationKind;
  canEmbed: boolean;
  reason?: string;
}

// honey: exact backend field names are windowId/processId; pid/wid aliases kept for stub compat.
export interface AppRuntimeStub {
  windowId?: string;
  processId?: number;
  executablePath?: string;
  // compat aliases - map to same values
  pid?: number;
  wid?: string;
}

export interface AppRuntime {
  windowId: string;
  processId: number;
  executablePath?: string;
}
