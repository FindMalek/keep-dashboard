import { readdir, realpath } from "node:fs/promises";

export const HOST_PROC: string = process.env.HOST_PROC ?? "/host/proc";
export const HOST_SYS: string = process.env.HOST_SYS ?? "/host/sys";
export const HOST_ETC: string = process.env.HOST_ETC ?? "/host/etc";

export async function readText(path: string): Promise<string | null> {
  try {
    return await Bun.file(path).text();
  } catch {
    return null;
  }
}

export async function readNumber(path: string): Promise<number | null> {
  const text = await readText(path);
  if (text === null) return null;
  const value = Number(text.trim());
  return Number.isFinite(value) ? value : null;
}

export async function listDir(path: string): Promise<string[]> {
  try {
    return await readdir(path);
  } catch {
    return [];
  }
}

export async function resolvePath(path: string): Promise<string | null> {
  try {
    return await realpath(path);
  } catch {
    return null;
  }
}
