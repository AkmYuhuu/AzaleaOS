// Azalea Files - filesystem types per spec §13, §19
export type FsKind = "file" | "folder" | "drive";

export type FsLocationId =
  | "home"
  | "desktop"
  | "documents"
  | "downloads"
  | "pictures"
  | "videos"
  | "drives"
  | "recent";

export interface FsEntry {
  name: string;
  path: string;
  kind: FsKind;
  sizeKb?: number;
  modifiedAt?: number;
  icon?: string;
}

export interface FsState {
  currentPath: string;
  locationId: FsLocationId;
  entries: FsEntry[];
  selectedPaths: string[];
  history: string[];
  historyIndex: number;
  recent: FsEntry[];
}

// IPC contract (§19) - narrow auditable surface, no generic exec
export type FilesystemIpcContract = {
  "filesystem.list": { args: { path: string }; result: FsEntry[] };
  "filesystem.open": { args: { path: string }; result: void };
  "filesystem.create_folder": { args: { path: string; name: string }; result: FsEntry };
  "filesystem.delete": { args: { path: string }; result: void };
  "filesystem.rename": { args: { path: string; newName: string }; result: FsEntry };
  "filesystem.move": { args: { src: string; dest: string }; result: void };
  "filesystem.copy": { args: { src: string; dest: string }; result: void };
};

export const FS_LOCATION_LABEL: Record<FsLocationId, string> = {
  home: "Home",
  desktop: "Desktop",
  documents: "Documents",
  downloads: "Downloads",
  pictures: "Pictures",
  videos: "Videos",
  drives: "Drives",
  recent: "Recent",
};
