import { I18nObject, letterStartSUID } from '../types'
import { ICopilotModel } from './copilot-model.model'
import { KnowledgeStructureEnum } from './knowledgebase.model'
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

export enum DocumentSourceProviderCategoryEnum {
  LocalFile = 'local-file',
  RemoteFile = 'remote-file',
  WebCrawl = 'web-crawl',
  Database = 'database'
}

export interface IDocumentSourceProvider extends IDocumentNodeProvider {
  category: DocumentSourceProviderCategoryEnum
}

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
  integrationId?: string
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

export interface IWFNKnowledgeBase extends IWorkflowNode {
  type: WorkflowNodeTypeEnum.KNOWLEDGE_BASE,
  structure?: KnowledgeStructureEnum
  /**
   * Documents input variable
   */
  input?: string
  /**
   * Embedding model
   */
  copilotModel?: ICopilotModel
  /**
   * (optional) Rerank model
   */
  rerankModel?: ICopilotModel
  documents?: string[]
}

export function genPipelineSourceKey() {
  return letterStartSUID('Source_')
}
export function genPipelineProcessorKey() {
  return letterStartSUID('Processor_')
}
export function genPipelineChunkerKey() {
  return letterStartSUID('Chunker_')
}
export function genPipelineUnderstandingKey() {
  return letterStartSUID('Understanding_')
}
export function genPipelineKnowledgeBaseKey() {
  return letterStartSUID('KnowledgeBase_')
}