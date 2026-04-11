import { isEmpty } from "@xpert-ai/ocap-core"

export function OrderBy(orders: string[]) {
  return isEmpty(orders) ? '' : `ORDER BY ${orders.join(', ')}`
}

export function Cast(field: string, type: string) {
  return `CAST(${field} AS ${type})`
}

export function Not(statement: string) {
  return `NOT ( ${statement} )`
}

export function Parentheses(...statements: string[]) {
  if (statements.length > 1) {
    statements = statements.map((item) => `( ${item} )`)
  }

  return statements
}

export function And(...statements: string[]) {
  return statements.join(' AND ')
}

export function Or(...statements: string[]) {
  return statements.join(' OR ')
}

export function Aggregate(statement: string, aggregator?: string) {
  if (aggregator === 'distinct-count') {
    return `COUNT(DISTINCT ${statement} )`
  }
  return `${(aggregator || 'SUM').toUpperCase()}( ${statement} )`
}
