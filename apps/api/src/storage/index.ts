import type { Env } from "../env";
import { DiskStorageBackend } from "./disk";
import { S3StorageBackend } from "./s3";
import type { StorageBackend } from "./interface";

export type { StorageBackend } from "./interface";

export function createStorageBackend(env: Env): StorageBackend {
  if (env.STORAGE_BACKEND === "s3") {
    if (!env.S3_BUCKET || !env.S3_ACCESS_KEY_ID || !env.S3_SECRET_ACCESS_KEY) {
      throw new Error(
        "S3 storage requires S3_BUCKET, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY"
      );
    }
    return new S3StorageBackend(env.S3_BUCKET, {
      region: env.S3_REGION ?? "us-east-1",
      endpoint: env.S3_ENDPOINT,
      accessKeyId: env.S3_ACCESS_KEY_ID,
      secretAccessKey: env.S3_SECRET_ACCESS_KEY,
    });
  }

  return new DiskStorageBackend(
    env.STORAGE_DISK_PATH,
    `http://localhost:${env.PORT}`,
    env.SIGNED_URL_SECRET
  );
}
