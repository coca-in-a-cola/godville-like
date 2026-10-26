import { z } from 'zod';
import type { StoragePort } from './persistence.ts';
export interface OwnershipPort { acquire(): Promise<boolean>; owns(): boolean; release(): void }
/** Structural browser seam; importing this adapter does not require DOM globals. */
export interface WebLocksPort {
  request(name: string, options: { ifAvailable: true; mode: 'exclusive' }, callback: (lock: object | null) => Promise<void>): Promise<void>;
}
/** Prefer an atomic browser lock; secondary tabs never wait in a hidden simulation queue. */
export function webLockOwnership(locks: WebLocksPort, name = 'godville.session'): OwnershipPort {
  let held = false;
  let release: (() => void) | undefined;
  let closed = false;
  return {
    acquire: () => new Promise<boolean>((resolve, reject) => {
      void locks.request(name, { ifAvailable: true, mode: 'exclusive' }, async lock => {
        if (!lock || closed) { resolve(false); return; }
        held = true;
        await new Promise<void>(done => { release = done; resolve(true); });
        held = false;
      }).catch(reject);
    }),
    owns: () => held && !closed,
    release: () => { closed = true; held = false; release?.(); },
  };
}
const leaseSchema = z.strictObject({ owner: z.string(), until: z.number().int().nonnegative().safe() });
/** Best-effort fallback: bounded lease, settlement, compare-before-every-operation, no blind renew. */
export function leaseOwnership(storage: StoragePort, owner: string, now: () => number, settle: () => Promise<void>, key = 'godville.session.lease'): OwnershipPort {
  let held = false;
  let closed = false;
  let lastNow = 0;
  const ttl = 5000;
  function read() {
    const raw = storage.getItem(key);
    if (raw === null) return null;
    return leaseSchema.parse(JSON.parse(raw));
  }
  function check(): boolean {
    if (!held || closed) return false;
    try {
      const time = now(); const lease = read();
      if (time < lastNow || !lease || lease.owner !== owner || lease.until <= time) { held = false; return false; }
      lastNow = time;
      storage.setItem(key, JSON.stringify({ owner, until: time + ttl }));
      const confirmed = read(); held = confirmed?.owner === owner;
      return held;
    } catch { held = false; return false; }
  }
  return {
    async acquire() {
      if (closed) return false;
      try {
        const time = now(); const lease = read();
        if (lease && lease.until > time) return false;
        storage.setItem(key, JSON.stringify({ owner, until: time + ttl }));
        await settle();
        if (closed) return false;
        const confirmed = read(); held = confirmed?.owner === owner && confirmed.until > now(); lastNow = now();
        return held;
      } catch { return false; }
    },
    owns: check,
    release() {
      closed = true;
      try { if (held && read()?.owner === owner) storage.removeItem(key); } finally { held = false; }
    },
  };
}
