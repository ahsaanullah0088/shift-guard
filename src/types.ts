import type { Formatter } from './format/messages'
import type { ScheduleIndex, ScheduledAssignment } from './index/schedule-index'
import type { TimeAdapter } from './time/adapter'

/**
 * An unambiguous point on the absolute timeline: an ISO 8601 string that
 * always carries a UTC offset or `Z`.
 *
 * - `"2026-03-08T14:00:00-08:00"` valid
 * - `"2026-03-08T14:00:00Z"` valid
 * - `"2026-03-08T14:00:00"` rejected; use `resolveLocal()` to convert it
 */
export type Instant = string

/** An interval on the absolute timeline in epoch milliseconds, half-open: `[startMs, endMs)`. */
export interface Span {
  readonly startMs: number
  readonly endMs: number
}

/** One person working one continuous block of time. */
export interface Assignment {
  readonly id: string
  readonly personId: string
  readonly start: Instant
  /** Exclusive. A shift ending at 14:00 does not overlap one starting at 14:00. */
  readonly end: Instant
  readonly requiredQualifications?: readonly string[]
  /** Carried through to rules untouched. */
  readonly metadata?: Readonly<Record<string, unknown>>
}

export interface Person {
  readonly id: string
  /** Used in violation messages. Messages never fall back to the raw id. */
  readonly displayName?: string
  readonly qualifications?: readonly string[]
  /** Overrides the scheduler timezone for this person only. */
  readonly timezone?: string
}

export type Severity = 'error' | 'warning'

/** Machine-readable specifics of a violation: thresholds, actuals, units. */
export type ViolationDetail = Readonly<Record<string, unknown>>

export interface Violation<D extends ViolationDetail = ViolationDetail> {
  /** Id of the rule instance that produced this violation. */
  readonly rule: string
  /** Name of the rule type, e.g. `'noDoubleBooking'`. Several instances may share it. */
  readonly ruleName: string
  readonly severity: Severity
  /** Rendered for humans. Never contains raw ids. */
  readonly message: string
  /** Ids of the existing assignments responsible. */
  readonly conflictsWith: readonly string[]
  readonly detail: D
}

/** What a rule returns. The engine adds `rule`, `ruleName` and `severity`. */
export interface ViolationDraft<D extends ViolationDetail = ViolationDetail> {
  readonly message: string
  readonly conflictsWith: readonly string[]
  readonly detail: D
}

export interface RuleContext {
  readonly candidate: Assignment
  /** The candidate's interval, parsed once. */
  readonly candidateSpan: Span
  readonly person: Person
  /** The effective timezone: the person's, or else the scheduler's. */
  readonly timezone: string
  /** Existing assignments for this person only, excluding the candidate's own id. */
  readonly schedule: ScheduleIndex
  readonly time: TimeAdapter
  /** Message helpers bound to `timezone`. */
  readonly format: Formatter
}

export interface Rule<D extends ViolationDetail = ViolationDetail> {
  /** Unique within a scheduler. Defaults to `name`. Overrides refer to this. */
  readonly id: string
  readonly name: string
  readonly severity: Severity
  /** When present and false, the rule is skipped for this candidate. */
  readonly appliesTo?: (assignment: Assignment, person: Person) => boolean
  evaluate(context: RuleContext): readonly ViolationDraft<D>[]
}

export interface MessageInput<D extends ViolationDetail> {
  readonly detail: D
  readonly context: RuleContext
  /** The existing assignments this violation is about. */
  readonly conflicts: readonly ScheduledAssignment[]
}

export type MessageFormatter<D extends ViolationDetail> = (input: MessageInput<D>) => string

/** Options every built-in rule accepts. */
export interface SharedRuleOptions {
  /** Needed when one rule type is registered more than once. */
  readonly id?: string
  readonly severity?: Severity
  readonly appliesTo?: (assignment: Assignment, person: Person) => boolean
}

export interface RuleOptions<D extends ViolationDetail> extends SharedRuleOptions {
  /** Replaces the default English message. */
  readonly message?: MessageFormatter<D>
}
