import { LanguagesEnum, UserType } from '@xpert-ai/contracts'
import { RequestContext, UserOrganization } from '@xpert-ai/server-core'
import { BadRequestException, ForbiddenException } from '@nestjs/common'
import { instanceToPlain } from 'class-transformer'
import { createHash } from 'crypto'
import { XpertProjectInvitation } from '../entities/project-invitation.entity'
import { XpertProjectMembership } from '../entities/project-membership.entity'
import { XpertProjectInvitationService } from './project-invitation.service'

describe('XpertProjectInvitationService', () => {
    const project = {
        id: 'project-1',
        tenantId: 'tenant-1',
        organizationId: 'org-1',
        ownerId: 'owner-1'
    }
    const invitationRepository = {
        findOne: jest.fn(),
        find: jest.fn(),
        update: jest.fn(),
        create: jest.fn((input) => Object.assign(new XpertProjectInvitation(), input)),
        save: jest.fn((input) => Promise.resolve(input)),
        createQueryBuilder: jest.fn()
    }
    const userRepository = {
        findOne: jest.fn()
    }
    const organizationRepository = {
        findOne: jest.fn()
    }
    const accessService = {
        assertCanManage: jest.fn()
    }
    const membershipService = {
        syncLegacyMembership: jest.fn()
    }
    const userOrganizationService = {
        ensureMembershipInTransaction: jest.fn(),
        completeMembershipCreation: jest.fn()
    }
    const emailService = {
        inviteUser: jest.fn()
    }
    const configService = {
        get: jest.fn().mockReturnValue('https://app.example.com')
    }
    const dataSource = {
        getRepository: jest.fn(),
        transaction: jest.fn()
    }

    let service: XpertProjectInvitationService

    beforeEach(() => {
        jest.restoreAllMocks()
        jest.clearAllMocks()
        jest.spyOn(RequestContext, 'currentUserId').mockReturnValue('manager-1')
        jest.spyOn(RequestContext, 'currentUser').mockReturnValue({
            id: 'manager-1',
            tenantId: 'tenant-1',
            email: 'manager@example.com',
            type: UserType.USER
        } as never)
        jest.spyOn(RequestContext, 'hasPermissions').mockReturnValue(true)
        jest.spyOn(RequestContext, 'getLanguageCode').mockReturnValue(LanguagesEnum.English)
        accessService.assertCanManage.mockResolvedValue({ project, role: 'manager' })
        jest.mocked(organizationRepository.findOne).mockResolvedValue({
            id: 'org-1',
            tenantId: 'tenant-1',
            inviteExpiryPeriod: 14
        })
        jest.mocked(userRepository.findOne).mockResolvedValue(null)
        service = new XpertProjectInvitationService(
            invitationRepository as never,
            userRepository as never,
            organizationRepository as never,
            dataSource as never,
            accessService as never,
            membershipService as never,
            userOrganizationService as never,
            emailService as never,
            configService as never
        )
    })

    it('stores only a hash and rotates the one active invitation token when resent', async () => {
        const existing = Object.assign(new XpertProjectInvitation(), {
            id: 'invitation-1',
            projectId: project.id,
            email: 'person@example.com',
            normalizedEmail: 'person@example.com',
            role: 'member',
            status: 'pending',
            tokenHash: 'old-hash',
            expiresAt: new Date(),
            invitedById: 'manager-1',
            tenantId: 'tenant-1',
            organizationId: 'org-1'
        })
        jest.mocked(invitationRepository.findOne).mockResolvedValue(existing)

        const first = await service.invite(project.id, ' Person@Example.com ', 'editor')
        const firstHash = first.tokenHash
        const firstUrl = jest.mocked(emailService.inviteUser).mock.calls[0][0].registerUrl
        const firstToken = new URL(firstUrl).searchParams.get('token')!
        const second = await service.invite(project.id, 'person@example.com', 'member')
        const secondHash = second.tokenHash
        const secondUrl = jest.mocked(emailService.inviteUser).mock.calls[1][0].registerUrl
        const secondToken = new URL(secondUrl).searchParams.get('token')!

        expect(first.id).toBe(existing.id)
        expect(second.id).toBe(existing.id)
        expect(firstHash).toHaveLength(64)
        expect(secondHash).toHaveLength(64)
        expect(firstHash).not.toBe(secondHash)
        expect(createHash('sha256').update(firstToken).digest('hex')).toBe(firstHash)
        expect(createHash('sha256').update(secondToken).digest('hex')).toBe(secondHash)
        expect(instanceToPlain(second)).not.toHaveProperty('tokenHash')
        expect(second.expiresAt.getTime()).toBeGreaterThan(Date.now() + 13 * 24 * 60 * 60 * 1000)
    })

    it('rejects a verified user whose email does not match the invitation', async () => {
        setVerifiedCurrentUser('other@example.com')
        const pending = pendingInvitation({ normalizedEmail: 'person@example.com' })
        const transaction = createAcceptanceTransaction(pending)

        await expect(service.accept('one-time-token')).rejects.toBeInstanceOf(ForbiddenException)
        expect(transaction.membershipRepository.save).not.toHaveBeenCalled()
        expect(userOrganizationService.ensureMembershipInTransaction).not.toHaveBeenCalled()
    })

    it('commits expiration before rejecting an expired token', async () => {
        setVerifiedCurrentUser('person@example.com')
        const pending = pendingInvitation({ expiresAt: new Date(Date.now() - 1_000) })
        const transaction = createAcceptanceTransaction(pending)

        await expect(service.accept('expired-token')).rejects.toBeInstanceOf(BadRequestException)
        expect(pending.status).toBe('expired')
        expect(transaction.invitationRepository.save).toHaveBeenCalledWith(pending)
        expect(userOrganizationService.ensureMembershipInTransaction).not.toHaveBeenCalled()
    })

    it('accepts in one transaction and idempotently returns the membership for the same user and token', async () => {
        setVerifiedCurrentUser('person@example.com')
        const pending = pendingInvitation()
        const transaction = createAcceptanceTransaction(pending, null)
        userOrganizationService.ensureMembershipInTransaction.mockResolvedValue({
            created: true,
            membership: { id: 'organization-membership-1', isActive: true }
        })

        const membership = await service.accept('one-time-token')
        expect(membership).toMatchObject({
            projectId: project.id,
            userId: 'user-2',
            role: 'editor'
        })

        expect(transaction.membershipRepository.save).toHaveBeenCalledWith(
            expect.objectContaining({
                projectId: project.id,
                userId: 'user-2',
                role: 'editor',
                invitedById: 'manager-1'
            })
        )
        expect(pending).toMatchObject({ status: 'accepted', acceptedById: 'user-2' })
        expect(userOrganizationService.completeMembershipCreation).toHaveBeenCalledWith({
            organizationId: 'org-1',
            tenantId: 'tenant-1',
            userId: 'user-2'
        })
        expect(membershipService.syncLegacyMembership).toHaveBeenCalledWith(project.id, 'user-2')

        transaction.queryBuilder.getOne.mockResolvedValueOnce(pending)
        transaction.membershipRepository.findOne.mockResolvedValueOnce(membership)

        await expect(service.accept('one-time-token')).resolves.toBe(membership)
        expect(transaction.membershipRepository.save).toHaveBeenCalledTimes(1)
    })

    it('returns a committed acceptance even when post-commit cache and compatibility work fails', async () => {
        setVerifiedCurrentUser('person@example.com')
        const pending = pendingInvitation()
        createAcceptanceTransaction(pending, null)
        userOrganizationService.ensureMembershipInTransaction.mockResolvedValue({
            created: true,
            membership: { id: 'organization-membership-1', isActive: true }
        })
        userOrganizationService.completeMembershipCreation.mockRejectedValueOnce(new Error('cache unavailable'))
        membershipService.syncLegacyMembership.mockRejectedValueOnce(new Error('legacy table unavailable'))

        await expect(service.accept('one-time-token')).resolves.toMatchObject({
            projectId: project.id,
            userId: 'user-2',
            role: 'editor'
        })
        expect(pending).toMatchObject({ status: 'accepted', acceptedById: 'user-2' })
        expect(invitationRepository.update).toHaveBeenCalledWith(
            pending.id,
            expect.objectContaining({
                legacyMembershipSyncAttempts: 1,
                legacyMembershipSyncLastError: 'legacy table unavailable',
                legacyMembershipSyncNextAttemptAt: expect.any(Date)
            })
        )
    })

    it('automatically retries persisted legacy membership compatibility work', async () => {
        const accepted = pendingInvitation({
            status: 'accepted',
            acceptedById: 'user-2',
            legacyMembershipSyncAttempts: 1,
            legacyMembershipSyncNextAttemptAt: new Date(Date.now() - 1_000)
        })
        jest.mocked(invitationRepository.find).mockResolvedValue([accepted])

        await expect(service.retryPendingLegacyMembershipSyncs()).resolves.toEqual({ scanned: 1, synced: 1 })

        expect(membershipService.syncLegacyMembership).toHaveBeenCalledWith(project.id, 'user-2')
        expect(invitationRepository.update).toHaveBeenCalledWith(accepted.id, {
            legacyMembershipSyncedAt: expect.any(Date),
            legacyMembershipSyncLastError: null,
            legacyMembershipSyncNextAttemptAt: null
        })
    })

    it('lets a Project manager revoke only a pending invitation', async () => {
        const pending = pendingInvitation()
        jest.mocked(invitationRepository.findOne).mockResolvedValue(pending)

        await expect(service.revoke(project.id, pending.id)).resolves.toMatchObject({ status: 'revoked' })

        expect(accessService.assertCanManage).toHaveBeenCalledWith(project.id)
        expect(invitationRepository.findOne).toHaveBeenCalledWith({
            where: { id: pending.id, projectId: project.id }
        })
        expect(invitationRepository.save).toHaveBeenCalledWith(pending)

        const accepted = pendingInvitation({ status: 'accepted' })
        jest.mocked(invitationRepository.findOne).mockResolvedValue(accepted)
        await expect(service.revoke(project.id, accepted.id)).rejects.toBeInstanceOf(BadRequestException)
    })

    it('lets the matching invited user decline a pending invitation', async () => {
        setVerifiedCurrentUser('person@example.com')
        const pending = pendingInvitation()
        const queryBuilder = {
            addSelect: jest.fn().mockReturnThis(),
            where: jest.fn().mockReturnThis(),
            andWhere: jest.fn().mockReturnThis(),
            getOne: jest.fn().mockResolvedValue(pending)
        }
        jest.mocked(invitationRepository.createQueryBuilder).mockReturnValue(queryBuilder as never)

        await expect(service.decline('one-time-token')).resolves.toMatchObject({ status: 'declined' })

        expect(queryBuilder.where).toHaveBeenCalledWith('invitation.tokenHash = :tokenHash', {
            tokenHash: createHash('sha256').update('one-time-token').digest('hex')
        })
        expect(queryBuilder.andWhere).toHaveBeenCalledWith('invitation.status = :status', { status: 'pending' })
        expect(queryBuilder.andWhere).toHaveBeenCalledWith('invitation.tenantId = :tenantId', {
            tenantId: 'tenant-1'
        })
        expect(invitationRepository.save).toHaveBeenCalledWith(pending)
    })

    function setVerifiedCurrentUser(email: string) {
        jest.mocked(RequestContext.currentUser).mockReturnValue({
            id: 'user-2',
            tenantId: 'tenant-1',
            email,
            emailVerified: true,
            type: UserType.USER
        } as never)
    }

    function pendingInvitation(overrides: Partial<XpertProjectInvitation> = {}) {
        return Object.assign(new XpertProjectInvitation(), {
            id: 'invitation-1',
            projectId: project.id,
            email: 'person@example.com',
            normalizedEmail: 'person@example.com',
            role: 'editor',
            status: 'pending',
            tokenHash: 'stored-hash',
            expiresAt: new Date(Date.now() + 60_000),
            invitedById: 'manager-1',
            tenantId: 'tenant-1',
            organizationId: 'org-1',
            ...overrides
        })
    }

    function createAcceptanceTransaction(
        invitation: XpertProjectInvitation,
        existingMembership: XpertProjectMembership | null = null
    ) {
        const queryBuilder = {
            addSelect: jest.fn().mockReturnThis(),
            setLock: jest.fn().mockReturnThis(),
            where: jest.fn().mockReturnThis(),
            andWhere: jest.fn().mockReturnThis(),
            getOne: jest.fn().mockResolvedValue(invitation)
        }
        const transactionalInvitationRepository = {
            createQueryBuilder: jest.fn().mockReturnValue(queryBuilder),
            save: jest.fn((input) => Promise.resolve(input))
        }
        const transactionalMembershipRepository = {
            findOne: jest.fn().mockResolvedValue(existingMembership),
            create: jest.fn((input) => input),
            save: jest.fn((input) => Promise.resolve(input)),
            restore: jest.fn()
        }
        const userOrganizationRepository = {
            save: jest.fn((input) => Promise.resolve(input))
        }
        const manager = {
            getRepository: (entity) => {
                if (entity === XpertProjectInvitation) return transactionalInvitationRepository
                if (entity === XpertProjectMembership) return transactionalMembershipRepository
                if (entity === UserOrganization) return userOrganizationRepository
                throw new Error('Unexpected repository')
            }
        }
        jest.mocked(dataSource.transaction).mockImplementation(async (callback) => callback(manager as never))

        return {
            queryBuilder,
            invitationRepository: transactionalInvitationRepository,
            membershipRepository: transactionalMembershipRepository
        }
    }
})
