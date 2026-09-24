import { describe, expect, it } from 'vitest'
import {
  createScheduler,
  minRestBetween,
  ShiftGuardError,
  type Assignment,
  type CheckResult,
  type MinRestOptions,
} from '../../src'
import { sarah, shift } from '../helpers'

const LA = 'America/Los_Angeles'
const scheduler = createScheduler({ timezone: LA, rules: [minRestBetween({ hours: 10 })] })

/** Ends 22:00 PST on Sat 7 March, the night the clocks go forward. */
const closing = shift('2026-03-07T14:00:00-08:00', '2026-03-07T22:00:00-08:00')

function check(candidate: Assignment, existing: readonly Assignment[] = [closing]): CheckResult {
  return scheduler.check(candidate, { existing, person: sarah })
}

function violationsOf(result: CheckResult) {
  if (result.ok) throw new Error('expected a failing result')
  return result.violations
}

describe('minRestBetween', () => {
  it('passes against an empty schedule', () => {
    expect(check(shift('2026-03-08T04:00:00-07:00', '2026-03-08T12:00:00-07:00'), []).ok).toBe(true)
  })

  it('measures rest on the absolute timeline: 22:00 to 04:00 across spring forward is 5 hours', () => {
    const [violation, ...rest] = violationsOf(
      check(shift('2026-03-08T04:00:00-07:00', '2026-03-08T12:00:00-07:00')),
    )
    expect(rest).toHaveLength(0)
    expect(violation).toEqual({
      rule: 'minRestBetween',
      ruleName: 'minRestBetween',
      severity: 'error',
      message:
        'Sarah Chen finishes at 22:00 on Sat 7 Mar and this shift starts at 04:00 on Sun 8 Mar, ' +
        'leaving 5 hours of rest (the clocks change in between). The minimum is 10 hours.',
      conflictsWith: [closing.id],
      detail: {
        direction: 'before',
        restHours: 5,
        minimumHours: 10,
        shortfallHours: 5,
        crossesDstTransition: true,
        precedingAssignmentId: closing.id,
      },
    })
  })

  it('does not fail a rest that only looks short on the clock (fall back)', () => {
    // 23:00 PDT to 08:00 PST reads as 9 hours but is 10.
    const late = shift('2026-10-31T15:00:00-07:00', '2026-10-31T23:00:00-07:00')
    expect(check(shift('2026-11-01T08:00:00-08:00', '2026-11-01T16:00:00-08:00'), [late]).ok).toBe(true)
    expect(check(shift('2026-11-01T07:59:00-08:00', '2026-11-01T16:00:00-08:00'), [late]).ok).toBe(false)
  })

  it('passes when the minimum is met exactly, and fails when missed by one minute', () => {
    expect(check(shift('2026-03-08T09:00:00-07:00', '2026-03-08T17:00:00-07:00')).ok).toBe(true)

    const [violation] = violationsOf(
      check(shift('2026-03-08T08:59:00-07:00', '2026-03-08T17:00:00-07:00')),
    )
    expect(violation?.detail['shortfallHours']).toBeCloseTo(1 / 60)
  })

  it('checks the rest after the candidate too', () => {
    const next = shift('2026-06-11T04:00:00-07:00', '2026-06-11T12:00:00-07:00')
    const [violation] = violationsOf(
      check(shift('2026-06-10T12:00:00-07:00', '2026-06-10T20:00:00-07:00'), [next]),
    )
    expect(violation?.message).toBe(
      'This shift ends at 20:00 on Wed 10 Jun and Sarah Chen starts again at 04:00 on Thu 11 Jun, ' +
        'leaving 8 hours of rest. The minimum is 10 hours.',
    )
    expect(violation?.detail).toMatchObject({
      direction: 'after',
      restHours: 8,
      followingAssignmentId: next.id,
      crossesDstTransition: false,
    })
  })

  it('reports both sides when a shift is squeezed between two others', () => {
    const before = shift('2026-06-10T00:00:00-07:00', '2026-06-10T08:00:00-07:00')
    const after = shift('2026-06-11T00:00:00-07:00', '2026-06-11T08:00:00-07:00')
    const violations = violationsOf(
      check(shift('2026-06-10T12:00:00-07:00', '2026-06-10T20:00:00-07:00'), [after, before]),
    )
    expect(violations.map((v) => [v.detail['direction'], v.conflictsWith])).toEqual([
      ['before', [before.id]],
      ['after', [after.id]],
    ])
  })

  it('uses the nearest shift on each side, not just any shift', () => {
    const older = shift('2026-06-09T00:00:00-07:00', '2026-06-09T08:00:00-07:00')
    const nearer = shift('2026-06-10T00:00:00-07:00', '2026-06-10T06:00:00-07:00')
    const [violation] = violationsOf(
      check(shift('2026-06-10T12:00:00-07:00', '2026-06-10T20:00:00-07:00'), [older, nearer]),
    )
    expect(violation?.conflictsWith).toEqual([nearer.id])
    expect(violation?.detail['restHours']).toBe(6)
  })

  it('says "no rest" for back-to-back shifts', () => {
    const [violation] = violationsOf(
      check(shift('2026-03-07T22:00:00-08:00', '2026-03-08T03:00:00-07:00')),
    )
    expect(violation?.message).toContain('leaving no rest')
    expect(violation?.detail['restHours']).toBe(0)
  })

  it('leaves overlapping shifts to noDoubleBooking', () => {
    expect(check(shift('2026-03-07T18:00:00-08:00', '2026-03-07T20:00:00-08:00')).ok).toBe(true)
  })

  it('does not measure rest against the candidate’s own previous version', () => {
    const moved = { ...closing, start: '2026-03-07T15:00:00-08:00', end: '2026-03-07T23:00:00-08:00' }
    expect(check(moved).ok).toBe(true)
  })

  it('never puts raw ids in the message', () => {
    const [violation] = violationsOf(
      check(shift('2026-03-08T04:00:00-07:00', '2026-03-08T12:00:00-07:00')),
    )
    expect(violation?.message).not.toContain(closing.id)
    expect(violation?.message).not.toContain(sarah.id)
  })

  it('can be registered twice, as a hard minimum and a softer target', () => {
    const tiered = createScheduler({
      timezone: LA,
      rules: [
        minRestBetween({ hours: 8 }),
        minRestBetween({ id: 'preferredRest', hours: 11, severity: 'warning' }),
      ],
    })
    const result = tiered.check(shift('2026-03-08T07:00:00-07:00', '2026-03-08T15:00:00-07:00'), {
      existing: [closing],
      person: sarah,
    })
    expect(result.ok).toBe(true)
    expect(result.warnings.map((w) => [w.rule, w.detail['restHours']])).toEqual([['preferredRest', 8]])
  })

  it('rejects a missing or non-positive minimum at construction', () => {
    for (const bad of [{}, { hours: 0 }, { hours: -1 }, { hours: Number.NaN }, { hours: Infinity }]) {
      expect(() => minRestBetween(bad as MinRestOptions)).toThrow(ShiftGuardError)
    }
  })
})
