/** Invariants: comments/literals are lexed, never stripped with a keyword regex.
 * This guard is defense in depth; the database principal remains an authority boundary.
 * Unrecognized statements fail closed. Driver multi-statements stay disabled.
 */
export interface SqlStatement {
  sql: string
  words: string[]
  effect: 'read' | 'write' | 'unsupported'
}
const WRITE = new Set(['INSERT', 'UPDATE', 'DELETE', 'CREATE', 'ALTER', 'DROP', 'TRUNCATE', 'RENAME'])
const FORBIDDEN = new Set([
  'INTO',
  'OUTFILE',
  'DUMPFILE',
  'PROCEDURE',
  'CALL',
  'COPY',
  'LOAD',
  'EXPORT',
  'IMPORT',
  'GRANT',
  'REVOKE',
  'LOCK',
  'UNLOCK',
  'KILL',
  'SET',
  'RESET',
  'ANALYZE',
  'VACUUM',
  'OPTIMIZE',
  'ATTACH',
  'DETACH'
])
const SAFE_FUNCTIONS = new Set(
  'ABS ACOS ASIN ATAN ATAN2 AVG CAST CEIL CEILING COALESCE CONCAT CONCAT_WS CONVERT COS COUNT CURDATE CURRENT_DATE CURRENT_TIMESTAMP DATE DATE_ADD DATE_SUB DATE_FORMAT DATEDIFF DAY DAYOFMONTH DAYOFWEEK EXTRACT FLOOR FORMAT GREATEST GROUP_CONCAT IF IFNULL JSON_EXTRACT JSON_LENGTH JSON_UNQUOTE LEAST LEFT LENGTH LN LOG LOWER LPAD LTRIM MAX MD5 MIN MOD MONTH NOW NULLIF POWER RAND REPLACE REVERSE RIGHT ROUND ROW_NUMBER RANK DENSE_RANK LAG LEAD FIRST_VALUE LAST_VALUE LPAD RPAD RTRIM SIGN SIN SQRT STDDEV STDDEV_POP STDDEV_SAMP SUBSTR SUBSTRING SUM TAN TO_CHAR TO_DATE TO_TIMESTAMP TRIM TRUNC UPPER VAR_POP VAR_SAMP VERSION WEEK YEAR DATABASE CURRENT_DATABASE CURRENT_SCHEMA ARRAY_AGG STRING_AGG JSON_AGG JSON_BUILD_OBJECT PG_GET_VIEWDEF'.split(
    ' '
  )
)
const SQL_PARENS = new Set(
  'IN AS EXISTS OVER PARTITION VALUES SELECT WITH AND OR NOT ON USING FILTER GROUPING ROLLUP CUBE DISTINCT EXPLAIN'.split(
    ' '
  )
)
const UNSAFE_FUNCTIONS =
  /\b(pg_sleep|sleep|benchmark|dblink\w*|lo_\w+|pg_(?:read|write|ls|stat|terminate|cancel|reload|rotate|log|create|drop|promote|switch|backup|replication|advisory)\w*|get_lock|release_lock|load_file|nextval|setval|set_config|http\w*|s3|hdfs|jdbc|mysql|postgresql|file|url)\s*\(/i

export function splitWorkbenchSql(source: string): SqlStatement[] {
  if (!source.trim() || source.length > 100_000 || source.includes('\0')) throw new Error('invalid_sql')
  const statements: SqlStatement[] = []
  let start = 0,
    index = 0,
    clean = ''
  const finish = (end: number) => {
    const text = clean.trim()
    if (text) {
      const words = text.toUpperCase().match(/[A-Z_][A-Z_0-9]*/g) ?? []
      const first = words[0]
      let effect: SqlStatement['effect'] = 'unsupported'
      if (WRITE.has(first)) effect = 'write'
      if (
        first === 'SELECT' ||
        first === 'WITH' ||
        first === 'SHOW' ||
        first === 'DESC' ||
        first === 'DESCRIBE' ||
        first === 'EXPLAIN'
      ) {
        effect = 'read'
        if (
          words.some(
            (word, index) =>
              (WRITE.has(word) && !(first === 'SHOW' && index === 1 && word === 'CREATE')) || FORBIDDEN.has(word)
          ) ||
          UNSAFE_FUNCTIONS.test(text) ||
          /\bFOR\s+(UPDATE|SHARE)\b/i.test(text) ||
          /:=|\bEXPLAIN\s+ANALYZE\b|@/i.test(text)
        )
          effect = 'unsupported'
        // eslint-disable-next-line no-control-regex -- intentional: reject any non-ASCII/control input
        if (/[^\x00-\x7f]/.test(text) || /\.\s*[A-Z_][A-Z_0-9]*\s*\(/i.test(text)) effect = 'unsupported'
        if (
          [...text.matchAll(/([A-Z_][A-Z_0-9]*)\s*\(/gi)].some(
            (match) => !SAFE_FUNCTIONS.has(match[1].toUpperCase()) && !SQL_PARENS.has(match[1].toUpperCase())
          )
        )
          effect = 'unsupported'
        if (
          first === 'SHOW' &&
          !/^(SHOW\s+(DATABASES|SCHEMAS|CATALOGS|TABLES|FULL\s+TABLES|COLUMNS|FULL\s+COLUMNS|INDEX|INDEXES|KEYS|CREATE\s+TABLE|CREATE\s+VIEW|PARTITIONS|VARIABLES|STATUS|GRANTS))\b/i.test(
            text
          )
        )
          effect = 'unsupported'
      }
      // CREATE/ALTER routines, external resources and privileged SQL are outside this app.
      if (
        effect === 'write' &&
        /\b(FUNCTION|PROCEDURE|TRIGGER|USER|ROLE|CATALOG|RESOURCE|SYSTEM|SERVER|EXTENSION|FILE|OUTFILE|DUMPFILE|EXECUTE)\b/i.test(
          text
        )
      )
        effect = 'unsupported'
      statements.push({ sql: source.slice(start, end).trim(), words, effect })
    }
    clean = ''
    start = end + 1
  }
  while (index < source.length) {
    const c = source[index],
      next = source[index + 1]
    if ((c === '-' && next === '-') || c === '#') {
      while (index < source.length && source[index] !== '\n') index++
      clean += ' '
      continue
    }
    if (c === '/' && next === '*') {
      if (source[index + 2] === '!') throw new Error('executable_comment_not_supported')
      const end = source.indexOf('*/', index + 2)
      if (end < 0) throw new Error('unterminated_comment')
      index = end + 2
      clean += ' '
      continue
    }
    if (c === "'" || c === '"' || c === '`') {
      const quote = c
      let closed = false
      index++
      while (index < source.length) {
        if (source[index] === '\\') throw new Error('use_parameters_for_backslash_literals')
        if (source[index] === quote) {
          if (source[index + 1] === quote) {
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
      clean += quote === "'" ? ' ? ' : ' identifier '
      continue
    }
    if (c === '$') {
      const tag = source.slice(index).match(/^\$(?:[A-Za-z_][A-Za-z_0-9]*)?\$/)?.[0]
      if (tag) {
        const end = source.indexOf(tag, index + tag.length)
        if (end < 0) throw new Error('unterminated_literal')
        index = end + tag.length
        clean += ' ? '
        continue
      }
    }
    if (c === ';') {
      finish(index)
      index++
      continue
    }
    clean += c
    index++
  }
  finish(source.length)
  if (!statements.length || statements.length > 50) throw new Error('statement_count_exceeded')
  return statements
}
export function requireReadStatement(sql: string): string {
  const statements = splitWorkbenchSql(sql)
  if (statements.length !== 1 || statements[0].effect !== 'read') throw new Error('read_only_violation')
  return statements[0].sql
}
export function quoteDatabaseIdentifier(name: string, engine: 'doris' | 'mysql' | 'postgres'): string {
  // eslint-disable-next-line no-control-regex -- intentional: reject control characters in identifiers
  if (!name || name.length > 256 || /[\0-\x1f]/.test(name)) throw new Error('invalid_identifier')
  const quote = engine === 'postgres' ? '"' : '`'
  return quote + name.split(quote).join(quote + quote) + quote
}
