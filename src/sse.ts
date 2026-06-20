import type { Response } from "express";

// Minimal SSE hub: clients subscribe per org; the worker broadcasts price ticks
// and fired alerts.
const clients = new Map<string, Set<Response>>();

export function addClient(orgId: string, res: Response): () => void {
  if (!clients.has(orgId)) clients.set(orgId, new Set());
  clients.get(orgId)!.add(res);
  return () => clients.get(orgId)?.delete(res);
}

export function broadcast(orgId: string, event: string, data: unknown): void {
  const set = clients.get(orgId);
  if (!set) return;
  const frame = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const res of set) { try { res.write(frame); } catch { /* dropped */ } }
}

export function broadcastAll(event: string, data: unknown): void {
  for (const orgId of clients.keys()) broadcast(orgId, event, data);
}
