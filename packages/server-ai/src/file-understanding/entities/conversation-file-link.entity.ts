import { TenantOrganizationBaseEntity } from '@xpert-ai/server-core'
import { Column, Entity, Index } from 'typeorm'

@Entity('conversation_file_link')
@Index(['conversationId', 'fileAssetId'], { unique: true })
@Index(['storageFileId'])
export class ConversationFileLink extends TenantOrganizationBaseEntity {
    @Column()
    conversationId: string

    @Column({ type: 'uuid' })
    fileAssetId: string

    @Column({ type: 'uuid', nullable: true })
    storageFileId?: string

    @Column({ nullable: true })
    threadId?: string

    @Column({ type: 'json', nullable: true })
    metadata?: Record<string, unknown>
}
