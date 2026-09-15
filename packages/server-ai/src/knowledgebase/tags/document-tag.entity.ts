import { IKnowledgeDocumentTag } from '@xpert-ai/contracts'
import { Tag, TenantOrganizationBaseEntity } from '@xpert-ai/server-core'
import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm'
import { KnowledgeDocument } from '../../knowledge-document/document.entity'

@Entity('knowledge_document_tag')
@Index('UQ_knowledge_document_tag', ['documentId', 'tagId'], { unique: true })
export class KnowledgeDocumentTag extends TenantOrganizationBaseEntity implements IKnowledgeDocumentTag {
    @Column({ type: 'uuid' })
    documentId: string

    @ManyToOne(() => KnowledgeDocument, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'documentId' })
    document?: KnowledgeDocument

    @Column({ type: 'uuid' })
    tagId: string

    @ManyToOne(() => Tag, { onDelete: 'RESTRICT' })
    @JoinColumn({ name: 'tagId' })
    tag: Tag

    @Column({ type: 'varchar', length: 16, default: 'manual' })
    source: 'manual' | 'automatic'

    @Column({ type: 'float', nullable: true })
    confidence?: number | null
}
