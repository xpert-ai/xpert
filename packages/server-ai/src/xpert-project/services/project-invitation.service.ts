import { LanguagesEnum, PermissionsEnum, TXpertProjectMemberRole, UserType } from '@xpert-ai/contracts'
import {
    EmailService,
    Organization,
    RequestContext,
    User,
    UserOrganization,
    UserOrganizationService
} from '@xpert-ai/server-core'
import { ConfigService } from '@xpert-ai/server-config'
import {
    BadRequestException,
    ForbiddenException,
    Injectable,
    Logger,
    NotFoundException,
    Optional
} from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Interval } from '@nestjs/schedule'
import { createHash, randomBytes } from 'crypto'
import { t } from 'i18next'
import { DataSource, IsNull, LessThanOrEqual, Not, Repository } from 'typeorm'
import { XpertProjectInvitation } from '../entities/project-invitation.entity'
import { XpertProjectMembership } from '../entities/project-membership.entity'
import { XpertProjectAccessService } from './project-access.service'
import { XpertProjectMembershipService, validateProjectMemberRole } from './project-membership.service'

const DEFAULT_PROJECT_INVITATION_EXPIRY_DAYS = 14
const PROJECT_INVITATION_LEGACY_SYNC_INTERVAL_MS = 60_000
const PROJECT_INVITATION_LEGACY_SYNC_MAX_BACKOFF_MS = 60 * 60 * 1000

@Injectable()
export class XpertProjectInvitationService {
    readonly #logger = new Logger(XpertProjectInvitationService.name)

    constructor(
        @InjectRepository(XpertProjectInvitation)
        private readonly invitationRepository: Repository<XpertProjectInvitation>,
        @InjectRepository(User) private readonly userRepository: Repository<User>,
        @InjectRepository(Organization) private readonly organizationRepository: Repository<Organization>,
        private readonly dataSource: DataSource,
        private readonly accessService: XpertProjectAccessService,
        private readonly membershipService: XpertProjectMembershipService,
        private readonly userOrganizationService: UserOrganizationService,
        @Optional() private readonly emailService?: EmailService,
        @Optional() private readonly configService?: ConfigService
    ) {}

    async list(projectId: string) {
        await this.accessService.assertCanManage(projectId)
        return this.invitationRepository.find({
            where: { projectId },
            relations: ['invitedBy', 'targetUser', 'acceptedBy'],
            order: { createdAt: 'DESC' }
        })
    }

    async invite(projectId: string, email: string, role: TXpertProjectMemberRole) {
        const { project } = await this.accessService.assertCanManage(projectId)
        if (!RequestContext.hasPermissions([PermissionsEnum.ORG_INVITE_EDIT])) {
            throw new ForbiddenException(
                t('server-ai:Error.OrganizationInvitePermissionRequired', {
                    defaultValue: 'Organization invitation permission is required'
                })
            )
        }
        validateProjectMemberRole(role)
        const normalizedEmail = normalizeProjectInvitationEmail(email)
        const organization = project.organizationId
            ? await this.organizationRepository.findOne({
                  where: { id: project.organizationId, tenantId: project.tenantId }
              })
            : null
        if (!organization) {
            throw new BadRequestException(
                t('server-ai:Error.ProjectOrganizationRequired', {
                    defaultValue: 'Project invitations require an Organization'
                })
            )
        }
        const targetUser = await this.userRepository.findOne({
            where: { email: normalizedEmail, tenantId: project.tenantId, type: UserType.USER }
        })
        if (targetUser) {
            const existingMembership = await this.dataSource.getRepository(XpertProjectMembership).findOne({
                where: { projectId, userId: targetUser.id }
            })
            if (project.ownerId === targetUser.id || existingMembership) {
                throw new BadRequestException(
                    t('server-ai:Error.ProjectMemberAlreadyExists', {
                        defaultValue: 'This user is already a Project member'
                    })
                )
            }
        }
        const token = randomBytes(32).toString('base64url')
        const tokenHash = hashProjectInvitationToken(token)
        const now = new Date()
        const expiryDays = organization.inviteExpiryPeriod || DEFAULT_PROJECT_INVITATION_EXPIRY_DAYS
        const expiresAt = new Date(now.getTime() + expiryDays * 24 * 60 * 60 * 1000)
        let invitation = await this.invitationRepository.findOne({
            where: {
                projectId,
                normalizedEmail,
                status: 'pending'
            }
        })
        if (invitation) {
            invitation.email = email.trim()
            invitation.role = role
            invitation.tokenHash = tokenHash
            invitation.expiresAt = expiresAt
            invitation.lastSentAt = now
            invitation.targetUserId = targetUser?.id
        } else {
            invitation = this.invitationRepository.create({
                projectId,
                email: email.trim(),
                normalizedEmail,
                tokenHash,
                targetUserId: targetUser?.id,
                role,
                status: 'pending',
                expiresAt,
                invitedById: RequestContext.currentUserId(),
                lastSentAt: now,
                tenantId: project.tenantId,
                organizationId: project.organizationId,
                createdById: RequestContext.currentUserId()
            })
        }
        invitation = await this.invitationRepository.save(invitation)

        const invitedBy = RequestContext.currentUser()
        if (this.emailService && invitedBy) {
            const clientBaseUrl = this.configService?.get<string>('clientBaseUrl') ?? 'http://localhost:4200'
            const registerUrl = new URL('/project/invitations/accept', clientBaseUrl)
            registerUrl.searchParams.set('token', token)
            await this.emailService.inviteUser({
                email: invitation.email,
                role,
                registerUrl: registerUrl.toString(),
                languageCode: (RequestContext.getLanguageCode() || LanguagesEnum.English) as LanguagesEnum,
                invitedBy,
                organization,
                organizationId: organization.id,
                tenantId: project.tenantId,
                originUrl: clientBaseUrl
            })
        }
        return invitation
    }

