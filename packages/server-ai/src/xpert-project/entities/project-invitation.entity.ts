import {
    IUser,
    IXpertProject,
    IXpertProjectInvitation,
    TXpertProjectInvitationStatus,
    TXpertProjectMemberRole
} from '@xpert-ai/contracts'
import { TenantOrganizationBaseEntity, User } from '@xpert-ai/server-core'
import { Exclude } from 'class-transformer'
import { Column, DeleteDateColumn, Entity, Index, JoinColumn, ManyToOne, RelationId } from 'typeorm'
import { XpertProject } from './project.entity'

@Entity('xpert_project_invitation')
@Index('IDX_xpert_project_invitation_pending', ['projectId', 'normalizedEmail'], {
    unique: true,
    where: '"status" = \'pending\' AND "deletedAt" IS NULL'
})
@Index('IDX_xpert_project_invitation_token', ['tokenHash'], { unique: true })
export class XpertProjectInvitation extends TenantOrganizationBaseEntity implements IXpertProjectInvitation {
    @ManyToOne(() => XpertProject, { onDelete: 'CASCADE' })
    @JoinColumn()
    project?: IXpertProject

    @RelationId((invitation: XpertProjectInvitation) => invitation.project)
    @Column({ type: 'uuid' })
    projectId: string

    @Column({ type: 'varchar', length: 255 })
    email: string

    @Column({ type: 'varchar', length: 255 })
    normalizedEmail: string

    @Column({ type: 'varchar', length: 64, select: false })
    @Exclude({ toPlainOnly: true })
    tokenHash: string

    @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
    @JoinColumn()
    targetUser?: IUser

    @RelationId((invitation: XpertProjectInvitation) => invitation.targetUser)
    @Column({ type: 'uuid', nullable: true })
    targetUserId?: string

    @Column({ type: 'varchar', length: 20, default: 'member' })
    role: TXpertProjectMemberRole

    @Column({ type: 'varchar', length: 20, default: 'pending' })
    status: TXpertProjectInvitationStatus

    @Column({ type: 'timestamptz' })
    expiresAt: Date

    @ManyToOne(() => User, { onDelete: 'RESTRICT' })
    @JoinColumn()
    invitedBy?: IUser

    @RelationId((invitation: XpertProjectInvitation) => invitation.invitedBy)
    @Column({ type: 'uuid' })
    invitedById: string

    @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
    @JoinColumn()
    acceptedBy?: IUser

    @RelationId((invitation: XpertProjectInvitation) => invitation.acceptedBy)
    @Column({ type: 'uuid', nullable: true })
    acceptedById?: string

    @Column({ type: 'timestamptz', nullable: true })
    acceptedAt?: Date

    @Column({ type: 'timestamptz', default: () => 'CURRENT_TIMESTAMP' })
    lastSentAt: Date

    /** Durable compatibility compensation for the legacy xpert_project_member join table. */
    @Column({ type: 'timestamptz', nullable: true })
    @Exclude({ toPlainOnly: true })
    legacyMembershipSyncedAt?: Date | null

    @Column({ type: 'int', default: 0 })
    @Exclude({ toPlainOnly: true })
    legacyMembershipSyncAttempts: number

    @Column({ type: 'text', nullable: true })
    @Exclude({ toPlainOnly: true })
    legacyMembershipSyncLastError?: string | null

    @Column({ type: 'timestamptz', nullable: true })
    @Exclude({ toPlainOnly: true })
    legacyMembershipSyncNextAttemptAt?: Date | null

    @DeleteDateColumn({ type: 'timestamptz', nullable: true })
    deletedAt?: Date
}
