import { SignJWT, jwtVerify } from "jose";
import bcrypt from "bcryptjs";

const SECRET = new TextEncoder().encode(
  process.env.SESSION_SECRET || "cryptotrack-default-session-secret-change-me-1a2b3c",
);
export const COOKIE = "ctb_session";

export async function signSession(uid: string): Promise<string> {
  return new SignJWT({ uid }).setProtectedHeader({ alg: "HS256" }).setIssuedAt().setExpirationTime("7d").sign(SECRET);
}
export async function verifySession(token: string): Promise<string | null> {
  try {
    const { payload } = await jwtVerify(token, SECRET);
    return String(payload.uid);
  } catch {
    return null;
  }
}
export const hashPassword = (pw: string) => bcrypt.hashSync(pw, 10);
export const checkPassword = (pw: string, hash: string) => {
  try { return bcrypt.compareSync(pw, hash); } catch { return false; }
};
