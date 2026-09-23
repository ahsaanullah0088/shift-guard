import { ShiftGuardError } from './errors'
import { createFormatter } from './format/messages'
import { buildScheduleIndex, type ScheduledAssignment } from './index/schedule-index'
import type { TimeAdapter } from './time/adapter'
import { temporalAdapter } from './time/temporal'
import type { Assignment, Person, Rule, RuleContext, Span, Violation } from './types'

export interface SchedulerConfig {
  /** The default IANA timezone for calendar questions. A person's own timezone wins. */
  readonly timezone: string
  /** Evaluated in this order. Every rule id must be unique. */
  readonly rules: readonly Rule[]
  /** Replaces the default Temporal-backed time layer. */
  readonly time?: TimeAdapter
}

export interface Override {
  /** The id of the rule to override. */
  readonly rule: string
  /** Why. Kept with the overridden violation for the audit log. */
  readonly reason: string
}

export interface AppliedOverride {
  readonly rule: string
  readonly reason: string
  /** The violation exactly as it would have been reported. */
  readonly wouldHaveBeen: Violation
}

export interface CheckOptions {
  /** Existing assignments. Other people's, and the candidate's own previous version, are ignored. */
  readonly existing: readonly Assignment[]
  readonly person: Person
  readonly overrides?: readonly Override[]
}

/**
 * A discriminated union: `violations` is only reachable after narrowing on `ok`.
 * Warnings and overrides never make a result invalid.
 */
export type CheckResult =
  | {
      readonly ok: true
      readonly warnings: readonly Violation[]
      readonly overridden: readonly AppliedOverride[]
    }
  | {
      readonly ok: false
      readonly violations: readonly Violation[]
      readonly warnings: readonly Violation[]
      readonly overridden: readonly AppliedOverride[]
    }

export interface Scheduler {
  readonly timezone: string
  readonly rules: readonly Rule[]
  check(candidate: Assignment, options: CheckOptions): CheckResult
}

/**
 * Creates a scheduler. Configuration is validated here, so a malformed rule set
 * throws at startup rather than on the first check in production.
 */
