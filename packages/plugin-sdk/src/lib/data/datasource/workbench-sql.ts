import { lexWorkbenchSql } from './workbench-sql-lexer'
import { sqlDeclarationPositions } from './workbench-sql-syntax'
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
// FROM/JOIN can introduce a parenthesized subquery, not a function call.
const SQL_PARENS = new Set(
  'IN AS EXISTS OVER PARTITION VALUES SELECT WITH FROM JOIN AND OR NOT ON USING FILTER GROUPING ROLLUP CUBE DISTINCT EXPLAIN'.split(
    ' '
  )
)
const UNSAFE_FUNCTIONS =
  /\b(pg_sleep|sleep|benchmark|dblink\w*|lo_\w+|pg_(?:read|write|ls|stat|terminate|cancel|reload|rotate|log|create|drop|promote|switch|backup|replication|advisory)\w*|get_lock|release_lock|load_file|nextval|setval|set_config|http\w*|s3|hdfs|jdbc|mysql|postgresql|file|url)\s*\(/i

export function splitWorkbenchSql(source: string): SqlStatement[] {
  const { masked, tokens } = lexWorkbenchSql(source)
  const statements: SqlStatement[] = []
  let start = 0
  const finish = (end: number) => {
    const text = masked.slice(start, end)
    if (text.trim()) {
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
        const declarations = sqlDeclarationPositions(tokens.filter((token) => token.start >= start && token.end <= end))
        if (
          [...text.matchAll(/([A-Z_][A-Z_0-9]*)\s*\(/gi)].some(
            (match) =>
              !declarations.has(start + match.index) &&
              !SAFE_FUNCTIONS.has(match[1].toUpperCase()) &&
              !SQL_PARENS.has(match[1].toUpperCase())
          )
        )
          effect = 'unsupported'
        if (
          first === 'SHOW' &&
          !/^(SHOW\s+(DATABASES|SCHEMAS|CATALOGS|TABLES|FULL\s+TABLES|COLUMNS|FULL\s+COLUMNS|INDEX|INDEXES|KEYS|CREATE\s+TABLE|CREATE\s+VIEW|PARTITIONS|VARIABLES|STATUS|GRANTS))\b/i.test(
            text.trim()
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
    start = end + 1
  }
  for (const token of tokens) {
    if (token.kind === 'symbol' && token.text === ';') finish(token.start)
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
