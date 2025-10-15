import { I18nObject, IconDefinition, letterStartSUID } from '../types'
import { ICopilotModel } from './copilot-model.model'
import { KnowledgeStructureEnum } from './knowledgebase.model'
import { IWorkflowNode, WorkflowNodeTypeEnum } from './xpert-workflow.model'
import { TXpertParameter } from './xpert.model'

export interface IDocumentNodeProvider {
  name: string
  label: I18nObject
  icon?: IconDefinition
  description?: I18nObject
  helpUrl?: string
  configSchema: any;
}

/**
 * Category of document source provider
 */
export enum DocumentSourceProviderCategoryEnum {
  /**
   * Local files uploaded directly to the system
   */
  LocalFile = 'local-file',

  /**
   * Remote file systems, e.g. S3, FTP, etc.
   */
  FileSystem = 'file-system',

  /**
   * Online documents, e.g. public URLs, Google Docs, etc.
   */
  OnlineDocument = 'online-document',

  /**
   * Web crawling from public websites
   */
  WebCrawl = 'web-crawl',

  /**
   * Database connections, e.g. MySQL, PostgreSQL, etc.
   * @deprecated Planning
   */
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
  parameters?: TXpertParameter[];
  config: any;
  integrationId?: string
}

export interface IWFNProcessor extends IWorkflowNode {
  type: WorkflowNodeTypeEnum.PROCESSOR,
  provider: string
  config: any;
  input: string
  integrationId?: string
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
   * Documents input variables
   */
  inputs?: string[]
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