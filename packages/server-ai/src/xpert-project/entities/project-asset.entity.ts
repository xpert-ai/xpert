import { IXpertProjectAsset, TXpertProjectAssetKind, TXpertProjectAssetSource } from '@xpert-ai/contracts'
import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm'
import { XpertProjectBaseEntity } from './project.base'

@Entity('xpert_project_asset')
@Index(['projectId', 'path'], { unique: true })
export class XpertProjectAsset extends XpertProjectBaseEntity implements IXpertProjectAsset {
    @Column({ nullable: true })
    parentId?: string

    @ManyToOne(() => XpertProjectAsset, { nullable: true, onDelete: 'CASCADE' })
    @JoinColumn({ name: 'parentId' })
    parent?: XpertProjectAsset

    @Column()
    name: string

    @Column()
    path: string

    @Column({ type: 'enum', enum: ['file', 'folder'] })
    kind: TXpertProjectAssetKind

    @Column({ nullable: true })
    mimeType?: string

    @Column({ type: 'bigint', nullable: true })
    size?: number

    @Column({ type: 'enum', enum: ['upload', 'ai_output', 'conversation', 'import'], default: 'upload' })
    source: TXpertProjectAssetSource

    @Column({ nullable: true })
    taskId?: string

    @Column({ nullable: true })
    conversationId?: string

    @Column({ type: 'enum', enum: ['available', 'processing', 'failed'], default: 'available' })
    status?: 'available' | 'processing' | 'failed'
}
