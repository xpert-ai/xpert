import type { I18nObject } from '../types'
import type { JsonSchemaObjectType } from '../ai/types'

export type XpertViewHostType = 'integration' | 'knowledgebase' | 'agent' | 'project' | 'sandbox' | string

export type XpertViewSlotMode = 'tabs' | 'sections' | 'widgets' | 'sidebar'

export type XpertViewSchemaType = 'stats' | 'table' | 'list' | 'detail' | 'raw_json' | 'remote_component'

export type XpertViewValueType = 'text' | 'number' | 'status' | 'datetime' | 'json'

export type XpertViewColumnDataType = 'text' | 'number' | 'date' | 'datetime' | 'status' | 'tag' | 'avatar' | 'link'

export type XpertViewActionPlacement = 'toolbar' | 'row'

export type XpertViewActionType = 'invoke' | 'navigate' | 'open_detail' | 'refresh'

export type XpertViewActionTransport = 'json' | 'file'

export type XpertViewSortDirection = 'asc' | 'desc'

export type XpertViewFilterOperator =
  | 'eq'
  | 'neq'
  | 'contains'
  | 'starts_with'
  | 'ends_with'
  | 'in'
  | 'gt'
  | 'gte'
  | 'lt'
  | 'lte'

export type XpertViewScalar = string | number | boolean | null

export interface XpertViewHostContext {
  tenantId: string
  organizationId?: string | null
  workspaceId?: string | null
  userId: string
  hostType: XpertViewHostType
  hostId: string
  module?: string
  route?: string
  permissions?: string[]
  locale?: string
}

export interface XpertViewHostCapabilities {
  features?: string[]
}

export type XpertViewHostState = Record<string, unknown>

export interface XpertResolvedViewHostContext extends XpertViewHostContext {
  slots: XpertViewSlot[]
  hostSnapshot?: unknown
  capabilities?: XpertViewHostCapabilities
  hostState?: XpertViewHostState
}

export interface XpertViewSlot {
  key: string
  title?: I18nObject
  mode: XpertViewSlotMode
  order?: number
}

export interface XpertViewSource {
  provider: string
  plugin?: string
  version?: string
}

export interface XpertViewBadge {
  type: 'count' | 'status' | 'text'
  value?: string | number
}

export interface XpertViewPolling {
  enabled: boolean
  intervalMs?: number
}

export interface XpertViewActivation {
  requiredFeatures?: string[]
}

export interface XpertWorkbenchViewOptions {
  fixed?: boolean
  menu?: {
    enabled?: boolean
    label?: string | I18nObject
    order?: number
    icon?: string
  }
}

export interface XpertViewCachePolicy {
  enabled?: boolean
  ttlMs?: number
}

export interface XpertViewQuerySchema {
  supportsPagination?: boolean
  supportsSearch?: boolean
  supportsSort?: boolean
  supportsFilter?: boolean
  supportsCursor?: boolean
  supportsSelection?: boolean
  supportsParameters?: boolean
  defaultPageSize?: number
}

export interface XpertViewDataSource {
  mode: 'platform'
  querySchema?: XpertViewQuerySchema
  cache?: XpertViewCachePolicy
  polling?: XpertViewPolling
}

export interface XpertViewFilter {
  key: string
  operator?: XpertViewFilterOperator
  value: XpertViewScalar | XpertViewScalar[]
}

export interface XpertViewQuery {
  page?: number
  pageSize?: number
  cursor?: string
  search?: string
  sortBy?: string
  sortDirection?: XpertViewSortDirection
  filters?: XpertViewFilter[]
  selectionId?: string
  parameters?: Record<string, XpertViewScalar | XpertViewScalar[]>
}

export interface XpertStatsViewSchema {
  type: 'stats'
  items: Array<{
    key: string
    label: I18nObject
    valueType?: XpertViewValueType
  }>
}

export interface XpertTableViewSchema {
  type: 'table'
  columns: Array<{
    key: string
    label: I18nObject
    dataType?: XpertViewColumnDataType
    width?: string
    sortable?: boolean
    searchable?: boolean
  }>
  pagination?: {
    enabled: boolean
    pageSize?: number
  }
  search?: {
    enabled: boolean
    placeholder?: I18nObject
  }
}

