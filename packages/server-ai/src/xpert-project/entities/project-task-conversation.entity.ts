import { IXpertProjectTaskConversation, TXpertProjectTaskConversationRelation } from '@xpert-ai/contracts'
import { ApiPropertyOptional } from '@nestjs/swagger'
import { Column, Entity, JoinColumn, ManyToOne, Unique } from 'typeorm'
import { ChatConversation } from '../../chat-conversation/conversation.entity'
import { XpertProjectTask } from './project-task.entity'
import { XpertProjectBaseEntity } from './project.base'

@Entity('xpert_project_task_conversation')
@Unique('UQ_project_task_conversation_relation', ['projectId', 'taskId', 'conversationId', 'relationType'])
export class XpertProjectTaskConversation extends XpertProjectBaseEntity implements IXpertProjectTaskConversation {
    @Column()
    taskId: string

    @ManyToOne(() => XpertProjectTask, (task) => task.conversations, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'taskId' })
    task?: XpertProjectTask

    @Column()
    conversationId: string

    @ManyToOne(() => ChatConversation, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'conversationId' })
    conversation?: ChatConversation

    @ApiPropertyOptional({ enum: ['origin', 'discussion', 'execution', 'review'] })
    @Column({ type: 'enum', enum: ['origin', 'discussion', 'execution', 'review'], default: 'discussion' })
    relationType: TXpertProjectTaskConversationRelation

    @Column({ default: false })
    isPrimary?: boolean

    @Column({ nullable: true })
    sourceMessageId?: string

    @Column({ nullable: true })
    sourceExecutionId?: string
}