    async accept(token: string) {
        const normalizedToken = token?.trim()
        if (!normalizedToken) {
            throw new BadRequestException(
                t('server-ai:Error.ProjectInvitationTokenRequired', {
                    defaultValue: 'Project invitation token is required'
                })
            )
        }
        const currentUser = RequestContext.currentUser()
        if (!currentUser?.id || currentUser.type !== UserType.USER || !currentUser.emailVerified) {
            throw new ForbiddenException(
                t('server-ai:Error.VerifiedUserRequired', {
                    defaultValue: 'A verified user account is required to accept the invitation'
                })
            )
        }
        const normalizedEmail = normalizeProjectInvitationEmail(currentUser.email ?? '')
        const tokenHash = hashProjectInvitationToken(normalizedToken)
        const result = await this.dataSource.transaction(async (manager) => {
            const repository = manager.getRepository(XpertProjectInvitation)
            const invitation = await repository
                .createQueryBuilder('invitation')
                .addSelect('invitation.tokenHash')
                .setLock('pessimistic_write')
                .where('invitation.tokenHash = :tokenHash', { tokenHash })
                .andWhere('invitation.tenantId = :tenantId', { tenantId: currentUser.tenantId })
                .getOne()
            if (!invitation) {
                throw new BadRequestException(
                    t('server-ai:Error.ProjectInvitationInvalid', {
                        defaultValue: 'The Project invitation is invalid or expired'
                    })
                )
            }
            if (invitation.normalizedEmail !== normalizedEmail) {
                throw new ForbiddenException(
                    t('server-ai:Error.ProjectInvitationEmailMismatch', {
                        defaultValue: 'This Project invitation belongs to another email address'
                    })
                )
            }
            if (!invitation.organizationId) {
                throw new BadRequestException(
                    t('server-ai:Error.ProjectOrganizationRequired', {
                        defaultValue: 'Project invitations require an Organization'
                    })
                )
            }
            const membershipRepository = manager.getRepository(XpertProjectMembership)
            if (invitation.status === 'accepted') {
                if (invitation.acceptedById !== currentUser.id) {
                    throw new ForbiddenException(
                        t('server-ai:Error.ProjectInvitationEmailMismatch', {
                            defaultValue: 'This Project invitation belongs to another email address'
                        })
                    )
                }
                const membership = await membershipRepository.findOne({
                    where: { projectId: invitation.projectId, userId: currentUser.id }
                })
                if (!membership) {
                    throw new BadRequestException(
                        t('server-ai:Error.ProjectInvitationInvalid', {
                            defaultValue: 'The Project invitation is invalid or expired'
                        })
                    )
                }
                return {
                    status: 'accepted' as const,
                    invitation,
                    membership,
                    organizationMembershipCreated: false
                }
            }
            if (invitation.status !== 'pending') {
                throw new BadRequestException(
                    t('server-ai:Error.ProjectInvitationInvalid', {
                        defaultValue: 'The Project invitation is invalid or expired'
                    })
                )
            }
            if (invitation.expiresAt.getTime() <= Date.now()) {
                invitation.status = 'expired'
                await repository.save(invitation)
                return { status: 'expired' as const }
            }
            const ensured = await this.userOrganizationService.ensureMembershipInTransaction(manager, {
                organizationId: invitation.organizationId,
                tenantId: invitation.tenantId,
                userId: currentUser.id
            })
            let organizationMembershipCreated = ensured.created
            if (!ensured.membership.isActive) {
                ensured.membership.isActive = true
                await manager.getRepository(UserOrganization).save(ensured.membership)
                organizationMembershipCreated = true
            }
            let membership = await membershipRepository.findOne({
                where: { projectId: invitation.projectId, userId: currentUser.id },
                withDeleted: true
            })
            if (membership) {
                if (membership.deletedAt) await membershipRepository.restore(membership.id)
                membership.role = invitation.role
                membership.deletedAt = undefined
                membership.removedAt = undefined
                membership.joinedAt = new Date()
            } else {
                membership = membershipRepository.create({
                    projectId: invitation.projectId,
                    userId: currentUser.id,
                    role: invitation.role,
                    invitedById: invitation.invitedById,
                    joinedAt: new Date(),
                    tenantId: invitation.tenantId,
                    organizationId: invitation.organizationId,
                    createdById: currentUser.id
                })
            }
            await membershipRepository.save(membership)
            invitation.status = 'accepted'
            invitation.acceptedById = currentUser.id
            invitation.acceptedAt = new Date()
            await repository.save(invitation)
            return { status: 'accepted' as const, invitation, membership, organizationMembershipCreated }
        })

        if (result.status === 'expired') {
            throw new BadRequestException(
                t('server-ai:Error.ProjectInvitationInvalid', {
                    defaultValue: 'The Project invitation is invalid or expired'
                })
            )
        }

        const { invitation, membership, organizationMembershipCreated } = result
        const organizationId = invitation.organizationId
        if (organizationMembershipCreated && organizationId) {
            await this.runPostAcceptanceStep('organization-membership-completion', () =>
                this.userOrganizationService.completeMembershipCreation({
                    organizationId,
                    tenantId: invitation.tenantId,
                    userId: currentUser.id
                })
            )
        }
        // Maintain the legacy join table for one compatibility cycle. The invitation row is the durable outbox.
        await this.tryLegacyMembershipSync(invitation)
        return membership
    }

