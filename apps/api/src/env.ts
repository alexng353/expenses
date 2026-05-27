import { z } from "zod";

const envSchema = z.object({
  PORT: z.coerce.number().default(8888),
  DATABASE_URL: z.string(),
  CORS_ORIGIN: z.string().default("http://localhost:5173"),
  STORAGE_BACKEND: z.enum(["disk", "s3"]).default("disk"),
  STORAGE_DISK_PATH: z.string().default("./uploads"),
  S3_BUCKET: z.string().optional(),
  S3_REGION: z.string().optional(),
  S3_ENDPOINT: z.string().optional(),
  S3_ACCESS_KEY_ID: z.string().optional(),
  S3_SECRET_ACCESS_KEY: z.string().optional(),
  SIGNED_URL_SECRET: z.string().default("dev-secret-change-in-prod"),
});

export const env = envSchema.parse(process.env);
export type Env = z.infer<typeof envSchema>;
