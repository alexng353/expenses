import { describe, test, expect, beforeEach, afterAll } from "bun:test";
import { existsSync, rmSync } from "fs";
import { DiskStorageBackend } from "../src/storage/disk";

const TEST_DIR = "/tmp/expense-tracker-test-uploads";
const backend = new DiskStorageBackend(
  TEST_DIR,
  "http://localhost:8888",
  "test-secret"
);

beforeEach(() => {
  if (existsSync(TEST_DIR)) rmSync(TEST_DIR, { recursive: true });
});

afterAll(() => {
  if (existsSync(TEST_DIR)) rmSync(TEST_DIR, { recursive: true });
});

describe("DiskStorageBackend", () => {
  test("put and get a file", async () => {
    const data = Buffer.from("hello world");
    await backend.put("test/file.txt", data, "text/plain");

    const result = await backend.get("test/file.txt");
    expect(result).not.toBeNull();
    expect(result!.data.toString()).toBe("hello world");
  });

  test("get returns null for missing file", async () => {
    const result = await backend.get("nonexistent.txt");
    expect(result).toBeNull();
  });

  test("exists returns true for existing file", async () => {
    await backend.put("exists.txt", Buffer.from("x"), "text/plain");
    expect(await backend.exists("exists.txt")).toBe(true);
  });

  test("exists returns false for missing file", async () => {
    expect(await backend.exists("nope.txt")).toBe(false);
  });

  test("delete removes a file", async () => {
    await backend.put("del.txt", Buffer.from("x"), "text/plain");
    await backend.delete("del.txt");
    expect(await backend.exists("del.txt")).toBe(false);
  });

  test("delete does not throw for missing file", async () => {
    await backend.delete("nope.txt"); // should not throw
  });

  test("getSignedUrl returns a URL with token and expiry", async () => {
    const url = await backend.getSignedUrl("test/file.pdf", 3600);
    expect(url).toContain("http://localhost:8888/api/storage/");
    expect(url).toContain("token=");
    expect(url).toContain("expires=");
  });

  test("verifyToken validates a signed URL token", async () => {
    const url = await backend.getSignedUrl("test/file.pdf", 3600);
    const parsed = new URL(url);
    const token = parsed.searchParams.get("token")!;
    const expires = parsed.searchParams.get("expires")!;

    expect(backend.verifyToken("test/file.pdf", token, expires)).toBe(true);
    expect(backend.verifyToken("wrong/key.pdf", token, expires)).toBe(false);
  });

  test("verifyToken rejects expired token", async () => {
    const url = await backend.getSignedUrl("test/file.pdf", -1);
    const parsed = new URL(url);
    const token = parsed.searchParams.get("token")!;
    const expires = parsed.searchParams.get("expires")!;

    expect(backend.verifyToken("test/file.pdf", token, expires)).toBe(false);
  });

  test("creates nested directories on put", async () => {
    await backend.put("deep/nested/dir/file.txt", Buffer.from("deep"), "text/plain");
    expect(await backend.exists("deep/nested/dir/file.txt")).toBe(true);
  });
});
