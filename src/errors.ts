export type ShiftGuardErrorCode =
  /** A string that is not an ISO 8601 instant with an offset. */
  | 'INVALID_INSTANT'
  /** An assignment whose end is not after its start. */
  | 'INVALID_INTERVAL'
  /** A local wall-clock string that cannot be parsed, or that carries an offset. */
  | 'INVALID_LOCAL_TIME'
  /** A timezone identifier the time layer does not recognise. */
  | 'INVALID_TIMEZONE'
  /** A malformed scheduler or rule configuration. */
  | 'INVALID_CONFIG'
  /** Malformed arguments passed to check(). */
  | 'INVALID_INPUT'
  /** The candidate's personId does not match the person supplied. */
  | 'PERSON_MISMATCH'
  /** An override names a rule id the scheduler does not have. */
  | 'UNKNOWN_OVERRIDE'
  /** resolveLocal() met a local time that does not exist, under a 'reject' policy. */
  | 'NONEXISTENT_LOCAL_TIME'
  /** resolveLocal() met a local time that occurs twice, under a 'reject' policy. */
  | 'AMBIGUOUS_LOCAL_TIME'

/**
 * Thrown for programmer errors: bad configuration or malformed input.
 * Rule violations are never thrown; they are returned in a CheckResult.
 */
export class ShiftGuardError extends Error {
  readonly code: ShiftGuardErrorCode

  constructor(code: ShiftGuardErrorCode, message: string) {
    super(message)
    this.name = 'ShiftGuardError'
    this.code = code
  }
}
