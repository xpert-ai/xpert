import {
    IKnowledgebase,
    IUser,
    KBMetadataFieldDef,
    KnowledgebaseFAQConfig,
    KnowledgebasePermission,
    KnowledgebaseStatusEnum,
    KnowledgebaseTypeEnum,
    TAvatar
} from '@xpert-ai/contracts'
import { Exclude, Expose } from 'class-transformer'

type KnowledgebaseDTOInput = Omit<Partial<IKnowledgebase>, 'type'> & {
    type?: KnowledgebaseTypeEnum | null
}

@Exclude()
export class KnowledgebasePublicDTO implements Partial<IKnowledgebase> {
    @Expose()
    applicationTags?: string[]
    @Expose()
    declare id: string

    @Expose()
    declare workspaceId?: string

    @Expose()
    declare name: string

    @Expose()
    declare type: KnowledgebaseTypeEnum

    @Expose()
    declare faqConfig?: KnowledgebaseFAQConfig | null

    @Expose()
    declare language?: 'Chinese' | 'English'

    @Expose()
    declare avatar?: TAvatar

    @Expose()
    declare description?: string

    @Expose()
    declare status: KnowledgebaseStatusEnum

    @Expose()
    metadataSchema?: KBMetadataFieldDef[]

    @Expose()
    declare permission?: KnowledgebasePermission

    @Expose()
    declare createdBy?: IUser

    @Expose()
    pipelineId?: string

    @Expose()
    declare createdAt: Date

    constructor(partial: KnowledgebaseDTOInput) {
        Object.assign(this, partial)
        this.type = partial.type ?? KnowledgebaseTypeEnum.Standard
    }
}