export interface XpertListViewSchema {
  type: 'list'
  item: {
    titleKey: string
    subtitleKey?: string
    descriptionKey?: string
    metaKeys?: string[]
  }
  pagination?: {
    enabled: boolean
    pageSize?: number
  }
  search?: {
    enabled: boolean
    placeholder?: I18nObject
  }
}

export interface XpertDetailViewSchema {
  type: 'detail'
  fields: Array<{
    key: string
    label: I18nObject
    dataType?: XpertViewValueType
  }>
}

export interface XpertRawJsonViewSchema {
  type: 'raw_json'
}

export interface XpertRemoteComponentViewSchema {
  type: 'remote_component'
  runtime: 'react'
  protocolVersion: 1
  component: {
    isolation: 'iframe' | 'module_federation'
    entry: string
    module?: string
    exportName?: string
    integrity?: string
    propsSchema?: JsonSchemaObjectType
  }
  dataSource: {
    mode: 'platform'
  }
  actions?: XpertViewActionDefinition[]
}

export interface XpertRemoteComponentEntry {
  html: string
  contentType?: 'text/html; charset=utf-8'
}

export type XpertViewSchema =
  | XpertStatsViewSchema
  | XpertTableViewSchema
  | XpertListViewSchema
  | XpertDetailViewSchema
  | XpertRawJsonViewSchema
  | XpertRemoteComponentViewSchema

export interface XpertViewParameterDefinition {
  key: string
  label: I18nObject
  description?: I18nObject
  required?: boolean
  type?: 'string' | 'number' | 'boolean'
  optionSource?: {
    mode: 'provider'
    searchable?: boolean
    preload?: boolean
    dependsOn?: string[]
  }
}

export interface XpertViewParameterOption {
  value: XpertViewScalar
  label: string
  description?: string | null
  disabled?: boolean
}

export interface XpertViewParameterOptionsQuery {
  search?: string
  parameters?: Record<string, XpertViewScalar | XpertViewScalar[]>
}

export interface XpertViewParameterOptionsResult {
  items: XpertViewParameterOption[]
}

export interface XpertViewActionDefinition {
  key: string
  label: I18nObject
  icon?: string
  placement?: XpertViewActionPlacement
  actionType: XpertViewActionType
  transport?: XpertViewActionTransport
  inputSchema?: JsonSchemaObjectType
  inputDefaults?: 'target' | Record<string, unknown>
  confirm?: {
    title?: I18nObject
    message?: I18nObject
  }
  permissions?: string[]
}

export interface XpertViewClientCommandDefinition {
  key: string
  label?: I18nObject
  description?: I18nObject
  permissions?: string[]
}

export interface XpertExtensionViewManifest {
  key: string
  title: I18nObject
  description?: I18nObject
  icon?: string
  hostType: XpertViewHostType
  slot: string
  order?: number
  visible?: boolean
  source: XpertViewSource
  permissions?: string[]
  badge?: XpertViewBadge
  refreshable?: boolean
  polling?: XpertViewPolling
  activation?: XpertViewActivation
  workbench?: XpertWorkbenchViewOptions
  view: XpertViewSchema
  dataSource: XpertViewDataSource
  parameters?: XpertViewParameterDefinition[]
  actions?: XpertViewActionDefinition[]
  clientCommands?: XpertViewClientCommandDefinition[]
}

export interface XpertViewActionRequest {
  targetId?: string
  input?: Record<string, unknown> | null
  parameters?: Record<string, XpertViewScalar | XpertViewScalar[]>
}

export interface XpertViewDataResult<TItem = unknown, TSummary = unknown> {
  items?: TItem[]
  item?: TItem
  total?: number
  nextCursor?: string
  summary?: TSummary
  meta?: unknown
}

export interface XpertViewActionResult<TData = unknown> {
  success: boolean
  message?: I18nObject
  data?: TData
  refresh?: boolean
}
