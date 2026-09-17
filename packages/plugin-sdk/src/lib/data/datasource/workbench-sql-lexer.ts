export interface SqlToken {
  text: string
  start: number
  end: number
  kind: 'word' | 'number' | 'symbol' | 'identifier' | 'literal'
}

/** Mask comments and quoted content without changing source offsets. Shared by guards and pagination. */
export function lexWorkbenchSql(source: string): { masked: string; tokens: SqlToken[] } {
  if (!source.trim() || source.length > 100_000 || source.includes('\0')) throw new Error('invalid_sql')
  const masked = source.split('')
  const quoted = new Map<number, 'identifier' | 'literal'>()
  const hide = (start: number, end: number, kind?: 'identifier' | 'literal') => {
    for (let i = start; i < end; i++) if (masked[i] !== '\n') masked[i] = ' '
    if (kind) {
      const marker = start + 1
      quoted.set(marker, kind)
      masked[marker] = kind === 'literal' ? '?' : 'i'
    }
  }
  let index = 0
  while (index < source.length) {
    const start = index,
      c = source[index],
      next = source[index + 1]
    if ((c === '-' && next === '-') || c === '#') {
      while (index < source.length && source[index] !== '\n') index++
      hide(start, index)
      continue
    }
    if (c === '/' && next === '*') {
      if (source[index + 2] === '!') throw new Error('executable_comment_not_supported')
      const end = source.indexOf('*/', index + 2)
      if (end < 0) throw new Error('unterminated_comment')
      index = end + 2
      hide(start, index)
      continue
    }
    if (c === "'" || c === '"' || c === '`') {
      let closed = false
      index++
      while (index < source.length) {
        if (source[index] === '\\') throw new Error('use_parameters_for_backslash_literals')
        if (source[index] === c) {
          if (source[index + 1] === c) {
            index += 2
            continue
          }
          index++
          closed = true
          break
        }
        index++
      }
      if (!closed) throw new Error('unterminated_literal')
      hide(start, index, c === "'" ? 'literal' : 'identifier')
      continue
    }
    if (c === '$') {
      const tag = source.slice(index).match(/^\$(?:[A-Za-z_][A-Za-z_0-9]*)?\$/)?.[0]
      if (tag) {
        const end = source.indexOf(tag, index + tag.length)
        if (end < 0) throw new Error('unterminated_literal')
        index = end + tag.length
        hide(start, index, 'literal')
        continue
      }
    }
    index++
  }
  const text = masked.join('')
  const tokens = [...text.matchAll(/[A-Z_][A-Z_0-9]*|[0-9]+|[^\s]/gi)].map(
    (match): SqlToken => ({
      text: match[0].toUpperCase(),
      start: match.index,
      end: match.index + match[0].length,
      kind:
        quoted.get(match.index) ?? (/^[A-Z_]/i.test(match[0]) ? 'word' : /^[0-9]/.test(match[0]) ? 'number' : 'symbol')
    })
  )
  return { masked: text, tokens }
}
