import { IChatConversation, IChatConversationReadState, IUser } from '@xpert-ai/contracts'
import { TenantOrganizationBaseEntity, User } from '@xpert-ai/server-core'
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { IsDate, IsOptional, IsString } from 'class-validator'
import { Column, Entity, Index, JoinColumn, ManyToOne, RelationId } from 'typeorm'
import { ChatConversation } from './conversation.entity'

@Entity('chat_conversation_read_state')
@Index('IDX_chat_conversation_read_state_unique', ['tenantId', 'organizationId', 'conversationId', 'userId'], {
    unique: true
})
export class ChatConversationReadState extends TenantOrganizationBaseEntity implements IChatConversationReadState {
    @ApiProperty({ type: () => ChatConversation })
    @ManyToOne(() => ChatConversation, {
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
    })
    @JoinColumn()
    conversation?: IChatConversation

    @ApiProperty({ type: () => String })
    @RelationId((it: ChatConversationReadState) => it.conversation)
    @IsString()
    @Column()
    conversationId: string

    @ApiPropertyOptional({ type: () => User, readOnly: true })
    @ManyToOne(() => User, {
        nullable: true,
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
    })
    @JoinColumn()
    @IsOptional()
    user?: IUser

    @ApiProperty({ type: () => String, readOnly: true })
    @RelationId((it: ChatConversationReadState) => it.user)
    @IsString()
    @Column({ nullable: true })
    userId: string

    @ApiProperty({ type: () => 'timestamptz' })
    @IsDate()
    @Column({ type: 'timestamptz' })
    lastReadAt: Date

    @ApiPropertyOptional({ type: () => String })
    @IsString()
    @IsOptional()
    @Column({ nullable: true })
    lastReadMessageId?: string | null
}
