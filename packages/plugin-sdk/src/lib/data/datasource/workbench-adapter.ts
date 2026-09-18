import type {
  DatabaseCapabilities,
  DatabaseColumn,
  DatabaseEngine,
  DatabaseImportInput,
  DatabaseImportReceipt,
  DatabaseKey,
  DatabaseLocation,
  DatabaseObjectDetail,
  DatabaseObjectPage,
  DatabaseObjectRef,
  DatabaseQueryInput,
  DatabaseResult,
  DatabaseValue,
  DatabaseWorkbenchAdapter
} from './workbench'
import { paginateMysqlQuery } from './workbench-pagination'
import { quoteDatabaseIdentifier, requireReadStatement, splitWorkbenchSql } from './workbench-sql'

export interface WorkbenchTransport {
  execute(
    sql: string,
    parameters: DatabaseValue[],
    options: { timeoutMs: number; maxRows: number; signal?: AbortSignal }
  ): Promise<DatabaseResult>
  close(): Promise<void>
  importRows?(input: DatabaseImportInput, signal?: AbortSignal): Promise<DatabaseImportReceipt>
}
const number = (value: DatabaseValue | undefined) => Number(value ?? 0)
const string = (value: DatabaseValue | undefined) => (value == null ? '' : String(value))
const cell = (result: DatabaseResult, row: DatabaseValue[], name: string) =>
  row[result.columns.findIndex((column) => column.name.toLowerCase() === name.toLowerCase())]

/** One adapter per physical connection. A host session must not share it across users. */
export class SqlDatabaseWorkbenchAdapter implements DatabaseWorkbenchAdapter {
  private version?: string
  private transactionOpen = false
  private busy = false
  private closed = false
  constructor(
    readonly engine: DatabaseEngine,
    private readonly transport: WorkbenchTransport,
    private readonly initial: DatabaseLocation = {}
  ) {}

