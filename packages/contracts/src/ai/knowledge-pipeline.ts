import { I18nObject } from '../types'
import { IWorkflowNode, WorkflowNodeTypeEnum } from './xpert-workflow.model'

export interface IDocumentSourceProvider {
  name: string
  label: I18nObject
  icon?: {
    svg?: string
    color?: string
  }
  description?: I18nObject
  helpUrl?: string
  configSchema: any;
}


export interface IWFNDataSource extends IWorkflowNode {
  type: WorkflowNodeTypeEnum.DATASOURCE,
  
}