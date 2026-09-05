// AzaleaOS Full - Update types (Amendment 1.1 §B)
// honey: backend is authority for version/channel/progress/verification/install - frontend never compares/verifies/executes

import type { UpdateChannel } from "./settings";

export type { UpdateChannel };

export interface UpdateState {
  currentVersion: string;
  channel: UpdateChannel;
  checking: boolean;
  available: boolean;
  availableVersion?: string;
  downloadProgress: number; // 0-100
  installing: boolean;
  error?: string;
  restartRequired: boolean;
  lastCheckedAt?: number;
  offline?: boolean;
}

export interface UpdateCheckResult {
  available: boolean;
  currentVersion: string;
  availableVersion?: string;
  channel: UpdateChannel;
}

export interface UpdateGetStateResult {
  currentVersion: string;
  channel: UpdateChannel;
  available: boolean;
  availableVersion?: string;
  downloadProgress: number;
  installing: boolean;
  checking: boolean;
  error?: string;
  restartRequired: boolean;
}

// Typed Tauri IPC commands (§B)
export type UpdateIpcCommand =
  | "update.get_current"
  | "update.check"
  | "update.get_state"
  | "update.download"
  | "update.install"
  | "update.cancel";

// Events §B
export type UpdateEventName =
  | "update.check_started"
  | "update.check_completed"
  | "update.available"
  | "update.download_started"
  | "update.download_progress"
  | "update.download_completed"
  | "update.verification_failed"
  | "update.install_started"
  | "update.install_completed"
  | "update.failed";

export type UpdateEvent =
  | { type: "update.check_started" }
  | { type: "update.check_completed"; payload: { available: boolean; availableVersion?: string; currentVersion: string; channel: UpdateChannel } }
  | { type: "update.available"; payload: { availableVersion: string } }
  | { type: "update.download_started" }
  | { type: "update.download_progress"; payload: { progress: number } }
  | { type: "update.download_completed" }
  | { type: "update.verification_failed"; payload: { reason: string } }
  | { type: "update.install_started" }
  | { type: "update.install_completed" }
  | { type: "update.failed"; payload: { error: string } };
