// Step 11 perf pass - throttled IPC surface per spec §10.2/§19: no per-render invoke, 500-1000ms visual streams only.
// Per-command IPC via invokeTauri - not polled in render, only on user action or throttled subscription.
// Do NOT add generic execute_anything/run_shell_command - narrow auditable contract only.

// Re-export Tauri invoke when running inside Tauri webview, safe no-op otherwise.
export async function invokeTauri<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  // Lazy import to avoid bundling issues in pure web dev
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    return await invoke<T>(command, args);
  } catch {
    return Promise.reject(new Error(`Tauri IPC unavailable (command: ${command}). Run via 'npm run tauri:dev'.`));
  }
}
