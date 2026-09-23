import type { Instant } from '../types'
import type { ResolvePolicy } from './adapter'
import { temporalAdapter } from './temporal'

/**
 * Converts a local wall-clock time into an instant. The caller must say what
 * happens when the time does not exist (spring forward) or occurs twice (fall back).
 *
 * @example
 * resolveLocal('2026-03-08T02:30', 'America/Los_Angeles', {
 *   nonexistent: 'nextValid',
 *   ambiguous: 'earlier',
 * }) // "2026-03-08T03:30:00-07:00"
 */
export function resolveLocal(local: string, timezone: string, policy: ResolvePolicy): Instant {
  return temporalAdapter.resolveLocal(local, timezone, policy)
}
