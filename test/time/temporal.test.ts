import { describe, expect, it } from 'vitest'
import { hoursBetween, resolveLocal, ShiftGuardError, type ResolvePolicy } from '../../src'
import { temporalAdapter as time } from '../../src/time/temporal'

const LA = 'America/Los_Angeles'
const forward: ResolvePolicy = { nonexistent: 'nextValid', ambiguous: 'earlier' }
const strict: ResolvePolicy = { nonexistent: 'reject', ambiguous: 'reject' }

function codeOf(fn: () => unknown): string | undefined {
  try {
    fn()
  } catch (error) {
    if (error instanceof ShiftGuardError) return error.code
    throw error
  }
  return undefined
}

describe('toEpochMs', () => {
  it('accepts instants with an offset or Z', () => {
    expect(time.toEpochMs('2026-03-08T14:00:00-08:00')).toBe(Date.UTC(2026, 2, 8, 22))
    expect(time.toEpochMs('2026-03-08T14:00:00Z')).toBe(Date.UTC(2026, 2, 8, 14))
  })

  it('rejects naive local strings at the boundary', () => {
    expect(codeOf(() => time.toEpochMs('2026-03-08T02:30:00'))).toBe('INVALID_INSTANT')
    expect(codeOf(() => time.toEpochMs('2026-03-08'))).toBe('INVALID_INSTANT')
    expect(codeOf(() => time.toEpochMs('not a date'))).toBe('INVALID_INSTANT')
    expect(codeOf(() => time.toEpochMs(1234 as unknown as string))).toBe('INVALID_INSTANT')
  })
})

describe('hoursBetween (absolute timeline)', () => {
  it('the short night: 22:00 to 06:00 across spring forward is 7 hours', () => {
    expect(hoursBetween('2026-03-07T22:00:00-08:00', '2026-03-08T06:00:00-07:00')).toBe(7)
  })

  it('the long night: 22:00 to 06:00 across fall back is 9 hours', () => {
    expect(hoursBetween('2026-10-31T22:00:00-07:00', '2026-11-01T06:00:00-08:00')).toBe(9)
  })

  it('22:00 to 04:00 across spring forward leaves 5 hours, not 6', () => {
    expect(hoursBetween('2026-03-07T22:00:00-08:00', '2026-03-08T04:00:00-07:00')).toBe(5)
  })
})

describe('local calendar', () => {
  it('localDate follows the zone, not UTC', () => {
    expect(time.localDate(Date.UTC(2026, 2, 8, 6), LA)).toBe('2026-03-07')
    expect(time.localDate(Date.UTC(2026, 2, 8, 6), 'UTC')).toBe('2026-03-08')
  })

  it('the spring-forward day is 23 hours long and the fall-back day 25', () => {
    const dayLength = (date: string, next: string) =>
      (time.startOfLocalDay(next, LA) - time.startOfLocalDay(date, LA)) / 3_600_000
    expect(dayLength('2026-03-08', '2026-03-09')).toBe(23)
    expect(dayLength('2026-11-01', '2026-11-02')).toBe(25)
    expect(dayLength('2026-06-01', '2026-06-02')).toBe(24)
  })

  it('addLocalDays keeps the wall-clock time across a transition', () => {
    const start = time.toEpochMs('2026-03-07T22:00:00-08:00')
    const next = time.addLocalDays(start, 1, LA)
    expect(next).toBe(time.toEpochMs('2026-03-08T22:00:00-07:00'))
    expect((next - start) / 3_600_000).toBe(23)
  })

  it('offsetMinutes reports half-hour, quarter-hour and DST offsets', () => {
    expect(time.offsetMinutes(Date.UTC(2026, 0, 15), LA)).toBe(-480)
    expect(time.offsetMinutes(Date.UTC(2026, 6, 15), LA)).toBe(-420)
    expect(time.offsetMinutes(Date.UTC(2026, 0, 15), 'Asia/Kolkata')).toBe(330)
    expect(time.offsetMinutes(Date.UTC(2026, 6, 15), 'Pacific/Chatham')).toBe(765)
    expect(time.offsetMinutes(Date.UTC(2026, 0, 15), 'Pacific/Chatham')).toBe(825)
  })

  it('recognises IANA zones and rejects nonsense', () => {
    expect(time.isValidTimezone(LA)).toBe(true)
    expect(time.isValidTimezone('Pacific/Chatham')).toBe(true)
    expect(time.isValidTimezone('Mars/Olympus_Mons')).toBe(false)
    expect(time.isValidTimezone('')).toBe(false)
  })
})

describe('resolveLocal', () => {
  it('returns the single instant for an ordinary local time', () => {
    expect(resolveLocal('2026-06-01T09:00', LA, strict)).toBe('2026-06-01T09:00:00-07:00')
    expect(resolveLocal('2026-03-08T02:30', 'Asia/Kolkata', strict)).toBe(
      '2026-03-08T02:30:00+05:30',
    )
  })

  it('a time inside the spring-forward gap follows the nonexistent policy', () => {
    const local = '2026-03-08T02:30'
    expect(resolveLocal(local, LA, forward)).toBe('2026-03-08T03:30:00-07:00')
    expect(resolveLocal(local, LA, { nonexistent: 'previousValid', ambiguous: 'earlier' })).toBe(
      '2026-03-08T01:30:00-08:00',
    )
    expect(codeOf(() => resolveLocal(local, LA, strict))).toBe('NONEXISTENT_LOCAL_TIME')
  })

  it('a time that happens twice follows the ambiguous policy', () => {
    const local = '2026-11-01T01:30'
    expect(resolveLocal(local, LA, forward)).toBe('2026-11-01T01:30:00-07:00')
    expect(resolveLocal(local, LA, { nonexistent: 'reject', ambiguous: 'later' })).toBe(
      '2026-11-01T01:30:00-08:00',
    )
    expect(codeOf(() => resolveLocal(local, LA, strict))).toBe('AMBIGUOUS_LOCAL_TIME')
  })

  it('handles the 30-minute DST shift in Lord Howe', () => {
    expect(resolveLocal('2026-10-04T02:15', 'Australia/Lord_Howe', forward)).toBe(
      '2026-10-04T02:45:00+11:00',
    )
  })

  it('refuses input that already carries an offset', () => {
    expect(codeOf(() => resolveLocal('2026-03-08T02:30-08:00', LA, forward))).toBe(
      'INVALID_LOCAL_TIME',
    )
    expect(codeOf(() => resolveLocal('2026-03-08T02:30Z', LA, forward))).toBe('INVALID_LOCAL_TIME')
  })

  it('refuses a missing or partial policy', () => {
    const partial = { nonexistent: 'nextValid' } as unknown as ResolvePolicy
    expect(codeOf(() => resolveLocal('2026-03-08T02:30', LA, partial))).toBe('INVALID_CONFIG')
  })

  it('refuses an unknown timezone', () => {
    expect(codeOf(() => resolveLocal('2026-03-08T02:30', 'Nowhere/City', forward))).toBe(
      'INVALID_TIMEZONE',
    )
  })
})
