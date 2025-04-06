import { I18nObject } from "../types"
import { ApiAuthType, TErrorHandling } from "./types"
import { IXpertAgent } from "./xpert-agent.model"
import { TStateVariable, TXpertParameter } from "./xpert.model"

export enum WorkflowNodeTypeEnum {
  ASSIGNER = 'assigner',
  IF_ELSE = 'if-else',
  SPLITTER = 'splitter',
  ITERATING = 'iterating',
  ANSWER = 'answer',
  CODE = 'code',
  HTTP = 'http',
  NOTE = 'note'
}

export interface IWorkflowNode {
  id: string
  key: string
  title?: string | I18nObject
  description?: string | I18nObject
  type: WorkflowNodeTypeEnum
}

export enum VariableOperationEnum {
  APPEND = 'append',
  EXTEND = 'extend',
  OVERWRITE = 'overwrite',
  CLEAR = 'clear'
}

export type TVariableAssigner = {
  id: string
  inputType: 'variable' | 'constant'
  /**
   * value from variable
   */
  value?: string
  /**
   * value write to state's variable
   */
  variableSelector: string
  /**
   * How to write value to variable
   */
  operation: VariableOperationEnum
}

export interface IWFNAssigner extends IWorkflowNode {
  type: WorkflowNodeTypeEnum.ASSIGNER
  variables: TVariableAssigner[]
}

export interface IWFNIfElse extends IWorkflowNode {
  type: WorkflowNodeTypeEnum.IF_ELSE
  cases: TWFCase[]
}

export interface IWFNSplitter extends IWorkflowNode {
  type: WorkflowNodeTypeEnum.SPLITTER
}

export interface IWFNIterating extends IWorkflowNode {
  type: WorkflowNodeTypeEnum.ITERATING
  /**
   * Variable name of input array in state
   */
  inputVariable: string
  /**
   * Variable name of output in state
   */
  outputVariable: string
  /**
   * Execute in parallel, otherwise execute sequentially
   */
  parallel?: boolean
  /**
   * Maximum number of parallel task
   */
  maximum?: number

  /**
   * - terminate: terminate on error
   * - ignore: ignore error and continue
   * - remove: remove error output
   */
  errorMode?: 'terminate' | 'ignore' | 'remove'
}

export interface IWFNAnswer extends IWorkflowNode {
  type: WorkflowNodeTypeEnum.ANSWER
  promptTemplate: string
}

export enum WorkflowLogicalOperator {
  AND = 'and',
  OR = 'or'
}

export enum WorkflowComparisonOperator {
  CONTAINS = 'contains',
  NOT_CONTAINS = 'not-contains',
  EQUAL = 'equal',
  NOT_EQUAL = 'not-equal',
  GT = 'gt',
  LT = 'lt',
  GE = 'ge',
  LE = 'le',
  STARTS_WITH = 'starts-with',
  ENDS_WITH = 'ends-with',
  EMPTY = 'empty',
  NOT_EMPTY = 'not-empty',
}

export type TWFCaseCondition = {
  id: string
  comparisonOperator: WorkflowComparisonOperator
  value?: string
  varType?: string
  variableSelector?: string
}

export type TWFCase = {
  caseId: string
  conditions: TWFCaseCondition[]
  logicalOperator: WorkflowLogicalOperator
}

export type TWorkflowVarGroup = {
  /**
   * @deprecated use group
   */
  agent?: Partial<IXpertAgent>
  group?: {
    name: string
    description: string | I18nObject
  }
  variables: TStateVariable[]
}

export type TWorkflowRetry = {
  enabled?: boolean
  stopAfterAttempt?: number
  retryInterval?: number // second
}

export interface IWFNCode extends IWorkflowNode {
  type: WorkflowNodeTypeEnum.CODE
  language: 'python' | 'javascript'
  code: string
  inputs: {name: string; variable?: string}[]
  outputs: TXpertParameter[]
  /**
   * Retry on failure
   */
  retry?: TWorkflowRetry
  /**
   * Error handling
   */
  errorHandling?: TErrorHandling
}

// Http workflow node
export type BodyType = 'none' | 'form-data' | 'x-www-form-urlencoded' | 'json' | 'raw' | 'binary';
interface HttpParam {
  key: string;
  value: string;
}
interface HttpHeader {
  name: string;
  value: string;
}

export type TWorkflowAuthorization = {
  auth_type?: ApiAuthType
  api_key_type?: '' | 'bearar' | 'custom'
  api_key_header?: string
  api_key_value?: string
  username?: string
  password?: string
}

export interface IWFNHttp extends IWorkflowNode {
  type: WorkflowNodeTypeEnum.HTTP
  authorization?: TWorkflowAuthorization
  method: 'get' | 'post' | 'put' | 'delete' | 'patch' | 'head'
  url: string
  headers: HttpHeader[]
  params: HttpParam[]
  body: {
    type?: BodyType
    body?: string; // 如果是 JSON 类型
    encodedForm?: HttpParam[]
  }
  connectionTimeout?: number
  readTimeout?: number
  writeTimeout?: number
  /**
   * Retry on failure
   */
  retry?: TWorkflowRetry
  /**
   * Error handling
   */
  errorHandling?: TErrorHandling
}

export function channelName(name: string) {
	return name.toLowerCase() + '_channel'
}


export function isAgentKey(key: string) {
  return key?.toLowerCase().startsWith('agent_')
}

export function isRouterKey(key: string) {
  return key?.toLowerCase().startsWith('router_')
}

export function isIteratingKey(key: string) {
  return key?.toLowerCase().startsWith('iterating_')
}

export function isWorkflowKey(key: string) {
  return isRouterKey(key) || isIteratingKey(key)
}