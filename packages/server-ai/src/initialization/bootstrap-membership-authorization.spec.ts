import { configureAvailableClawXpertModel, createService } from './testing/bootstrap-service.fixture'

const event = { tenantId: 'tenant-1', organizationId: 'org-1', userId: 'member-1' }
const membershipFilter = { where: { ...event, isActive: true } }
const skipped = { workspaceId: null, createdNewUserDefaultWorkspace: false }

function expectNoWorkspaceWrites(fixture: ReturnType<typeof createService>) {
    expect(fixture.userService.findOne).not.toHaveBeenCalled()
    expect(fixture.workspaceService.create).not.toHaveBeenCalled()
    expect(fixture.workspaceService.ensureMember).not.toHaveBeenCalled()
    expect(fixture.workspaceService.findUserDefaultWorkspace).not.toHaveBeenCalled()
    expect(fixture.environmentService.create).not.toHaveBeenCalled()
    expect(fixture.membershipService.ensureTenantDefaultMembership).not.toHaveBeenCalled()
    expect(fixture.membershipService.ensureUserAssignedIfScopeInitialized).not.toHaveBeenCalled()
    expect(fixture.commandBus.execute).not.toHaveBeenCalled()
    expect(fixture.assistantBindingService.upsertBinding).not.toHaveBeenCalled()
}

describe('membership authorization for delayed user bootstrap jobs', () => {
    it('finishes an old job for a removed or inactive member before reading users or writing workspace access', async () => {
        const fixture = createService()
        fixture.userOrganizationService.count.mockResolvedValue(0)

        await expect(fixture.service.bootstrapUserInOrganization(event)).resolves.toEqual(skipped)

        expect(fixture.userOrganizationService.count).toHaveBeenCalledWith(membershipFilter)
        expectNoWorkspaceWrites(fixture)
    })

    it('rechecks membership after a failed Claw initialization and cleanup before allowing a retry', async () => {
        const fixture = createService()
        configureAvailableClawXpertModel(fixture)
        fixture.commandBus.execute.mockRejectedValue(new Error('template temporarily unavailable'))
        const result = await fixture.service.bootstrapUserInOrganization(event)
        expect(result.clawXpertError).toBe('template temporarily unavailable')
        expect(fixture.workspaceService.create).toHaveBeenCalledTimes(1)

        await fixture.service.cleanupUserInOrganization(event)
        expect(fixture.workspaceService.removeMemberFromOrganizationWorkspaces).toHaveBeenCalledWith(
            event.tenantId,
            event.organizationId,
            event.userId
        )
        jest.clearAllMocks()
        fixture.userOrganizationService.count.mockResolvedValue(0)

        await expect(fixture.service.bootstrapUserInOrganization(event)).resolves.toEqual(skipped)

        expect(fixture.userOrganizationService.count).toHaveBeenCalledWith(membershipFilter)
        expectNoWorkspaceWrites(fixture)
    })

    it('still bootstraps an active member with the exact queued tenant, organization and user', async () => {
        const fixture = createService()
        configureAvailableClawXpertModel(fixture)
        fixture.queryBus.execute.mockResolvedValue([])

        await expect(fixture.service.bootstrapUserInOrganization(event)).resolves.toMatchObject({
            workspaceId: 'workspace-2',
            createdNewUserDefaultWorkspace: true
        })

        expect(fixture.userOrganizationService.count).toHaveBeenCalledWith(membershipFilter)
        expect(fixture.workspaceService.ensureMember).toHaveBeenCalledWith('workspace-2', 'member-1')
    })

    it('fails closed if membership lookup is unavailable so queue retry cannot bypass authorization', async () => {
        const fixture = createService()
        fixture.userOrganizationService.count.mockRejectedValue(new Error('membership store unavailable'))

        await expect(fixture.service.bootstrapUserInOrganization(event)).rejects.toThrow('membership store unavailable')

        expectNoWorkspaceWrites(fixture)
    })

    it('ignores an event without a complete tenant boundary without issuing a broad membership query', async () => {
        const fixture = createService()

        await expect(fixture.service.bootstrapUserInOrganization({ ...event, tenantId: '' })).resolves.toEqual(skipped)

        expect(fixture.userOrganizationService.count).not.toHaveBeenCalled()
        expectNoWorkspaceWrites(fixture)
    })

    it('does not install default skills from a delayed job after the member was removed', async () => {
        const fixture = createService()
        fixture.userOrganizationService.count.mockResolvedValue(0)

        await expect(
            fixture.service.bootstrapUserDefaultWorkspaceSkills({
                ...event,
                workspaceId: 'old-workspace'
            })
        ).resolves.toBeUndefined()

        expect(fixture.userOrganizationService.count).toHaveBeenCalledWith(membershipFilter)
        expect(fixture.userService.findOne).not.toHaveBeenCalled()
        expect(fixture.xpertTemplateService.getUserDefaultSkillRefs).not.toHaveBeenCalled()
        expect(fixture.skillPackageService.ensureInstalledSkillPackage).not.toHaveBeenCalled()
    })
})
