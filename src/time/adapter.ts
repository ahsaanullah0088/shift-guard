import type { Instant } from '../types'

/**
 * What to do when a local wall-clock time does not map to exactly one instant.
 * Both fields are required: the right answer is a business decision, so there
 * is deliberately no default.
 */
export interface ResolvePolicy {
  /**
   * The local time falls in a spring-forward gap, e.g. 02:30 on 8 March in Los Angeles.
   * - `'nextValid'` shifts forward by the length of the gap (02:30 becomes 03:30)
   * - `'previousValid'` shifts back by the length of the gap (02:30 becomes 01:30)
   * - `'reject'` throws `NONEXISTENT_LOCAL_TIME`
   */
  readonly nonexistent: 'nextValid' | 'previousValid' | 'reject'
  /**
   * The local time occurs twice, e.g. 01:30 on 1 November in Los Angeles.
   * - `'earlier'` picks the first occurrence (the pre-transition offset)
   * - `'later'` picks the second occurrence
   * - `'reject'` throws `AMBIGUOUS_LOCAL_TIME`
   */
  readonly ambiguous: 'earlier' | 'later' | 'reject'
}

/**
 * The only way the engine touches timezone data. Everything inside the engine is
 * epoch milliseconds; strings exist only at the API boundary.
 *
 * The default implementation uses Temporal. Supply your own to avoid the polyfill.
 */
export interface TimeAdapter {
  /** Parses an offset-carrying ISO 8601 string. Throws `INVALID_INSTANT` on anything else. */
  toEpochMs(instant: Instant): number
  isValidTimezone(timezone: string): boolean
  /** The zone's UTC offset at an instant, in minutes. `-480` for Los Angeles in winter. */
  offsetMinutes(epochMs: number, timezone: string): number
  /** The local calendar date (`YYYY-MM-DD`) of an instant in a zone. */
  localDate(epochMs: number, timezone: string): string
  /** The first instant of a local date. Not always 00:00, and days are not always 24h. */
  startOfLocalDay(date: string, timezone: string): number
  /** Adds calendar days, keeping the local wall-clock time. */
  addLocalDays(epochMs: number, days: number, timezone: string): number
  /** Converts a local wall-clock string (no offset) to an instant under an explicit policy. */
  resolveLocal(local: string, timezone: string, policy: ResolvePolicy): Instant
}
