import {
    ISandboxManagedService,
    TSandboxManagedServiceStatus,
    TSandboxManagedServiceTransportMode
} from '@xpert-ai/contracts'
import { JSONValue } from '@xpert-ai/contracts'
import { TenantOrganizationBaseEntity } from '@xpert-ai/server-core'
import { Column, Entity, Index, JoinColumn, ManyToOne, RelationId } from 'typeorm'
import { ChatConversation } from '../chat-conversation/conversation.entity'

@Entity('sandbox_managed_service')
@Index(['conversationId'])
@Index(['conversationId', 'name'], { unique: true })
export class SandboxManagedServiceEntity extends TenantOrganizationBaseEntity implements ISandboxManagedService {
    @ManyToOne(() => ChatConversation, {
        onDelete: 'CASCADE'
    })
    @JoinColumn({ name: 'conversationId' })
    conversation?: ChatConversation

    @RelationId((entity: SandboxManagedServiceEntity) => entity.conversation)
    @Column()
    conversationId: string

    @Column({ type: 'varchar' })
    provider: string

    @Column({ type: 'varchar' })
    name: string

    @Column({ type: 'text' })
    command: string

    @Column({ type: 'text' })
    workingDirectory: string

    @Column({ type: 'int', nullable: true })
    requestedPort?: number | null

    @Column({ type: 'int', nullable: true })
    actualPort?: number | null

    @Column({ type: 'text', nullable: true })
    previewPath?: string | null

    @Column({ type: 'varchar' })
    status: TSandboxManagedServiceStatus

    @Column({ type: 'json', nullable: true })
    runtimeRef?: JSONValue | null

    @Column({ type: 'varchar', nullable: true })
    transportMode?: TSandboxManagedServiceTransportMode | null

    @Column({ type: 'varchar', nullable: true })
    ownerExecutionId?: string | null

    @Column({ type: 'varchar', nullable: true })
    ownerAgentKey?: string | null

    @Column({ type: 'timestamptz', nullable: true })
    startedAt?: Date | null

    @Column({ type: 'timestamptz', nullable: true })
    stoppedAt?: Date | null

    @Column({ type: 'int', nullable: true })
    exitCode?: number | null

    @Column({ type: 'varchar', nullable: true })
    signal?: string | null

    @Column({ type: 'json', nullable: true })
    metadata?: JSONValue | null
}
