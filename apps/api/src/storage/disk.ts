import { createHmac } from "crypto";
import { mkdir, readFile, unlink, writeFile, stat } from "fs/promises";
import { dirname, join } from "path";
import type { StorageBackend } from "./interface";

export class DiskStorageBackend implements StorageBackend {
  constructor(
    private basePath: string,
    private baseUrl: string,
    private secret: string
  ) {}

  private filePath(key: string): string {
    return join(this.basePath, key);
  }

  async put(key: string, data: Buffer, _contentType: string): Promise<void> {
    const path = this.filePath(key);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, data);
  }

  async get(
    key: string
  ): Promise<{ data: Buffer; contentType: string } | null> {
    try {
      const data = await readFile(this.filePath(key));
      const ext = key.split(".").pop() ?? "";
      const contentType = MIME_MAP[ext] ?? "application/octet-stream";
      return { data: Buffer.from(data), contentType };
    } catch {
      return null;
    }
  }

  async getSignedUrl(key: string, expiresInSeconds: number): Promise<string> {
    const expires = Math.floor(Date.now() / 1000) + expiresInSeconds;
    const token = createHmac("sha256", this.secret)
      .update(`${key}:${expires}`)
      .digest("hex");
    return `${this.baseUrl}/api/storage/${encodeURIComponent(key)}?token=${token}&expires=${expires}`;
  }

  async delete(key: string): Promise<void> {
    try {
      await unlink(this.filePath(key));
    } catch {
      // File already gone
    }
  }

  async exists(key: string): Promise<boolean> {
    try {
      await stat(this.filePath(key));
      return true;
    } catch {
      return false;
    }
  }

  verifyToken(key: string, token: string, expires: string): boolean {
    const now = Math.floor(Date.now() / 1000);
    if (now > Number(expires)) return false;
    const expected = createHmac("sha256", this.secret)
      .update(`${key}:${expires}`)
      .digest("hex");
    return token === expected;
  }
}

const MIME_MAP: Record<string, string> = {
  pdf: "application/pdf",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
};
