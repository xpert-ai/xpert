import { I18nObject } from "../types"
import { IXpertAgent } from "./xpert-agent.model"
import { TStateVariable } from "./xpert.model"

export enum WorkflowNodeTypeEnum {
  ASSIGNER = 'assigner',
  IF_ELSE = 'if-else',
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
    description: I18nObject
  }
  variables: TStateVariable[]
}

export function channelName(name: string) {
	return name.toLowerCase() + '_channel'
}