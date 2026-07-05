import { IThreadGoal, ThreadGoalSpec, ThreadGoalStatus } from '@xpert-ai/contracts'
import { TenantOrganizationBaseEntity } from '@xpert-ai/server-core'
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { IsNumber, IsOptional, IsString } from 'class-validator'
import { Column, Entity, Index, JoinColumn, ManyToOne, RelationId } from 'typeorm'
import { ChatConversation } from '../conversation.entity'

const bigintNumberTransformer = {
    to: (value?: number | null) => value,
    from: (value: string | null) => (value !== null ? Number(value) : null)
}

@Entity('chat_conversation_goal')
@Index(['conversationId'], { unique: true })
@Index(['tenantId', 'organizationId', 'conversationId'])
export class ChatConversationGoal extends TenantOrganizationBaseEntity implements IThreadGoal {
    @ApiProperty({ type: () => ChatConversation })
    @ManyToOne(() => ChatConversation, {
        onDelete: 'CASCADE'
    })
    @JoinColumn()
    conversation?: ChatConversation

    @ApiProperty({ type: () => String })
    @RelationId((it: ChatConversationGoal) => it.conversation)
    @IsString()
    @Column({ type: 'uuid' })
    conversationId: string

    @ApiProperty({ type: () => String })
    @IsString()
    @Column({ type: 'varchar' })
    threadId: string

    @ApiProperty({ type: () => String })
    @IsString()
    @Column({ type: 'text' })
    objective: string

    @ApiPropertyOptional({ type: () => Object })
    @IsOptional()
    @Column({ type: 'jsonb', nullable: true })
    goalSpec?: ThreadGoalSpec | null

    @ApiProperty({ type: () => String })
    @IsString()
    @Column({ type: 'varchar', default: 'active' })
    status: ThreadGoalStatus

    @ApiProperty({ type: () => Number })
    @IsNumber()
    @Column({ type: 'bigint', default: 0, transformer: bigintNumberTransformer })
    tokensUsed: number

    @ApiProperty({ type: () => Number })
    @IsNumber()
    @Column({ type: 'integer', default: 0 })
    elapsedSeconds: number

    @ApiProperty({ type: () => Number })
    @IsNumber()
    @Column({ type: 'integer', default: 0 })
    continuationCount: number

    @ApiPropertyOptional({ type: () => Date })
    @IsOptional()
    @Column({ type: 'timestamp with time zone', nullable: true })
    statusUpdatedAt?: Date | null

    @ApiPropertyOptional({ type: () => Date })
    @IsOptional()
    @Column({ type: 'timestamp with time zone', nullable: true })
    completedAt?: Date | null

    @ApiPropertyOptional({ type: () => Date })
    @IsOptional()
    @Column({ type: 'timestamp with time zone', nullable: true })
    blockedAt?: Date | null
}