    @Interval(PROJECT_INVITATION_LEGACY_SYNC_INTERVAL_MS)
    async retryPendingLegacyMembershipSyncs() {
        const now = new Date()
        let invitations: XpertProjectInvitation[]
        try {
            invitations = await this.invitationRepository.find({
                where: [
                    {
                        status: 'accepted',
                        acceptedById: Not(IsNull()),
                        legacyMembershipSyncedAt: IsNull(),
                        legacyMembershipSyncNextAttemptAt: IsNull()
                    },
                    {
                        status: 'accepted',
                        acceptedById: Not(IsNull()),
                        legacyMembershipSyncedAt: IsNull(),
                        legacyMembershipSyncNextAttemptAt: LessThanOrEqual(now)
                    }
                ],
                order: { acceptedAt: 'ASC' },
                take: 50
            })
        } catch (error) {
            this.#logger.warn(
                `Project invitation legacy membership retry scan failed: ${
                    error instanceof Error ? error.message : String(error)
                }`
            )
            return { scanned: 0, synced: 0 }
        }

        let synced = 0
        for (const invitation of invitations) {
            if (await this.tryLegacyMembershipSync(invitation)) synced += 1
        }
        return { scanned: invitations.length, synced }
    }

    private async tryLegacyMembershipSync(invitation: XpertProjectInvitation) {
        if (invitation.legacyMembershipSyncedAt) return true
        const userId = invitation.acceptedById
        if (!userId) return false

        try {
            await this.membershipService.syncLegacyMembership(invitation.projectId, userId)
            const completed = {
                legacyMembershipSyncedAt: new Date(),
                legacyMembershipSyncLastError: null,
                legacyMembershipSyncNextAttemptAt: null
            }
            await this.invitationRepository.update(invitation.id, completed)
            Object.assign(invitation, completed)
            return true
        } catch (error) {
            const attempts = (invitation.legacyMembershipSyncAttempts ?? 0) + 1
            const failure = {
                legacyMembershipSyncAttempts: attempts,
                legacyMembershipSyncLastError: error instanceof Error ? error.message.slice(0, 4000) : String(error),
                legacyMembershipSyncNextAttemptAt: new Date(
                    Date.now() +
                        Math.min(
                            PROJECT_INVITATION_LEGACY_SYNC_INTERVAL_MS * 2 ** Math.min(attempts - 1, 6),
                            PROJECT_INVITATION_LEGACY_SYNC_MAX_BACKOFF_MS
                        )
                )
            }
            Object.assign(invitation, failure)
            try {
                await this.invitationRepository.update(invitation.id, failure)
            } catch (persistenceError) {
                this.#logger.warn(
                    `Project invitation legacy membership compensation could not be persisted: invitationId=${
                        invitation.id
                    } error=${persistenceError instanceof Error ? persistenceError.message : String(persistenceError)}`
                )
            }
            this.#logger.warn(
                `Project invitation legacy membership sync failed: invitationId=${invitation.id} attempt=${attempts} error=${
                    error instanceof Error ? error.message : String(error)
                }`
            )
            return false
        }
    }

    private async runPostAcceptanceStep(name: string, operation: () => Promise<unknown>) {
        try {
            await operation()
        } catch (error) {
            this.#logger.warn(
                `Project invitation post-acceptance step failed: step=${name} error=${
                    error instanceof Error ? error.message : String(error)
                }`
            )
        }
    }

    async revoke(projectId: string, invitationId: string) {
        await this.accessService.assertCanManage(projectId)
        const invitation = await this.invitationRepository.findOne({ where: { id: invitationId, projectId } })
        if (!invitation) {
            throw new NotFoundException(
                t('server-ai:Error.ProjectInvitationNotFound', { defaultValue: 'Project invitation was not found' })
            )
        }
        if (invitation.status !== 'pending') {
            throw new BadRequestException(
                t('server-ai:Error.ProjectInvitationNotPending', {
                    defaultValue: 'Only a pending Project invitation can be revoked'
                })
            )
        }
        invitation.status = 'revoked'
        return this.invitationRepository.save(invitation)
    }

    async decline(token: string) {
        const currentUser = RequestContext.currentUser()
        if (!currentUser?.id || !currentUser.email) {
            throw new ForbiddenException(
                t('server-ai:Error.AuthenticatedUserRequired', { defaultValue: 'An authenticated user is required' })
            )
        }
        const normalizedToken = token?.trim()
        if (!normalizedToken) {
            throw new BadRequestException(
                t('server-ai:Error.ProjectInvitationTokenRequired', {
                    defaultValue: 'Project invitation token is required'
                })
            )
        }
        const tokenHash = hashProjectInvitationToken(normalizedToken)
        const invitation = await this.invitationRepository
            .createQueryBuilder('invitation')
            .addSelect('invitation.tokenHash')
            .where('invitation.tokenHash = :tokenHash', { tokenHash })
            .andWhere('invitation.status = :status', { status: 'pending' })
            .andWhere('invitation.tenantId = :tenantId', { tenantId: currentUser.tenantId })
            .getOne()
        if (!invitation || invitation.expiresAt.getTime() <= Date.now()) {
            throw new BadRequestException(
                t('server-ai:Error.ProjectInvitationInvalid', {
                    defaultValue: 'The Project invitation is invalid or expired'
                })
            )
        }
        if (invitation.normalizedEmail !== normalizeProjectInvitationEmail(currentUser.email)) {
            throw new ForbiddenException(
                t('server-ai:Error.ProjectInvitationEmailMismatch', {
                    defaultValue: 'This Project invitation belongs to another email address'
                })
            )
        }
        invitation.status = 'declined'
        return this.invitationRepository.save(invitation)
    }
}

function normalizeProjectInvitationEmail(email: string) {
    const normalized = email.trim().toLowerCase()
    if (!normalized || !normalized.includes('@')) {
        throw new BadRequestException(
            t('server-ai:Error.InvalidEmailAddress', { defaultValue: 'A valid email address is required' })
        )
    }
    return normalized
}

function hashProjectInvitationToken(token: string) {
    return createHash('sha256').update(token).digest('hex')
}
