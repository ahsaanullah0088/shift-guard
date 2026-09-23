import { ShiftGuardError } from './errors'
import type { Rule, RuleContext, SharedRuleOptions, ViolationDetail, ViolationDraft } from './types'

export interface RuleDefinition<D extends ViolationDetail> extends SharedRuleOptions {
  /** The rule type, e.g. `'noClopening'`. Also the default id. */
  readonly name: string
  evaluate(context: RuleContext): readonly ViolationDraft<D>[]
}

/**
 * Creates a rule. Built-in rules are made with this too, so a custom rule can do
 * anything a built-in one can. `id` defaults to `name` and `severity` to `'error'`.
 */
export function defineRule<D extends ViolationDetail>(definition: RuleDefinition<D>): Rule<D> {
  const { name, id = name, severity = 'error', appliesTo, evaluate } = definition

  if (typeof name !== 'string' || name === '') {
    throw new ShiftGuardError('INVALID_CONFIG', 'A rule needs a non-empty name.')
  }
  if (typeof id !== 'string' || id === '') {
    throw new ShiftGuardError('INVALID_CONFIG', `Rule "${name}" has an empty id.`)
  }
  if (severity !== 'error' && severity !== 'warning') {
    throw new ShiftGuardError(
      'INVALID_CONFIG',
      `Rule "${id}" has severity "${String(severity)}"; expected 'error' or 'warning'.`,
    )
  }
  if (typeof evaluate !== 'function') {
    throw new ShiftGuardError('INVALID_CONFIG', `Rule "${id}" needs an evaluate function.`)
  }
  if (appliesTo !== undefined && typeof appliesTo !== 'function') {
    throw new ShiftGuardError('INVALID_CONFIG', `Rule "${id}" has an appliesTo that is not a function.`)
  }

  return Object.freeze({
    id,
    name,
    severity,
    ...(appliesTo === undefined ? {} : { appliesTo }),
    evaluate,
  })
}
