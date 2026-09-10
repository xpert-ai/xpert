import {
    ICopilotModel,
    IKnowledgebase,
    IXpert,
    KnowledgebaseTypeEnum,
    normalizeKnowledgebaseWikiConfig
} from '@xpert-ai/contracts'
import { Exclude, Expose, Transform, TransformFnParams } from 'class-transformer'

type KnowledgebaseDTOInput = Omit<Partial<IKnowledgebase>, 'type'> & {
    type?: KnowledgebaseTypeEnum | null
}

@Exclude()
class KnowledgebaseModelDetailDTO implements Partial<ICopilotModel> {
    @Expose()
    declare id: string

    @Expose()
    declare modelType?: ICopilotModel['modelType']

    @Expose()
    declare model?: string

    @Expose()
    declare copilotId?: string

    @Expose()
    declare referencedId?: string

    @Expose()
    declare options?: ICopilotModel['options']

    constructor(partial: Partial<ICopilotModel>) {
        Object.assign(this, partial)
    }
}

@Exclude()
class KnowledgebaseLinkedXpertDTO implements Partial<IXpert> {
    @Expose()
    declare id: string

    @Expose()
    declare slug: string

    @Expose()
    declare name: string

    @Expose()
    declare description?: string

    constructor(partial: Partial<IXpert>) {
        Object.assign(this, partial)
    }
}

@Exclude()
class KnowledgebasePipelineDetailDTO implements Partial<IXpert> {
    @Expose()
    declare id: string

    @Expose()
    declare publishAt?: Date

    @Expose()
    declare version?: string

    @Expose()
    declare graph?: IXpert['graph']

    constructor(partial: Partial<IXpert>) {
        Object.assign(this, partial)
    }
}

@Exclude()
export class KnowledgebaseDetailDTO implements Partial<IKnowledgebase> {
    @Expose()
    declare id: string

    @Expose()
    declare name: string

    @Expose()
    declare type: IKnowledgebase['type']

    @Expose()
    declare faqConfig?: IKnowledgebase['faqConfig']

    @Expose()
    declare wikiConfig?: IKnowledgebase['wikiConfig']

    @Expose()
    declare wikiStatus?: IKnowledgebase['wikiStatus']

    @Expose()
    declare wikiAvailability?: IKnowledgebase['wikiAvailability']

    @Expose()
    declare canManageWiki?: boolean

    @Expose()
    declare canManageDocumentDeletions?: boolean

    declare applicationTags?: string[]

    @Expose()
    declare structure?: IKnowledgebase['structure']

    @Expose()
    declare language?: IKnowledgebase['language']

    @Expose()
    declare avatar?: IKnowledgebase['avatar']

    @Expose()
    declare description?: string

    @Expose()
    declare permission?: IKnowledgebase['permission']

    @Expose()
    declare copilotModelId?: string

    @Expose()
    declare chatModelId?: string | null

    @Expose()
    declare wikiModelId?: string | null

    @Expose()
    declare rerankModelId?: string

    @Expose()
    declare visionModelId?: string

    @Expose()
    declare documentNum?: number | null

    @Expose()
    declare tokenNum?: number | null

    @Expose()
    declare chunkNum?: number | null

    @Expose()
    declare recall?: IKnowledgebase['recall']

    @Expose()
    declare parserConfig?: IKnowledgebase['parserConfig']

    @Expose()
    declare status?: IKnowledgebase['status']

    @Expose()
    declare embeddingRebuildError?: string | null

    @Expose()
    declare metadataSchema?: IKnowledgebase['metadataSchema']

    @Expose()
    declare apiEnabled?: boolean

    @Expose()
    declare incrementalSyncEnabled?: boolean

    @Expose()
    declare graphRag?: IKnowledgebase['graphRag']

    @Expose()
    declare graphStatus?: IKnowledgebase['graphStatus']

    @Expose()
    declare graphRevision?: number | null

    @Expose()
    declare graphIndexError?: string | null

    @Expose()
    declare workspaceId?: string | null

    @Expose()
    declare pipelineId?: string

    @Expose()
    declare integrationId?: string

    @Expose()
    @Transform((params: TransformFnParams) => (params.value ? new KnowledgebaseModelDetailDTO(params.value) : null))
    declare copilotModel?: ICopilotModel

    @Expose()
    @Transform((params: TransformFnParams) => (params.value ? new KnowledgebaseModelDetailDTO(params.value) : null))
    declare chatModel?: ICopilotModel | null

    @Expose()
    @Transform((params: TransformFnParams) => (params.value ? new KnowledgebaseModelDetailDTO(params.value) : null))
    declare wikiModel?: ICopilotModel | null

    @Expose()
    @Transform((params: TransformFnParams) => (params.value ? new KnowledgebaseModelDetailDTO(params.value) : null))
    declare rerankModel?: ICopilotModel

    @Expose()
    @Transform((params: TransformFnParams) => (params.value ? new KnowledgebaseModelDetailDTO(params.value) : null))
    declare visionModel?: ICopilotModel

    @Expose()
    @Transform((params: TransformFnParams) =>
        params.value?.map((item: IXpert) => new KnowledgebaseLinkedXpertDTO(item))
    )
    declare xperts?: IXpert[]

    @Expose()
    @Transform((params: TransformFnParams) => (params.value ? new KnowledgebasePipelineDetailDTO(params.value) : null))
    declare pipeline?: IXpert

    constructor(partial: KnowledgebaseDTOInput) {
        Object.assign(this, partial)
        this.type = partial.type ?? KnowledgebaseTypeEnum.Standard
        this.wikiConfig = normalizeKnowledgebaseWikiConfig(partial.wikiConfig)
        if (!this.wikiConfig.enabled) {
            this.wikiStatus = 'disabled'
            this.wikiAvailability = 'unavailable'
        } else {
            this.wikiStatus = partial.wikiStatus ?? 'rebuild_required'
            this.wikiAvailability = partial.wikiAvailability ?? 'unavailable'
        }
    }
}
