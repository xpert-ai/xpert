import { TWFCase, WorkflowComparisonOperator, WorkflowLogicalOperator } from '@metad/contracts'
import { Raw } from 'typeorm'


/**
 * Build TypeORM Raw() JSON filter for document.metadata
 */
export function buildMetadataCondition(caseFilter: TWFCase) {
  const { conditions, logicalOperator } = caseFilter

  return Raw((alias) => {
    const expressions: string[] = []

    const escape = (val?: string) =>
      (val ?? '').replace(/'/g, "''")   // basic SQL escape

    conditions.forEach((cond) => {
      const key = cond.variableSelector
      const rawVal = escape(cond.value)

      if (!key) return
      const jsonExpr = `${alias} ->> '${key}'`

      switch (cond.comparisonOperator) {
        case WorkflowComparisonOperator.CONTAINS:
          expressions.push(`${jsonExpr} ILIKE '%${rawVal}%'`)
          break

        case WorkflowComparisonOperator.NOT_CONTAINS:
          expressions.push(`${jsonExpr} NOT ILIKE '%${rawVal}%'`)
          break

        case WorkflowComparisonOperator.EQUAL:
          expressions.push(`${jsonExpr} = '${rawVal}'`)
          break

        case WorkflowComparisonOperator.NOT_EQUAL:
          expressions.push(`${jsonExpr} != '${rawVal}'`)
          break

        case WorkflowComparisonOperator.LIKE:
          expressions.push(`${jsonExpr} ILIKE '${rawVal}'`)
          break

        case WorkflowComparisonOperator.NOT_LIKE:
          expressions.push(`${jsonExpr} NOT ILIKE '${rawVal}'`)
          break

        case WorkflowComparisonOperator.STARTS_WITH:
          expressions.push(`${jsonExpr} ILIKE '${rawVal}%'`)
          break

        case WorkflowComparisonOperator.ENDS_WITH:
          expressions.push(`${jsonExpr} ILIKE '%${rawVal}'`)
          break

        case WorkflowComparisonOperator.GT:
          expressions.push(`CAST(${jsonExpr} AS NUMERIC) > '${rawVal}'`)
          break

        case WorkflowComparisonOperator.GE:
          expressions.push(`CAST(${jsonExpr} AS NUMERIC) >= '${rawVal}'`)
          break

        case WorkflowComparisonOperator.LT:
          expressions.push(`CAST(${jsonExpr} AS NUMERIC) < '${rawVal}'`)
          break

        case WorkflowComparisonOperator.LE:
          expressions.push(`CAST(${jsonExpr} AS NUMERIC) <= '${rawVal}'`)
          break

        case WorkflowComparisonOperator.EMPTY:
          expressions.push(`(${jsonExpr} IS NULL OR ${jsonExpr} = '')`)
          break

        case WorkflowComparisonOperator.NOT_EMPTY:
          expressions.push(`(${jsonExpr} IS NOT NULL AND ${jsonExpr} != '')`)
          break

        case WorkflowComparisonOperator.IS_TRUE:
          expressions.push(`${jsonExpr}::boolean = TRUE`)
          break

        case WorkflowComparisonOperator.IS_FALSE:
          expressions.push(`${jsonExpr}::boolean = FALSE`)
          break

        default:
          break
      }
    })

    if (!expressions.length) return 'TRUE'

    const joinOp =
      logicalOperator === WorkflowLogicalOperator.AND ? ' AND ' : ' OR '

    return `(${expressions.join(joinOp)})`
  })
}
