/** Shared wire contract. Credentials and driver objects never cross this boundary. */
export type DatabaseEngine = 'doris' | 'mysql' | 'postgres'
export type DatabaseValue = string | number | boolean | null
export type DatabaseObjectKind = 'table' | 'view'
export interface DatabaseLocation {
  database?: string
  schema?: string
  /** Doris external catalog; legacy QueryOptions.catalog continues to mean database. */
  engineCatalog?: string
}
export interface DatabaseObjectRef extends DatabaseLocation {
  name: string
  kind: DatabaseObjectKind
}
export interface DatabaseColumn {
  id: string
  name: string
  dataType: string
  nullable?: boolean
  ordinal?: number
  defaultValue?: string | null
  comment?: string
  sourceColumn?: string
  sourceTable?: string
}
export interface DatabaseKey {
  name: string
  kind: 'primary' | 'unique' | 'index' | 'foreign'
  columns: string[]
  referencedTable?: DatabaseObjectRef
  referencedColumns?: string[]
}
export interface DatabaseObjectDetail {
  object: DatabaseObjectRef
  columns: DatabaseColumn[]
  keys: DatabaseKey[]
  definition: string
  model?: 'unique' | 'duplicate' | 'aggregate'
  editable: boolean
  diagnostics: string[]
}
export interface DatabaseCapabilities {
  engine: DatabaseEngine
  version: string
  query: boolean
  explain: boolean
  transactions: boolean
  cancel: boolean
  import: boolean
  writes: boolean
  nativeReadOnly: boolean
  objectKinds: DatabaseObjectKind[]
  diagnostics: string[]
}
export interface DatabaseResult {
  columns: DatabaseColumn[]
  rows: DatabaseValue[][]
  affectedRows?: number
  durationMs: number
  hasMore: boolean
  truncated: boolean
  /** Driver-derived state, never inferred from HTTP success. */
  outcome: 'succeeded' | 'pending' | 'unknown'
  diagnostics: string[]
}
export interface DatabaseQueryInput extends DatabaseLocation {
  sql: string
  parameters?: DatabaseValue[]
  mode: 'read' | 'write'
  limit?: number
  offset?: number
  timeoutMs?: number
}
export interface DatabaseImportInput extends DatabaseLocation {
  table: string
  columns: string[]
  rows: DatabaseValue[][]
  operationId: string
}
export interface DatabaseImportReceipt {
  outcome: 'succeeded' | 'pending' | 'unknown'
  loadedRows?: number
  filteredRows?: number
  label: string
  diagnostics: string[]
}
export interface DatabaseObjectPage {
  items: DatabaseObjectRef[]
  page: number
  pageSize: number
  hasMore: boolean
}
export interface DatabaseWorkbenchAdapter {
  readonly engine: DatabaseEngine
  capabilities(): Promise<DatabaseCapabilities>
  locations(): Promise<DatabaseLocation[]>
  objects(input: DatabaseLocation & { search?: string; page?: number; pageSize?: number }): Promise<DatabaseObjectPage>
  describe(object: DatabaseObjectRef): Promise<DatabaseObjectDetail>
  query(input: DatabaseQueryInput, signal?: AbortSignal): Promise<DatabaseResult>
  explain(input: Omit<DatabaseQueryInput, 'mode'>, signal?: AbortSignal): Promise<DatabaseResult>
  transaction(action: 'begin' | 'commit' | 'rollback'): Promise<void>
  cancel(): Promise<void>
  importRows(input: DatabaseImportInput, signal?: AbortSignal): Promise<DatabaseImportReceipt>
  close(): Promise<void>
}
export interface DataSourceActor {
  tenantId: string
  organizationId: string
  userId: string
}
export interface DataSourceSummary {
  id: string
  name: string
  engine: DatabaseEngine
}
export interface DataSourceWorkbenchScope {
  location?: DatabaseLocation
  actor: DataSourceActor
  dataSourceId: string
}
export interface DataSourceRuntimeApi {
  list(actor: DataSourceActor): Promise<DataSourceSummary[]>
  open(input: DataSourceWorkbenchScope): Promise<DatabaseWorkbenchAdapter>
}
export const DataSourceRuntimeCapability = Object.freeze({
  id: 'platform.datasource.workbench',
  description: 'Scoped database workbench access; credentials remain host-owned.',
  __type: undefined as DataSourceRuntimeApi | undefined
})
