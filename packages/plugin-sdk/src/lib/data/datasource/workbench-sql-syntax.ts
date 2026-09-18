import type { SqlToken } from './workbench-sql-lexer'

const MODIFIED_TYPES = new Set(
  'DECIMAL NUMERIC CHAR VARCHAR NCHAR NVARCHAR BINARY VARBINARY DATETIME TIME TIMESTAMP'.split(' ')
)

/** Positions where name(...) declares columns or a built-in type, rather than invoking a function. */
export function sqlDeclarationPositions(tokens: SqlToken[]): Set<number> {
  const declarations = new Set<number>()
  const closing = new Map<number, number>(),
    parents = new Map<number, number>()
  const stack: number[] = []
  tokens.forEach((token, index) => {
    if (stack.length) parents.set(index, stack[stack.length - 1])
    if (token.text === '(') stack.push(index)
    if (token.text === ')') {
      const open = stack.pop()
      if (open !== undefined) closing.set(open, index)
    }
  })
  const name = (index: number) => ['word', 'identifier'].includes(tokens[index]?.kind)
  const is = (index: number, word: string) => tokens[index]?.text === word
  for (let i = 0; i < tokens.length; i++) {
    if (tokens[i].kind !== 'word' || !is(i, 'WITH')) continue
    let cursor = i + 1
    if (is(cursor, 'RECURSIVE')) cursor++
    while (name(cursor)) {
      const declaration = cursor++
      let columns = false
      if (is(cursor, '(')) {
        const end = closing.get(cursor)
        if (end === undefined || end === cursor + 1) break
        const columnTokens = tokens.slice(cursor + 1, end)
        if (
          columnTokens.length % 2 === 0 ||
          !columnTokens.every((token, n) =>
            n % 2 === 0 ? ['word', 'identifier'].includes(token.kind) : token.text === ','
          )
        )
          break
        columns = true
        cursor = end + 1
      }
      if (!is(cursor++, 'AS')) break
      if (is(cursor, 'NOT')) cursor++
      if (is(cursor, 'MATERIALIZED')) cursor++
      if (!is(cursor, '(')) break
      const end = closing.get(cursor)
      if (end === undefined) break
      if (columns) declarations.add(tokens[declaration].start)
      cursor = end + 1
      if (!is(cursor, ',')) break
      cursor++
    }
  }
  tokens.forEach((token, i) => {
    if (token.kind !== 'word' || !MODIFIED_TYPES.has(token.text) || !is(i + 1, '(')) return
    const end = closing.get(i + 1)
    if (end === undefined) return
    const args = tokens.slice(i + 2, end)
    if (![1, 3].includes(args.length) || !args.every((arg, n) => (n % 2 ? arg.text === ',' : arg.kind === 'number')))
      return
    const parent = parents.get(i)
    const owner = parent === undefined ? undefined : tokens[parent - 1]?.text
    const cast = owner === 'CAST' && is(i - 1, 'AS')
    const convert = owner === 'CONVERT' && is(i - 1, ',')
    const postgresCast = is(i - 1, ':') && is(i - 2, ':')
    if (cast || convert || postgresCast) declarations.add(token.start)
  })
  return declarations
}
