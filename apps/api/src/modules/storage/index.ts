import { Elysia, t } from "elysia";
import { env } from "../../env";
import { DiskStorageBackend } from "../../storage/disk";

export const storageModule = new Elysia({ prefix: "/storage" }).get(
  "/:key",
  async ({ params, query, set }) => {
    if (env.STORAGE_BACKEND !== "disk") {
      set.status = 404;
      return { error: "Direct storage serving not available" };
    }

    const backend = new DiskStorageBackend(
      env.STORAGE_DISK_PATH,
      `http://localhost:${env.PORT}`,
      env.SIGNED_URL_SECRET
    );

    const key = decodeURIComponent(params.key);
    if (!backend.verifyToken(key, query.token, query.expires)) {
      set.status = 403;
      return { error: "Invalid or expired token" };
    }

    const file = await backend.get(key);
    if (!file) {
      set.status = 404;
      return { error: "File not found" };
    }

    return new Response(new Uint8Array(file.data), {
      headers: {
        "Content-Type": file.contentType,
        "Cache-Control": "private, max-age=3600",
      },
    });
  },
  {
    params: t.Object({ key: t.String() }),
    query: t.Object({ token: t.String(), expires: t.String() }),
  }
);
