import { IUser, IXpertProject, IXpertProjectMembership, TXpertProjectMemberRole } from '@xpert-ai/contracts'
import { TenantOrganizationBaseEntity, User } from '@xpert-ai/server-core'
import { Column, DeleteDateColumn, Entity, Index, JoinColumn, ManyToOne, RelationId } from 'typeorm'
import { XpertProject } from './project.entity'

@Entity('xpert_project_membership')
@Index('IDX_xpert_project_membership_unique', ['projectId', 'userId'], { unique: true })
export class XpertProjectMembership extends TenantOrganizationBaseEntity implements IXpertProjectMembership {
    @ManyToOne(() => XpertProject, (project) => project.memberships, { onDelete: 'CASCADE' })
    @JoinColumn()
    project?: IXpertProject

    @RelationId((membership: XpertProjectMembership) => membership.project)
    @Column({ type: 'uuid' })
    projectId: string

    @ManyToOne(() => User, { onDelete: 'CASCADE' })
    @JoinColumn()
    user?: IUser

    @RelationId((membership: XpertProjectMembership) => membership.user)
    @Column({ type: 'uuid' })
    userId: string

    @Column({ type: 'varchar', length: 20, default: 'member' })
    role: TXpertProjectMemberRole

    @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
    @JoinColumn()
    invitedBy?: IUser

    @RelationId((membership: XpertProjectMembership) => membership.invitedBy)
    @Column({ type: 'uuid', nullable: true })
    invitedById?: string

    @Column({ type: 'timestamptz', default: () => 'CURRENT_TIMESTAMP' })
    joinedAt: Date

    @Column({ type: 'timestamptz', nullable: true })
    removedAt?: Date

    @DeleteDateColumn({ type: 'timestamptz', nullable: true })
    deletedAt?: Date
}
