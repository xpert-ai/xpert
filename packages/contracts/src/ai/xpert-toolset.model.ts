import { AiProviderRole } from './copilot.model'
import { TAvatar } from '../types'
import { IXpertTool, XpertToolType } from './xpert-tool.model'
import { IBasePerWorkspaceEntityModel } from './xpert-workspace.model'
import { ITag } from '../tag-entity.model'
import { TCopilotModel } from './copilot-model.model'
import { Subscriber } from 'rxjs'
import { I18nObject } from '../types'


export enum XpertToolsetCategoryEnum {
  BUILTIN = 'builtin',
  API = 'api',
  /**
   * [Anthropic Model Context Protocol (MCP)](https://modelcontextprotocol.io/introduction)
   */
  MCP = 'mcp',
  /**
   * @deprecated
   */
  WORKFLOW = 'workflow'
}

export type XpertToolsetType = string
export type TXpertToolset = {
  key?: string
  /**
   * toolset name
   */
  name: string
  type?: XpertToolsetType
  category?: 'command' | XpertToolsetCategoryEnum
  description?: string
  /**
   * avatar object
   */
  avatar?: TAvatar
  /**
   * Priority role of AI provider
   * @default `AiProviderRole.Secondary`
   */
  aiProviderRole?: AiProviderRole

  /**
   * Privacy policy of this toolset
   */
  privacyPolicy?: string
  /**
   * Custom disclaimer for the toolset
   */
  customDisclaimer?: string

  options?: TXpertToolsetOptions
  credentials?: TToolCredentials
  schema?: string
  schemaType?: 'openapi_json' | 'openapi_yaml'

  tools?: IXpertTool[]

  tags?: ITag[]
}

/**
 * Toolset for Xpert
 */
export interface IXpertToolset extends IBasePerWorkspaceEntityModel, TXpertToolset {}

export type TXpertToolsetOptions = {
  provider?: IToolProvider
  baseUrl?: string
  toolPositions?: Record<string, number>
  disableToolDefault?: boolean
  needSandbox?: boolean
  [key: string]: any
}

/**
 * Context env when tool call in langchain.js
 */
export type XpertToolContext = {
  tenantId: string
  organizationId?: string
  userId: string
  copilotModel: TCopilotModel
  chatModel: unknown // BaseChatModel in langchain
  tool_call_id: string
  subscriber: Subscriber<MessageEvent>
}

export enum CredentialsType {
  SECRET_INPUT = 'secret-input',
  TEXT_INPUT = 'text-input',
  SELECT = 'select',
  REMOTE_SELECT = 'remote-select',
  COPILOT_MODEL = 'copilot-model',
  BOOLEAN = 'boolean',
  INT = 'int',
  NUMBER = 'number'
}

export interface ToolCredentialsOption {
  value: string
  label: I18nObject | string
}

export interface ToolProviderCredentials {
  name: string
  type: CredentialsType
  required?: boolean
  default?: number | string
  options?: ToolCredentialsOption[]
  /**
   * Url for fetch remote select options
   */
  selectUrl?: string
  /**
   * Is multiple select
   */
  multi?: boolean
  /**
   * Depends on credentials
   */
  depends?: string[]
  label?: I18nObject
  help?: I18nObject
  /**
   * Url for help document
   */
  url?: string
  placeholder?: I18nObject
  max?: number
}

export enum ApiProviderSchemaType {
  /**
   * Enum class for api provider schema type.
   */
  OPENAPI = "openapi",
  SWAGGER = "swagger",
  OPENAI_PLUGIN = "openai_plugin",
  OPENAI_ACTIONS = "openai_actions"
}

export enum ToolTagEnum {
	SEARCH = 'search',
	IMAGE = 'image',
	VIDEOS = 'videos',
	WEATHER = 'weather',
	FINANCE = 'finance',
	DESIGN = 'design',
	TRAVEL = 'travel',
	SOCIAL = 'social',
	NEWS = 'news',
	MEDICAL = 'medical',
	PRODUCTIVITY = 'productivity',
	EDUCATION = 'education',
	BUSINESS = 'business',
	ENTERTAINMENT = 'entertainment',
	UTILITIES = 'utilities',
	ANALYSIS = 'analysis',
	SANDBOX = 'sandbox',
	AGENT = 'agent',
	OTHER = 'other'
}

export interface IToolTag {
	name: string
	label: I18nObject
	icon: string
  description?: I18nObject
}

export interface IToolProvider {
  not_implemented?: boolean
  pro?: boolean
  id: string;
  author: string;
  name: string; // identifier
  description: I18nObject;
  /**
   * @deprecated use avatar
   */
  icon?: string;
  avatar: TAvatar
  label: I18nObject; // label
  help_url?: string
  type: XpertToolsetCategoryEnum;
  masked_credentials?: Record<string, any>
  original_credentials?: Record<string, any>
  is_team_authorization: boolean
  allow_delete: boolean
  tools?: XpertToolType[]
  tags: ToolTagEnum[];
}

export type TToolCredentials = Record<string, string | number | boolean | any>

export type TToolsetParams = {
  tenantId: string
  organizationId?: string
	xpertId?: string
  conversationId?: string
	agentKey?: string
	signal?: AbortSignal
	env: Record<string, unknown>
}

export interface IBaseToolset {
  toolNamePrefix?: string
}