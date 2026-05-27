import { customType } from "drizzle-orm/pg-core";

export const bytea = customType<{ data: Buffer; driverData: string }>({
  dataType() {
    return "bytea";
  },
  toDriver(value: Buffer): string {
    return `\\x${value.toString("hex")}`;
  },
  fromDriver(value: unknown): Buffer {
    if (value instanceof Buffer) return value;
    if (value instanceof Uint8Array) return Buffer.from(value);
    if (typeof value === "string") {
      const hex = value.startsWith("\\x") ? value.slice(2) : value;
      return Buffer.from(hex, "hex");
    }
    throw new Error(`Unexpected bytea value type: ${typeof value}`);
  },
});
