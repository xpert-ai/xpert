import { I18nObject } from "../types"
import { ICopilotModel } from "./copilot-model.model"
import { TKBRecallParams } from "./knowledgebase.model"
import { ApiAuthType, TErrorHandling, TXpertRefParameter } from "./types"
import { TStateVariable, TXpertParameter } from "./xpert.model"

export enum WorkflowNodeTypeEnum {
  /**
   * Trigger
   */
  TRIGGER = 'trigger',
  /**
   * State Variable Assigner
   */
  ASSIGNER = 'assigner',
  /**
   * Router
   */
  IF_ELSE = 'if-else',
  SPLITTER = 'splitter',
  ITERATING = 'iterating',
  ANSWER = 'answer',
  CODE = 'code',
  HTTP = 'http',
  KNOWLEDGE = 'knowledge',
  SUBFLOW = 'subflow',
  TEMPLATE = 'template',
  CLASSIFIER = 'classifier',
  TOOL = 'tool',
  AGENT_TOOL = 'agent-tool',
  NOTE = 'note',
  /**
   * Task node, distribute tasks to sub-agents
   */
  TASK = 'task'
}

export interface IWorkflowNode {
  id: string
  key: string
  title?: string
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
  inputType: 'variable' | 'constant' | 'message'
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

  /**
   * The message template to write to messages variable
   */
  messages?: {role: string; content: string}[]
}

export interface IWFNAssigner extends IWorkflowNode {
  type: WorkflowNodeTypeEnum.ASSIGNER
  assigners: TVariableAssigner[]
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
  inputParams?: TXpertRefParameter[]
  outputParams?: TXpertRefParameter[]
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

/**
 * The parameter name that represents the entire current element in array
 */
export const IteratingItemParameterName = '$item'
export const IteratingIndexParameterName = '$index'

export interface IWFNAnswer extends IWorkflowNode {
  type: WorkflowNodeTypeEnum.ANSWER
  promptTemplate: string
  mute?: boolean
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
  IS_TRUE = 'is-true',
  IS_FALSE = 'is-false'
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
  // /**
  //  * @deprecated use group
  //  */
  // agent?: Partial<IXpertAgent>
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
  api_key_type?: '' | 'bearer' | 'custom'
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

export interface IWFNKnowledgeRetrieval extends IWorkflowNode {
  queryVariable: string
  knowledgebases: string[]
  recall?: TKBRecallParams
}

export interface IWFNSubflow extends IWorkflowNode {
  inputParams?: TXpertRefParameter[]
  outputParams?: TXpertRefParameter[]
}

export interface IWFNTemplate extends IWorkflowNode {
  type: WorkflowNodeTypeEnum.TEMPLATE,
  inputParams?: TXpertRefParameter[]
  code: string
  
  /**
   * Error handling
   */
  errorHandling?: TErrorHandling
}

export interface IWFNClassifier extends IWorkflowNode {
  type: WorkflowNodeTypeEnum.CLASSIFIER
  copilotModel: ICopilotModel
  inputVariables: string[]
  classes: {
    description?: string
  }[]
  instruction?: string
}

export interface IWFNClassifier extends IWorkflowNode {
  type: WorkflowNodeTypeEnum.CLASSIFIER
  copilotModel: ICopilotModel
  inputVariables: string[]
  classes: {
    description?: string
  }[]
  instruction?: string
}

export interface IWFNTemplate extends IWorkflowNode {
  type: WorkflowNodeTypeEnum.TEMPLATE,
  inputParams?: TXpertRefParameter[]
  code: string
  
  /**
   * Error handling
   */
  errorHandling?: TErrorHandling
}

export interface IWFNTool extends IWorkflowNode {
  type: WorkflowNodeTypeEnum.TOOL,
  toolsetId: string
  toolName: string
  /**
   * @deprecated Use parameters instead
   */
  parameterVariable: string
  parameters?: any
  omitBlankValues?: boolean
  
  /**
   * Error handling
   */
  errorHandling?: TErrorHandling
}

export interface IWFNNote extends IWorkflowNode {
  content: string
}

export interface IWFNAgentTool extends IWorkflowNode {
  type: WorkflowNodeTypeEnum.AGENT_TOOL,
  // Tool name
  toolName: string
  // Tool description
  toolDescription?: string
  // Tool schema
  toolParameters?: TXpertParameter[]

  /**
   * End point tool
   */
  isEnd?: boolean

  /**
   * @deprecated Mixed sub-processes are not suitable for catching exceptions unless they are implemented using a separate subgraph
   * Error handling
   */
  errorHandling?: TErrorHandling
}

export interface IWFNTrigger extends IWorkflowNode {
  type: WorkflowNodeTypeEnum.TRIGGER,
  from: 'chat' | 'integration' | 'scheduler'
  parameters?: TXpertParameter[]
}

export interface IWFNTask extends IWorkflowNode {
  type: WorkflowNodeTypeEnum.TASK,
  descriptionPrefix?: string
  descriptionSuffix?: string
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

export function workflowNodeIdentifier(node: IWorkflowNode) {
  return node.title || node.key
}