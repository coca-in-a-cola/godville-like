import { restoreSession, type SessionState } from '@godville/sim';
import { saveEnvelopeSchema, type PlayerProfile, type SaveEnvelope } from './sessionSchema.ts';
export interface StoragePort { getItem(key: string): string | null; setItem(key: string, value: string): void; removeItem(key: string): void }
export const SAVE_KEY = 'godville.session.v1';
export const DEFAULT_PROFILE: PlayerProfile = {
  heroName: 'Alec the Bold',
  godName: 'The Almighty',
  portraitId: 'portrait_1',
  calmMusic: true,
};
export type LoadResult = { kind: 'empty' } | { kind: 'saved'; envelope: SaveEnvelope } | { kind: 'error'; error: string; raw: string | null };
/** Fail closed for this instance after corruption, quota errors or conflicting writes. No delete/reset API. */
export function createPersistence(storage: StoragePort, key = SAVE_KEY) {
  let blocked = false;
  let expected: string | null = null;
  let lastWritten: string | null = null;
  function load(): LoadResult {
    try {
      const raw = storage.getItem(key); expected = raw;
      if (raw === null) return { kind: 'empty' };
      try {
        const parsed: unknown = JSON.parse(raw);
        const envelope = saveEnvelopeSchema.parse(parsed);
        lastWritten = raw;
        const profile = envelope.version === 2 ? envelope.profile : DEFAULT_PROFILE;
        return {
          kind: 'saved',
          envelope: {
            version: 2,
            savedAtMs: envelope.savedAtMs,
            session: restoreSession(envelope.session),
            profile,
            ...(envelope.pending ? { pending: envelope.pending } : {}),
          },
        };
      } catch (error) {
        blocked = true;
        // The original key is deliberately untouched, even if backup fails.
        try { storage.setItem(`${key}.corrupt`, raw); } catch { /* original remains the recovery source */ }
        return { kind: 'error', error: `Invalid save; original preserved: ${String(error)}`, raw };
      }
    } catch (error) { blocked = true; return { kind: 'error', error: `Storage unavailable: ${String(error)}`, raw: null }; }
  }
  function save(
    session: SessionState,
    savedAtMs: number,
    profileOrPending?: PlayerProfile | SaveEnvelope['pending'],
    pending: SaveEnvelope['pending'] = [],
  ): boolean {
    if (blocked) throw new Error('Persistence blocked; original save preserved');
    try {
      let profile = DEFAULT_PROFILE;
      let pend = pending;
      if (Array.isArray(profileOrPending)) {
        pend = profileOrPending;
      } else if (profileOrPending) {
        profile = profileOrPending;
      }
      const envelope = saveEnvelopeSchema.parse({
        version: 2,
        savedAtMs,
        session,
        profile,
        ...(pend.length ? { pending: pend } : {}),
      });
      const bytes = JSON.stringify(envelope);
      if (storage.getItem(key) !== expected) throw new Error('Save changed in another tab');
      if (bytes === lastWritten) return false;
      storage.setItem(key, bytes);
      if (storage.getItem(key) !== bytes) throw new Error('Save verification failed');
      lastWritten = bytes; expected = bytes;
      return true;
    } catch (error) { blocked = true; throw error; }
  }
  return { load, save, get blocked() { return blocked; } };
}
