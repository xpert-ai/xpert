import type { DatabaseValue } from './workbench'
import { lexWorkbenchSql, type SqlToken } from './workbench-sql-lexer'

/** Apply a page to a MySQL result without turning its (possibly duplicate) output names into table columns. */
export function paginateMysqlQuery(sql: string, parameters: DatabaseValue[] = [], limit: number, offset: number) {
  const { tokens } = lexWorkbenchSql(sql)
  const top: SqlToken[] = []
  let depth = 0
  for (const token of tokens) {
    if (token.text === '(') depth++
    if (!depth) top.push(token)
    if (token.text === ')') depth--
    if (depth < 0) throw new Error('unsupported_pagination')
  }
  if (depth) throw new Error('unsupported_pagination')
  const start = top.findIndex((token) => token.kind === 'word' && token.text === 'LIMIT')
  if (start < 0) return { sql: `${sql}\nLIMIT ${limit + 1} OFFSET ${offset}`, parameters }
  const clause = top.slice(start + 1)
  const bindings = tokens.filter((token) => token.text === '?' && token.kind === 'symbol')
  const consumed = new Set<number>()
  const integer = (token?: SqlToken) => {
    if (token?.kind === 'number') return BigInt(token.text)
    if (token?.kind === 'symbol' && token.text === '?') {
      const index = bindings.indexOf(token),
        value = parameters[index]
      if (typeof value === 'number' && Number.isSafeInteger(value) && value >= 0) {
        consumed.add(index)
        return BigInt(value)
      }
    }
    throw new Error('unsupported_pagination')
  }
  let count: bigint,
    skip = 0n
  if (clause.length === 1) count = integer(clause[0])
  else if (clause.length === 3 && clause[1].text === ',') {
    skip = integer(clause[0])
    count = integer(clause[2])
  } else if (clause.length === 3 && clause[1].kind === 'word' && clause[1].text === 'OFFSET') {
    count = integer(clause[0])
    skip = integer(clause[2])
  } else throw new Error('unsupported_pagination')
  const remaining = count > BigInt(offset) ? count - BigInt(offset) : 0n
  const size = remaining < BigInt(limit + 1) ? remaining : BigInt(limit + 1)
  return {
    sql: `${sql.slice(0, top[start].start)}LIMIT ${size} OFFSET ${skip + BigInt(offset)}${sql.slice(clause[clause.length - 1].end)}`,
    parameters: parameters.filter((_, index) => !consumed.has(index))
  }
}
