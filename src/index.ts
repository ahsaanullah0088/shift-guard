export { createScheduler } from './scheduler'
export type {
  AppliedOverride,
  CheckOptions,
  CheckResult,
  Override,
  Scheduler,
  SchedulerConfig,
} from './scheduler'

export { defineRule } from './define-rule'
export type { RuleDefinition } from './define-rule'

export { noDoubleBooking } from './rules/no-double-booking'
export type { DoubleBookingDetail } from './rules/no-double-booking'
export { minRestBetween } from './rules/min-rest-between'
export type { MinRestDetail, MinRestOptions } from './rules/min-rest-between'

export { hoursBetween } from './time/duration'
export { resolveLocal } from './time/resolve-local'
export { createTemporalAdapter } from './time/temporal'
export type { ResolvePolicy, TimeAdapter } from './time/adapter'

export { ShiftGuardError } from './errors'
export type { ShiftGuardErrorCode } from './errors'

export type { Formatter } from './format/messages'
export type { ScheduleIndex, ScheduledAssignment } from './index/schedule-index'
export type {
  Assignment,
  Instant,
  MessageFormatter,
  MessageInput,
  Person,
  Rule,
  RuleContext,
  RuleOptions,
  Severity,
  SharedRuleOptions,
  Span,
  Violation,
  ViolationDetail,
  ViolationDraft,
} from './types'
