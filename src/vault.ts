import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

let cached: Buffer | null = null;
function masterKey(): Buffer {
  if (cached) return cached;
  if (process.env.VAULT_KEY) return (cached = Buffer.from(process.env.VAULT_KEY, "hex"));
  const p = join(process.cwd(), "data", ".vault-key");
  if (existsSync(p)) return (cached = Buffer.from(readFileSync(p, "utf8").trim(), "hex"));
  const k = randomBytes(32);
  writeFileSync(p, k.toString("hex"), { mode: 0o600 });
  return (cached = k);
}

export function encryptSecret(plain: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", masterKey(), iv);
  const enc = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return [iv.toString("hex"), c.getAuthTag().toString("hex"), enc.toString("hex")].join(":");
}
export function decryptSecret(blob: string): string {
  try {
    const [iv, tag, enc] = blob.split(":");
    const d = createDecipheriv("aes-256-gcm", masterKey(), Buffer.from(iv, "hex"));
    d.setAuthTag(Buffer.from(tag, "hex"));
    return Buffer.concat([d.update(Buffer.from(enc, "hex")), d.final()]).toString("utf8");
  } catch {
    return "";
  }
}
