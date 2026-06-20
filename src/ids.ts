import { randomBytes } from "node:crypto";

const ALPHABET = "0123456789abcdefghijklmnopqrstuvwxyz";

/** Compact collision-safe id (18 chars). Adequate for a single-node ledger. */
export function newId(): string {
  const b = randomBytes(12);
  let out = "";
  for (let i = 0; i < b.length; i++) {
    out += ALPHABET[b[i] % 36];
    out += ALPHABET[(b[i] >> 2) % 36];
  }
  return out.slice(0, 18);
}