export function createScheduler(config: SchedulerConfig): Scheduler {
  if (config === null || typeof config !== 'object') {
    throw new ShiftGuardError('INVALID_CONFIG', 'createScheduler() needs a configuration object.')
  }
  const time = config.time ?? temporalAdapter
  assertTimezone(time, config.timezone, 'The scheduler timezone')

  if (!Array.isArray(config.rules)) {
    throw new ShiftGuardError('INVALID_CONFIG', '`rules` must be an array.')
  }
  const ruleIds = new Set<string>()
  for (const rule of config.rules) {
    assertRuleShape(rule)
    if (ruleIds.has(rule.id)) {
      throw new ShiftGuardError(
        'INVALID_CONFIG',
        `Two rules share the id "${rule.id}". Pass a distinct \`id\` option when registering a rule more than once.`,
      )
    }
    ruleIds.add(rule.id)
  }

  const rules: readonly Rule[] = Object.freeze([...config.rules])
  const defaultTimezone = config.timezone

  function check(candidate: Assignment, options: CheckOptions): CheckResult {
    if (options === null || typeof options !== 'object') {
      throw new ShiftGuardError('INVALID_INPUT', 'check() needs { existing, person }.')
    }
    const { existing, person, overrides = [] } = options
    if (person === null || typeof person !== 'object' || typeof person.id !== 'string') {
      throw new ShiftGuardError('INVALID_INPUT', '`person` must be an object with a string id.')
    }
    if (!Array.isArray(existing)) {
      throw new ShiftGuardError('INVALID_INPUT', '`existing` must be an array of assignments.')
    }
    if (candidate === null || typeof candidate !== 'object') {
      throw new ShiftGuardError('INVALID_INPUT', 'The candidate must be an assignment object.')
    }
    if (candidate.personId !== person.id) {
      throw new ShiftGuardError(
        'PERSON_MISMATCH',
        `The candidate belongs to person "${candidate.personId}" but person "${person.id}" was supplied.`,
      )
    }

    const timezone = person.timezone ?? defaultTimezone
    if (person.timezone !== undefined) {
      assertTimezone(time, person.timezone, `Person "${person.id}" timezone`)
    }

    const overrideByRule = new Map<string, Override>()
    for (const override of overrides) {
      if (!ruleIds.has(override.rule)) {
        throw new ShiftGuardError(
          'UNKNOWN_OVERRIDE',
          `Override names rule "${override.rule}", which this scheduler does not have.`,
        )
      }
      if (typeof override.reason !== 'string' || override.reason.trim() === '') {
        throw new ShiftGuardError('INVALID_INPUT', `Override for "${override.rule}" needs a reason.`)
      }
      overrideByRule.set(override.rule, override)
    }

    const candidateSpan = toSpan(time, candidate, 'Candidate')
    const scheduled: ScheduledAssignment[] = []
    for (const assignment of existing) {
      // An edit of an existing assignment must not conflict with its own previous self.
      if (assignment.personId !== person.id || assignment.id === candidate.id) continue
      scheduled.push({ ...assignment, ...toSpan(time, assignment, 'Existing assignment') })
    }

    const context: RuleContext = Object.freeze({
      candidate,
      candidateSpan,
      person,
      timezone,
      schedule: buildScheduleIndex(person.id, scheduled),
      time,
      format: createFormatter(timezone),
    })

    // Never short-circuit: every rule runs, in registration order.
    const violations: Violation[] = []
    const warnings: Violation[] = []
    const overridden: AppliedOverride[] = []

    for (const rule of rules) {
      if (rule.appliesTo !== undefined && !rule.appliesTo(candidate, person)) continue

      for (const draft of rule.evaluate(context)) {
        const violation: Violation = Object.freeze({
          rule: rule.id,
          ruleName: rule.name,
          severity: rule.severity,
          message: draft.message,
          conflictsWith: Object.freeze([...draft.conflictsWith]),
          detail: draft.detail,
        })
        if (violation.severity === 'warning') {
          warnings.push(violation)
          continue
        }
        const override = overrideByRule.get(rule.id)
        if (override === undefined) {
          violations.push(violation)
        } else {
          overridden.push(
            Object.freeze({ rule: rule.id, reason: override.reason, wouldHaveBeen: violation }),
          )
        }
      }
    }

    return violations.length === 0
      ? { ok: true, warnings, overridden }
      : { ok: false, violations, warnings, overridden }
  }

  return Object.freeze({ timezone: defaultTimezone, rules, check })
}

function assertTimezone(time: TimeAdapter, timezone: unknown, label: string): void {
  if (typeof timezone !== 'string' || !time.isValidTimezone(timezone)) {
    throw new ShiftGuardError(
      'INVALID_TIMEZONE',
      `${label} "${String(timezone)}" is not a recognised IANA timezone.`,
    )
  }
}

function assertRuleShape(rule: Rule): void {
  if (
    rule === null ||
    typeof rule !== 'object' ||
    typeof rule.id !== 'string' ||
    rule.id === '' ||
    typeof rule.name !== 'string' ||
    typeof rule.evaluate !== 'function' ||
    (rule.severity !== 'error' && rule.severity !== 'warning')
  ) {
    throw new ShiftGuardError(
      'INVALID_CONFIG',
      'Every rule needs an id, a name, a severity and an evaluate function. Create rules with defineRule().',
    )
  }
}

function toSpan(time: TimeAdapter, assignment: Assignment, label: string): Span {
  const where = `${label} "${String(assignment.id)}"`
  const startMs = parseInstant(time, assignment.start, `${where} start`)
  const endMs = parseInstant(time, assignment.end, `${where} end`)
  if (endMs <= startMs) {
    throw new ShiftGuardError(
      'INVALID_INTERVAL',
      `${where} ends at or before it starts (${assignment.start} to ${assignment.end}).`,
    )
  }
  return { startMs, endMs }
}

function parseInstant(time: TimeAdapter, value: string, where: string): number {
  try {
    return time.toEpochMs(value)
  } catch (error) {
    if (error instanceof ShiftGuardError) {
      throw new ShiftGuardError(error.code, `${where}: ${error.message}`)
    }
    throw error
  }
}
