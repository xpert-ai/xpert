import { ISemanticModel, NgmSemanticModel, TSemanticModelDraft } from '@metad/cloud/state'
import { Schema } from '@metad/ocap-core'

export enum MODEL_TYPE {
  /**
   * Multidimensional analysis model
   */
  OLAP,
  /**
   * Third-party XMLA interface model
   */
  XMLA,
  /**
   * SQL Multidimensional Model
   */
  SQL
}

/**
 * Analyze the field type based on the SQL query result object
 *
 * https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/typeof
 *
 * @param obj
 * @returns
 */
export function typeOfObj(obj) {
  return Object.entries(obj).map(([key, value]) => ({
    name: key,
    type: value === null || value === undefined ? null : typeof value
  }))
}

export const MODEL_DEBOUNCE_TIME = 100

export type SemanticModelState = {
  model: NgmSemanticModel & ISemanticModel
  draft?: TSemanticModelDraft<Schema>
}
