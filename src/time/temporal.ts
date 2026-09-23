import { Temporal } from 'temporal-polyfill'
import { ShiftGuardError } from '../errors'
import type { Instant } from '../types'
import type { ResolvePolicy, TimeAdapter } from './adapter'

const NONEXISTENT_POLICIES = new Set(['nextValid', 'previousValid', 'reject'])
const AMBIGUOUS_POLICIES = new Set(['earlier', 'later', 'reject'])

/** A trailing `Z`, a numeric offset, or a bracketed annotation: none belong in a local time. */
const CARRIES_OFFSET = /(?:[zZ]|[+-]\d{2}(?::?\d{2})?|\])$/

/** Creates the default TimeAdapter, backed by Temporal. */
export function createTemporalAdapter(): TimeAdapter {
  const knownZones = new Set<string>()

  function isValidTimezone(timezone: string): boolean {
    if (typeof timezone !== 'string' || timezone === '') return false
    if (knownZones.has(timezone)) return true
    try {
      Temporal.Instant.fromEpochMilliseconds(0).toZonedDateTimeISO(timezone)
    } catch {
      return false
    }
    knownZones.add(timezone)
    return true
  }

  function zoned(epochMs: number, timezone: string): Temporal.ZonedDateTime {
    return Temporal.Instant.fromEpochMilliseconds(epochMs).toZonedDateTimeISO(timezone)
  }

  return {
    isValidTimezone,

    toEpochMs(instant: Instant): number {
      if (typeof instant !== 'string') {
        throw new ShiftGuardError(
          'INVALID_INSTANT',
          `Expected an ISO 8601 string with an offset, received ${typeof instant}.`,
        )
      }
      try {
        return Temporal.Instant.from(instant).epochMilliseconds
      } catch {
        throw new ShiftGuardError(
          'INVALID_INSTANT',
          `"${instant}" is not an instant. Instants must carry a UTC offset or "Z", ` +
            `e.g. "2026-03-08T14:00:00-08:00". To convert a local wall-clock time, use resolveLocal().`,
        )
      }
    },

    localDate(epochMs: number, timezone: string): string {
      return zoned(epochMs, timezone).toPlainDate().toString()
    },

    startOfLocalDay(date: string, timezone: string): number {
      return Temporal.PlainDate.from(date).toZonedDateTime({ timeZone: timezone }).epochMilliseconds
    },

    addLocalDays(epochMs: number, days: number, timezone: string): number {
      return zoned(epochMs, timezone).add({ days }).epochMilliseconds
    },

    resolveLocal(local: string, timezone: string, policy: ResolvePolicy): Instant {
      if (
        policy === null ||
        typeof policy !== 'object' ||
        !NONEXISTENT_POLICIES.has(policy.nonexistent) ||
        !AMBIGUOUS_POLICIES.has(policy.ambiguous)
      ) {
        throw new ShiftGuardError(
          'INVALID_CONFIG',
          'resolveLocal() needs an explicit policy: ' +
            "{ nonexistent: 'nextValid' | 'previousValid' | 'reject', ambiguous: 'earlier' | 'later' | 'reject' }.",
        )
      }
      if (!isValidTimezone(timezone)) {
        throw new ShiftGuardError('INVALID_TIMEZONE', `"${timezone}" is not a recognised timezone.`)
      }

      let wallClock: Temporal.PlainDateTime
      try {
        if (typeof local !== 'string' || CARRIES_OFFSET.test(local)) throw new Error()
        wallClock = Temporal.PlainDateTime.from(local)
      } catch {
        throw new ShiftGuardError(
          'INVALID_LOCAL_TIME',
          `"${String(local)}" is not a local wall-clock time. Expected e.g. "2026-03-08T02:30" with no offset.`,
        )
      }

      // Temporal only exposes disambiguation, so probe both ends. The two candidates
      // agree for a normal time, keep the wall clock but differ in offset for an
      // ambiguous one, and shift the wall clock for one inside a gap.
      const earlier = wallClock.toZonedDateTime(timezone, { disambiguation: 'earlier' })
      const later = wallClock.toZonedDateTime(timezone, { disambiguation: 'later' })

      let chosen: Temporal.ZonedDateTime
      if (earlier.epochNanoseconds === later.epochNanoseconds) {
        chosen = earlier
      } else if (earlier.toPlainDateTime().equals(wallClock)) {
        if (policy.ambiguous === 'reject') {
          throw new ShiftGuardError(
            'AMBIGUOUS_LOCAL_TIME',
            `${local} occurs twice in ${timezone} (at ${earlier.offset} and ${later.offset}).`,
          )
        }
        chosen = policy.ambiguous === 'earlier' ? earlier : later
      } else {
        if (policy.nonexistent === 'reject') {
          throw new ShiftGuardError(
            'NONEXISTENT_LOCAL_TIME',
            `${local} does not exist in ${timezone}: the clocks skip over it.`,
          )
        }
        chosen = policy.nonexistent === 'nextValid' ? later : earlier
      }

      return chosen.toString({ timeZoneName: 'never' })
    },
  }
}

export const temporalAdapter: TimeAdapter = createTemporalAdapter()