  private quote(name: string) {
    return quoteDatabaseIdentifier(name, this.engine)
  }
  private ref(object: DatabaseObjectRef) {
    this.assertLocation(object)
    const namespace =
      this.engine === 'postgres'
        ? (object.schema ?? this.initial.schema ?? 'public')
        : (object.database ?? this.initial.database)
    if (!namespace) throw new Error('database_required')
    return `${this.quote(namespace)}.${this.quote(object.name)}`
  }
  private assertLocation(location: DatabaseLocation) {
    if (location.engineCatalog && location.engineCatalog !== 'internal')
      throw new Error('external_catalog_not_supported')
    if (this.engine === 'postgres' && location.database && location.database !== this.initial.database)
      throw new Error('database_requires_new_connection')
  }
  private async raw(
    sql: string,
    parameters: DatabaseValue[] = [],
    maxRows = 1001,
    signal?: AbortSignal,
    timeoutMs = 30_000
  ) {
    if (this.closed) throw new Error('session_closed')
    return this.transport.execute(sql, parameters, { maxRows, timeoutMs, signal })
  }
  async capabilities(): Promise<DatabaseCapabilities> {
    if (!this.version) {
      const result = await this.raw(
        this.engine === 'doris' ? 'SELECT @@version_comment AS version' : 'SELECT version() AS version',
        [],
        1
      )
      this.version = string(result.rows[0]?.[0])
    }
    const supported = this.engine !== 'doris' || /(?:^|[^0-9])(?:2\.1|3\.\d+|4\.\d+)(?:[.\s_-]|$)/.test(this.version)
    return {
      engine: this.engine,
      version: this.version,
      query: true,
      explain: true,
      transactions: this.engine !== 'doris',
      cancel: true,
      import: supported,
      writes: supported,
      nativeReadOnly: this.engine !== 'doris',
      objectKinds: ['table', 'view'],
      diagnostics:
        this.engine === 'doris'
          ? [
              ...(supported ? [] : ['doris_version_unverified_writes_disabled']),
              'doris_permissions_enforce_read_only',
              'external_catalog_not_supported',
              'doris_transactions_not_exposed'
            ]
          : []
    }
  }
  async locations(): Promise<DatabaseLocation[]> {
    const result = await this.raw(
      this.engine === 'postgres'
        ? "SELECT schema_name AS name FROM information_schema.schemata WHERE schema_name NOT LIKE 'pg_%' AND schema_name <> 'information_schema' ORDER BY schema_name LIMIT 1000"
        : "SELECT schema_name AS name FROM information_schema.schemata WHERE schema_name NOT IN ('information_schema','performance_schema','mysql','sys') ORDER BY schema_name LIMIT 1000"
    )
    return result.rows.map((row) =>
      this.engine === 'postgres'
        ? { database: this.initial.database, schema: string(row[0]) }
        : { database: string(row[0]), ...(this.engine === 'doris' ? { engineCatalog: 'internal' } : {}) }
    )
  }
  async objects(
    input: DatabaseLocation & { search?: string; page?: number; pageSize?: number }
  ): Promise<DatabaseObjectPage> {
    this.assertLocation(input)
    const page = Math.max(1, Math.min(input.page ?? 1, 10000)),
      pageSize = Math.max(1, Math.min(input.pageSize ?? 100, 1000))
    const namespace =
      this.engine === 'postgres'
        ? (input.schema ?? this.initial.schema ?? 'public')
        : (input.database ?? this.initial.database)
    if (!namespace) return { items: [], page, pageSize, hasMore: false }
    const placeholder = (i: number) => (this.engine === 'postgres' ? `$${i}` : '?')
    const result = await this.raw(
      `SELECT table_name, table_type FROM information_schema.tables WHERE table_schema = ${placeholder(1)} AND table_name LIKE ${placeholder(2)} ORDER BY table_name LIMIT ${pageSize + 1} OFFSET ${(page - 1) * pageSize}`,
      [namespace, `%${input.search ?? ''}%`],
      pageSize + 1
    )
    return {
      items: result.rows.slice(0, pageSize).map((row) => ({
        database: input.database,
        schema: input.schema,
        engineCatalog: input.engineCatalog,
        name: string(row[0]),
        kind: string(row[1]).includes('VIEW') ? 'view' : 'table'
      })),
      page,
      pageSize,
      hasMore: result.rows.length > pageSize
    }
  }
  async describe(object: DatabaseObjectRef): Promise<DatabaseObjectDetail> {
    const reference = this.ref(object)
    const namespace =
      this.engine === 'postgres'
        ? (object.schema ?? this.initial.schema ?? 'public')
        : (object.database ?? this.initial.database ?? '')
    const p = (i: number) => (this.engine === 'postgres' ? `$${i}` : '?')
    const metadata = await this.raw(
      this.engine === 'postgres'
        ? `SELECT a.attname AS column_name, pg_catalog.format_type(a.atttypid,a.atttypmod) AS data_type, CASE WHEN a.attnotnull THEN 'NO' ELSE 'YES' END AS is_nullable, a.attnum AS ordinal_position, pg_get_expr(d.adbin,d.adrelid) AS column_default FROM pg_catalog.pg_attribute a JOIN pg_catalog.pg_class c ON c.oid=a.attrelid JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace LEFT JOIN pg_catalog.pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum WHERE n.nspname=$1 AND c.relname=$2 AND a.attnum>0 AND NOT a.attisdropped ORDER BY a.attnum LIMIT 1000`
        : `SELECT column_name, column_type AS data_type, is_nullable, ordinal_position, column_default FROM information_schema.columns WHERE table_schema = ${p(1)} AND table_name = ${p(2)} ORDER BY ordinal_position LIMIT 1000`,
      [namespace, object.name]
    )
    const columns: DatabaseColumn[] = metadata.rows.map((row, index) => ({
      id: `c${index}`,
      name: string(cell(metadata, row, 'column_name')),
      dataType: string(cell(metadata, row, 'data_type')),
      nullable: string(cell(metadata, row, 'is_nullable')) === 'YES',
      ordinal: number(cell(metadata, row, 'ordinal_position')),
      defaultValue: cell(metadata, row, 'column_default') == null ? null : string(cell(metadata, row, 'column_default'))
    }))
    if (!columns.length) throw new Error('object_not_found_or_denied')
    const keys: DatabaseKey[] = [],
      diagnostics: string[] = []
    let definition = '',
      model: DatabaseObjectDetail['model']
    if (this.engine === 'postgres') {
      const result = await this.raw(
        `SELECT tc.constraint_name, tc.constraint_type, kcu.column_name, kcu.ordinal_position, ccu.table_schema AS foreign_schema, ccu.table_name AS foreign_table, ccu.column_name AS foreign_column FROM information_schema.table_constraints tc JOIN information_schema.key_column_usage kcu ON tc.constraint_catalog=kcu.constraint_catalog AND tc.constraint_schema=kcu.constraint_schema AND tc.constraint_name=kcu.constraint_name LEFT JOIN information_schema.referential_constraints rc ON rc.constraint_catalog=tc.constraint_catalog AND rc.constraint_schema=tc.constraint_schema AND rc.constraint_name=tc.constraint_name LEFT JOIN information_schema.key_column_usage ccu ON ccu.constraint_catalog=rc.unique_constraint_catalog AND ccu.constraint_schema=rc.unique_constraint_schema AND ccu.constraint_name=rc.unique_constraint_name AND ccu.ordinal_position=kcu.position_in_unique_constraint WHERE tc.table_schema=$1 AND tc.table_name=$2 ORDER BY tc.constraint_name,kcu.ordinal_position LIMIT 1000`,
        [namespace, object.name]
      )
      for (const row of result.rows) {
        const name = string(cell(result, row, 'constraint_name')),
          kind = string(cell(result, row, 'constraint_type'))
        let key = keys.find((item) => item.name === name)
        if (!key) {
          key = {
            name,
            kind: kind === 'PRIMARY KEY' ? 'primary' : kind === 'FOREIGN KEY' ? 'foreign' : 'unique',
            columns: []
          }
          keys.push(key)
        }
        key.columns.push(string(cell(result, row, 'column_name')))
        if (key.kind === 'foreign') {
          key.referencedTable = {
            schema: string(cell(result, row, 'foreign_schema')),
            name: string(cell(result, row, 'foreign_table')),
            kind: 'table'
          }
          ;(key.referencedColumns ??= []).push(string(cell(result, row, 'foreign_column')))
        }
      }
      if (object.kind === 'view') {
        const source = await this.raw('SELECT pg_get_viewdef($1::regclass, true) AS definition', [reference], 1)
        definition = `CREATE VIEW ${reference} AS\n${string(source.rows[0]?.[0])}`
      } else {
        definition = `CREATE TABLE ${reference} (\n${columns.map((column) => `  ${this.quote(column.name)} ${column.dataType}${column.nullable ? '' : ' NOT NULL'}${column.defaultValue === null ? '' : ` DEFAULT ${column.defaultValue}`}`).join(',\n')}\n);`
        diagnostics.push('definition_reconstructed_from_metadata')
      }
    } else {
      const source = await this.raw(`SHOW CREATE ${object.kind === 'view' ? 'VIEW' : 'TABLE'} ${reference}`, [], 1)
      definition = string(source.rows[0]?.[1])
      if (this.engine === 'doris') {
        const match = definition.match(/\b(UNIQUE|DUPLICATE|AGGREGATE)\s+KEY\s*\(([^)]*)\)/i)
        model =
          match?.[1].toUpperCase() === 'UNIQUE'
            ? 'unique'
            : match?.[1].toUpperCase() === 'DUPLICATE'
              ? 'duplicate'
              : match?.[1].toUpperCase() === 'AGGREGATE'
                ? 'aggregate'
                : undefined
        if (model === 'unique' && match)
          keys.push({
            name: 'UNIQUE KEY',
            kind: 'primary',
            columns: [...match[2].matchAll(/`((?:``|[^`])+)`/g)].map((item) => item[1].split('``').join('`'))
          })
      } else {
        const index = await this.raw(`SHOW INDEX FROM ${reference}`)
        for (const row of index.rows) {
          const name = string(cell(index, row, 'Key_name'))
          let key = keys.find((item) => item.name === name)
          if (!key) {
            key = {
              name,
              kind: name === 'PRIMARY' ? 'primary' : number(cell(index, row, 'Non_unique')) === 0 ? 'unique' : 'index',
              columns: []
            }
            keys.push(key)
          }
          key.columns.push(string(cell(index, row, 'Column_name')))
        }
        const foreign = await this.raw(
          'SELECT constraint_name,column_name,referenced_table_schema,referenced_table_name,referenced_column_name FROM information_schema.key_column_usage WHERE table_schema=? AND table_name=? AND referenced_table_name IS NOT NULL ORDER BY constraint_name,ordinal_position LIMIT 1000',
          [namespace, object.name]
        )
        for (const row of foreign.rows) {
          let key = keys.find((item) => item.name === string(row[0]))
          if (!key) {
            key = {
              name: string(row[0]),
              kind: 'foreign',
              columns: [],
              referencedTable: { database: string(row[2]), name: string(row[3]), kind: 'table' },
              referencedColumns: []
            }
            keys.push(key)
          }
          key.columns.push(string(row[1]))
          key.referencedColumns?.push(string(row[4]))
        }
      }
    }
    const editable =
      (this.engine !== 'doris' || (await this.capabilities()).writes) &&
      object.kind === 'table' &&
      keys.some(
        (key) =>
          (key.kind === 'primary' || key.kind === 'unique') &&
          key.columns.length > 0 &&
          key.columns.every((name) => columns.find((column) => column.name === name)?.nullable === false)
      )
    return { object, columns, keys, definition, model, editable, diagnostics }
  }
  async query(input: DatabaseQueryInput, signal?: AbortSignal): Promise<DatabaseResult> {
    this.assertLocation(input)
    if (input.database && input.database !== this.initial.database) throw new Error('database_requires_new_connection')
    if (input.schema && input.schema !== this.initial.schema) throw new Error('schema_requires_new_connection')
    if (this.busy) throw new Error('session_busy')
    if (input.mode === 'read') {
      requireReadStatement(input.sql)
    }
    const statements = splitWorkbenchSql(input.sql)
    if (statements.length !== 1 || statements[0].effect === 'unsupported') throw new Error('unsupported_statement')
    const limit = Math.max(1, Math.min(input.limit ?? 100, 1000)),
      offset = Math.max(0, Math.min(input.offset ?? 0, 100000))
    if (input.mode === 'write' && !(await this.capabilities()).writes)
      throw new Error('engine_version_writes_unavailable')
    if (input.mode === 'write' && offset) throw new Error('mutation_cannot_be_paginated')
    let sql = statements[0].sql
    let parameters = input.parameters
    if (input.mode === 'read' && ['SELECT', 'WITH'].includes(statements[0].words[0])) {
      if (this.engine === 'mysql') ({ sql, parameters } = paginateMysqlQuery(sql, parameters, limit, offset))
      else sql = `SELECT * FROM (\n${sql}\n) AS ${this.quote('_db_studio_page')} LIMIT ${limit + 1} OFFSET ${offset}`
    } else if (offset) throw new Error('statement_cannot_be_paginated')
    this.busy = true
    let readTransaction = false
    try {
      if (input.mode === 'read' && this.engine !== 'doris' && !this.transactionOpen) {
        await this.raw(this.engine === 'postgres' ? 'BEGIN READ ONLY' : 'START TRANSACTION READ ONLY', [], 1)
        readTransaction = true
      }
      const result = await this.raw(
        sql,
        parameters,
        limit + 1,
        signal,
        Math.max(1, Math.min(input.timeoutMs ?? 30000, 120000))
      )
      const hasMore = result.rows.length > limit || result.truncated
      return { ...result, rows: result.rows.slice(0, limit), hasMore, truncated: result.truncated }
    } finally {
      try {
        if (readTransaction) {
          try {
            await this.raw('ROLLBACK', [], 1)
          } catch {
            await this.close()
          }
        }
      } finally {
        this.busy = false
      }
    }
  }
  async explain(input: Omit<DatabaseQueryInput, 'mode'>, signal?: AbortSignal): Promise<DatabaseResult> {
    const sql = requireReadStatement(input.sql)
    if (!/^(SELECT|WITH)\b/i.test(sql)) throw new Error('explain_requires_select')
    const prefix =
      this.engine === 'postgres'
        ? 'EXPLAIN (FORMAT JSON) '
        : this.engine === 'mysql'
          ? 'EXPLAIN FORMAT=JSON '
          : 'EXPLAIN '
    return this.query({ ...input, sql: prefix + sql, mode: 'read' }, signal)
  }
  async transaction(action: 'begin' | 'commit' | 'rollback') {
    if (this.engine === 'doris') throw new Error('transactions_not_supported')
    if (this.busy) throw new Error('session_busy')
    if (action === 'begin' && this.transactionOpen) throw new Error('transaction_already_open')
    if (action !== 'begin' && !this.transactionOpen) throw new Error('transaction_not_open')
    this.busy = true
    try {
      await this.raw(action.toUpperCase(), [], 1)
      this.transactionOpen = action === 'begin'
    } finally {
      this.busy = false
    }
  }
  async importRows(input: DatabaseImportInput, signal?: AbortSignal): Promise<DatabaseImportReceipt> {
    this.assertLocation(input)
    if (this.busy) throw new Error('session_busy')
    if (!(await this.capabilities()).import) throw new Error('engine_version_import_unavailable')
    if (new Set(input.columns).size !== input.columns.length) throw new Error('duplicate_import_columns')
    if (
      !input.rows.length ||
      input.rows.length > 10000 ||
      !input.columns.length ||
      input.columns.length > 500 ||
      input.rows.some((row) => row.length !== input.columns.length)
    )
      throw new Error('invalid_import_shape')
    if (this.transport.importRows) {
      this.busy = true
      try {
        return await this.transport.importRows(input, signal)
      } finally {
        this.busy = false
      }
    }
    if (this.engine === 'doris') throw new Error('stream_load_required')
    const reference = this.ref({ ...input, name: input.table, kind: 'table' })
    await this.transaction('begin')
    try {
      for (let i = 0; i < input.rows.length; i += 100) {
        const batch = input.rows.slice(i, i + 100),
          values = batch.flat()
        let n = 0
        const placeholders = batch
          .map((row) => `(${row.map(() => (this.engine === 'postgres' ? `$${++n}` : '?')).join(',')})`)
          .join(',')
        await this.query(
          {
            sql: `INSERT INTO ${reference} (${input.columns.map((name) => this.quote(name)).join(',')}) VALUES ${placeholders}`,
            parameters: values,
            mode: 'write'
          },
          signal
        )
      }
      await this.transaction('commit')
      return {
        outcome: 'succeeded',
        loadedRows: input.rows.length,
        filteredRows: 0,
        label: input.operationId,
        diagnostics: []
      }
    } catch (error) {
      try {
        await this.transaction('rollback')
      } catch {
        await this.close()
      }
      throw error
    }
  }
  async cancel() {
    await this.close()
  }
  async close() {
    this.closed = true
    await this.transport.close()
  }
}
