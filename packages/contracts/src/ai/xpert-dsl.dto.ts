import { Exclude, Expose, Transform } from 'class-transformer'
import { ITag } from '../tag-entity.model'
import { TAvatar } from '../types'
import { ICopilotModel, TCopilotModel, TCopilotModelOptions } from './copilot-model.model'
import { IKnowledgebase } from './knowledgebase.model'
import { IXpertAgent, TXpertAgent, TXpertAgentOptions } from './xpert-agent.model'
import { IXpertToolset } from './xpert-toolset.model'
import {
  IXpert,
  TXpertOptions,
  TXpertParameter,
  TXpertTeamConnection,
  TXpertTeamDraft,
  TXpertTeamNode,
  XpertTypeEnum
} from './xpert.model'
import { ICopilot } from './copilot.model'
import { AiModelTypeEnum } from './ai-model.model'

// DTO

@Exclude()
export class XpertDslDTO {
  @Expose()
  name: string

  @Expose()
  type: XpertTypeEnum

  @Expose()
  title?: string

  @Expose()
  description?: string

  @Expose()
  avatar?: TAvatar

  @Expose()
  starters?: string[]

  @Expose()
  options?: TXpertOptions

  @Expose()
  version?: string

  @Expose()
  @Transform(({ value }) => new XpertAgentDslDTO(value))
  agent?: IXpertAgent

  @Expose()
  @Transform(({value}) => new CopilotModelDslDTO(value))
  copilotModel?: ICopilotModel

  @Expose()
  knowledgebases?: IKnowledgebase[]

  @Expose()
  toolsets?: IXpertToolset[]

  @Expose()
  tags?: ITag[]

  constructor(partial: Partial<XpertDslDTO>) {
    Object.assign(this, partial)
  }
}

@Exclude()
export class XpertDraftDslDTO implements TXpertTeamDraft {
  @Expose()
  @Transform(({ value }) => new XpertDslDTO(value))
  team: Partial<IXpert>

  @Expose()
  @Transform(({ value }) => value?.map((node) => {
    switch(node.type) {
      case 'agent': {
        return {
          ...node,
          entity: new XpertAgentDslDTO(node.entity)
        }
      }
      default: {
        return node
      }
    }
  }))
  nodes: TXpertTeamNode[]

  @Expose()
  connections: TXpertTeamConnection[]

  constructor(partial: Partial<XpertDraftDslDTO>) {
    Object.assign(this, partial)
  }
}

@Exclude()
export class XpertAgentDslDTO implements TXpertAgent {
  @Expose()
  key: string

  @Expose()
  name?: string

  @Expose()
  title?: string

  @Expose()
  description?: string

  @Expose()
  avatar?: TAvatar

  @Expose()
  prompt?: string

  @Expose()
  parameters?: TXpertParameter[]

  @Expose()
  options?: TXpertAgentOptions

  @Expose()
  @Transform(({value}) => new CopilotModelDslDTO(value))
  copilotModel?: ICopilotModel

  @Expose()
  leaderKey?: string

  @Expose()
  collaboratorNames?: string[]

  @Expose()
  toolsetIds?: string[]

  @Expose()
  knowledgebaseIds?: string[]

  constructor(partial: Partial<XpertAgentDslDTO>) {
    Object.assign(this, partial)
  }
}

@Exclude()
export class CopilotModelDslDTO implements TCopilotModel {

  @Expose()
  copilot?: ICopilot

  @Expose()
  modelType?: AiModelTypeEnum

  @Expose()
  model?: string

  @Expose()
  options?: TCopilotModelOptions

  constructor(partial: Partial<CopilotModelDslDTO>) {
    Object.assign(this, partial)
  }
}