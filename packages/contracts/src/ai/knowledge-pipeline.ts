import { I18nObject } from '../types'
import { ICopilotModel } from './copilot-model.model'
import { IWorkflowNode, WorkflowNodeTypeEnum } from './xpert-workflow.model'

export interface IDocumentNodeProvider {
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

// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface IDocumentSourceProvider extends IDocumentNodeProvider {}

// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface IDocumentProcessorProvider extends IDocumentNodeProvider {}

// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface IDocumentChunkerProvider extends IDocumentNodeProvider {}

// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface IDocumentUnderstandingProvider extends IDocumentNodeProvider {

}


/**
 * Knowledge Pipeline Source Node
 */
export interface IWFNSource extends IWorkflowNode {
  type: WorkflowNodeTypeEnum.SOURCE,
  provider: string
  config: any;
}

export interface IWFNProcessor extends IWorkflowNode {
  type: WorkflowNodeTypeEnum.PROCESSOR,
  provider: string
  config: any;
  input: string
}

export interface IWFNChunker extends IWorkflowNode {
  type: WorkflowNodeTypeEnum.CHUNKER,
  provider: string
  config: any;
  input: string
}

export interface IWFNUnderstanding extends IWorkflowNode {
  type: WorkflowNodeTypeEnum.UNDERSTANDING,
  provider: string
  config: any;
  input: string
  visionModel?: ICopilotModel
}
