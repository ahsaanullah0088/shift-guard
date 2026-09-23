import { describe, expect, it } from 'vitest'
import {
  createScheduler,
  defineRule,
  noDoubleBooking,
  ShiftGuardError,
  type Rule,
} from '../src'
import { sarah, shift } from './helpers'

const LA = 'America/Los_Angeles'

function codeOf(fn: () => unknown): string | undefined {
  try {
    fn()
  } catch (error) {
    if (error instanceof ShiftGuardError) return error.code
    throw error
  }
  return undefined
}

/** The custom rule from the spec, written only against the public API. */
const noClopening = (opts: { minGapHours: number }) =>
  defineRule({
    name: 'noClopening',
    evaluate: ({ candidate, candidateSpan, schedule, format, person }) => {
      const previous = schedule.lastEndingBefore(candidateSpan.startMs)
      if (!previous) return []

      const gap = (candidateSpan.startMs - previous.endMs) / 3_600_000
      if (gap >= opts.minGapHours) return []

      return [
        {
          message:
            `${format.person(person)} finishes a closing shift at ${format.dateTime(previous.endMs)}; ` +
            `this shift starts at ${format.dateTime(candidateSpan.startMs)}, ` +
            `a gap of ${format.duration(gap)} against a ${opts.minGapHours} hour minimum.`,
          conflictsWith: [previous.id],
          detail: { gapHours: gap, minGapHours: opts.minGapHours, candidateId: candidate.id },
        },
      ]
    },
  })

const failing = (id: string, severity: 'error' | 'warning' = 'error'): Rule =>
  defineRule({
    name: 'alwaysFails',
    id,
    severity,
    evaluate: () => [{ message: `${id} failed.`, conflictsWith: [], detail: {} }],
  })

const candidate = shift('2026-03-08T04:00:00-07:00', '2026-03-08T12:00:00-07:00')
const closing = shift('2026-03-07T14:00:00-08:00', '2026-03-07T22:00:00-08:00')

describe('createScheduler', () => {
  it('rejects an unknown timezone at construction', () => {
    expect(codeOf(() => createScheduler({ timezone: 'Mars/Base', rules: [] }))).toBe('INVALID_TIMEZONE')
  })

  it('rejects two rules with the same id, and accepts them with distinct ids', () => {
    expect(
      codeOf(() => createScheduler({ timezone: LA, rules: [noDoubleBooking(), noDoubleBooking()] })),
    ).toBe('INVALID_CONFIG')
    expect(() =>
      createScheduler({ timezone: LA, rules: [noDoubleBooking(), noDoubleBooking({ id: 'strict' })] }),
    ).not.toThrow()
  })

  it('rejects hand-built rules with the wrong shape', () => {
    const broken = { id: 'x', name: 'x', severity: 'fatal', evaluate: () => [] } as unknown as Rule
    expect(codeOf(() => createScheduler({ timezone: LA, rules: [broken] }))).toBe('INVALID_CONFIG')
  })
})

describe('check input validation', () => {
  const scheduler = createScheduler({ timezone: LA, rules: [noDoubleBooking()] })

  it('rejects a naive candidate time', () => {
    const naive = { ...candidate, start: '2026-03-08T04:00:00' }
    expect(codeOf(() => scheduler.check(naive, { existing: [], person: sarah }))).toBe('INVALID_INSTANT')
  })

  it('rejects an interval that ends at or before its start', () => {
    const backwards = { ...candidate, end: candidate.start }
    expect(codeOf(() => scheduler.check(backwards, { existing: [], person: sarah }))).toBe(
      'INVALID_INTERVAL',
    )
  })

  it('names the bad existing assignment in the error', () => {
    const bad = { ...closing, end: 'tomorrow' }
    expect(() => scheduler.check(candidate, { existing: [bad], person: sarah })).toThrow(
      `Existing assignment "${closing.id}" end`,
    )
  })

  it('rejects a person who does not own the candidate', () => {
    expect(codeOf(() => scheduler.check(candidate, { existing: [], person: { id: 'p_other' } }))).toBe(
      'PERSON_MISMATCH',
    )
  })

  it('rejects an invalid person timezone', () => {
    const person = { ...sarah, timezone: 'Not/AZone' }
    expect(codeOf(() => scheduler.check(candidate, { existing: [], person }))).toBe('INVALID_TIMEZONE')
  })
})

describe('evaluation', () => {
  it('runs a custom rule written against the public API', () => {
    const scheduler = createScheduler({ timezone: LA, rules: [noClopening({ minGapHours: 10 })] })
    const result = scheduler.check(candidate, { existing: [closing], person: sarah })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.violations[0]?.message).toBe(
      'Sarah Chen finishes a closing shift at 22:00 on Sat 7 Mar; this shift starts at ' +
        '04:00 on Sun 8 Mar, a gap of 5 hours against a 10 hour minimum.',
    )
    expect(result.violations[0]?.detail['gapHours']).toBe(5)
  })

  it('never short-circuits, and keeps registration order', () => {
    const scheduler = createScheduler({
      timezone: LA,
      rules: [failing('first'), failing('soft', 'warning'), failing('second')],
    })
    const result = scheduler.check(candidate, { existing: [], person: sarah })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.violations.map((v) => v.rule)).toEqual(['first', 'second'])
    expect(result.warnings.map((v) => v.rule)).toEqual(['soft'])
  })

  it('records an override with the violation it suppressed', () => {
    const scheduler = createScheduler({ timezone: LA, rules: [noClopening({ minGapHours: 10 })] })
    const reason = 'Emergency callout, approved by the duty manager'
    const result = scheduler.check(candidate, {
      existing: [closing],
      person: sarah,
      overrides: [{ rule: 'noClopening', reason }],
    })
    expect(result.ok).toBe(true)
    expect(result.overridden).toHaveLength(1)
    expect(result.overridden[0]?.reason).toBe(reason)
    expect(result.overridden[0]?.wouldHaveBeen.conflictsWith).toEqual([closing.id])
  })

  it('overrides one rule instance without touching another of the same type', () => {
    const scheduler = createScheduler({ timezone: LA, rules: [failing('a'), failing('b')] })
    const result = scheduler.check(candidate, {
      existing: [],
      person: sarah,
      overrides: [{ rule: 'a', reason: 'Approved' }],
    })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.violations.map((v) => v.rule)).toEqual(['b'])
    expect(result.overridden.map((o) => o.rule)).toEqual(['a'])
  })

  it('rejects overrides for unknown rules and overrides without a reason', () => {
    const scheduler = createScheduler({ timezone: LA, rules: [noDoubleBooking()] })
    expect(
      codeOf(() =>
        scheduler.check(candidate, {
          existing: [],
          person: sarah,
          overrides: [{ rule: 'minRestBetwen', reason: 'typo' }],
        }),
      ),
    ).toBe('UNKNOWN_OVERRIDE')
    expect(
      codeOf(() =>
        scheduler.check(candidate, {
          existing: [],
          person: sarah,
          overrides: [{ rule: 'noDoubleBooking', reason: '  ' }],
        }),
      ),
    ).toBe('INVALID_INPUT')
  })
})
