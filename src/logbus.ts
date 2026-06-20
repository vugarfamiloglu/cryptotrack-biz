import { broadcastAll } from "./sse.js";

export type LogLevel = "info" | "warn" | "error" | "success";
export interface LogLine { ts: string; level: LogLevel; scope: string; message: string; }

const RING = 400;
const buffer: LogLine[] = [];

/** Append a structured line to the in-app log monitor and stream it live. */
export function log(level: LogLevel, scope: string, message: string): void {
  const line: LogLine = { ts: new Date().toISOString(), level, scope, message };
  buffer.push(line);
  if (buffer.length > RING) buffer.shift();
  broadcastAll("log", line);
}

export const logInfo = (scope: string, m: string) => log("info", scope, m);
export const logWarn = (scope: string, m: string) => log("warn", scope, m);
export const logError = (scope: string, m: string) => log("error", scope, m);
export const logOk = (scope: string, m: string) => log("success", scope, m);

export function recentLogs(limit = 200): LogLine[] {
  return buffer.slice(-limit);
}
