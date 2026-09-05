import type { FsEntry } from "../types/filesystem";
import { invokeTauri } from "./tauri";

function mapFsEntry(raw: unknown): FsEntry {
  const r = raw as Record<string, unknown>;
  const sizeKb = (r["sizeKb"] as number | undefined) ?? (typeof r["sizeBytes"] === "number" ? Math.ceil((r["sizeBytes"] as number) / 1024) : undefined);
  const modifiedAt = (r["modifiedAt"] as number | undefined) ?? (r["modified_at"] as number | undefined);
  return {
    name: String(r["name"] ?? ""),
    path: String(r["path"] ?? ""),
    kind: (String(r["kind"] ?? "file").toLowerCase() as FsEntry["kind"]),
    sizeKb,
    modifiedAt: typeof modifiedAt === "number" ? modifiedAt : undefined,
    icon: r["icon"] as string | undefined,
  };
}

async function tryInvoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T | null> {
  try {
    return await invokeTauri<T>(cmd, args);
  } catch {
    return null;
  }
}

export async function filesystemList(path: string): Promise<FsEntry[]> {
  let real = await tryInvoke<unknown[]>("filesystem_list", { path });
  if (real === null) real = await tryInvoke<unknown[]>("filesystem.list", { path });
  if (real !== null) return real.map(mapFsEntry);
  return [];
}

export async function filesystemOpen(path: string): Promise<void> {
  let real = await tryInvoke<void>("filesystem_open", { path });
  if (real === null) real = await tryInvoke<void>("filesystem.open", { path });
  if (real !== null) return;
  throw new Error(`Filesystem open unavailable (requires Tauri): ${path}`);
}

export async function filesystemCreateFolder(path: string, name: string): Promise<FsEntry> {
  let real = await tryInvoke<unknown>("filesystem_create_folder", { path, name });
  if (real === null) real = await tryInvoke<unknown>("filesystem.create_folder", { path, name });
  if (real === null) real = await tryInvoke<unknown>("filesystem_create_folder", { parent: path, name } as unknown as Record<string, unknown>);
  if (real !== null) return mapFsEntry(real);
  throw new Error(`Create folder unavailable (requires Tauri): ${path}`);
}

export async function filesystemDelete(path: string): Promise<void> {
  let real = await tryInvoke<void>("filesystem_delete", { path });
  if (real === null) real = await tryInvoke<void>("filesystem.delete", { path });
  if (real !== null) return;
  throw new Error(`Delete unavailable (requires Tauri): ${path}`);
}

export async function filesystemRename(path: string, newName: string): Promise<FsEntry> {
  let real = await tryInvoke<unknown>("filesystem_rename", { path, newName });
  if (real === null) real = await tryInvoke<unknown>("filesystem.rename", { path, newName });
  if (real !== null) return mapFsEntry(real);
  throw new Error(`Rename unavailable (requires Tauri): ${path}`);
}

export async function filesystemMove(src: string, dest: string): Promise<void> {
  let real = await tryInvoke<void>("filesystem_move", { src, dest });
  if (real === null) real = await tryInvoke<void>("filesystem.move", { src, dest });
  if (real !== null) return;
  throw new Error(`Move unavailable (requires Tauri)`);
}

export async function filesystemCopy(src: string, dest: string): Promise<void> {
  let real = await tryInvoke<void>("filesystem_copy", { src, dest });
  if (real === null) real = await tryInvoke<void>("filesystem.copy", { src, dest });
  if (real !== null) return;
  throw new Error(`Copy unavailable (requires Tauri)`);
}
