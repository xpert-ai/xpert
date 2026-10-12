import { createService } from './testing/bootstrap-service.fixture'

describe('ServerAIBootstrapService default workspace skills', () => {
    it('installs resolved default workspace skills and retries when some refs are not ready yet', async () => {
        const { commandBus, service, skillPackageService, userService, xpertTemplateService } = createService()
        userService.findOne.mockResolvedValue({
            id: 'member-1',
            preferredLanguage: 'en_US',
            role: {
                name: 'ADMIN'
            }
        })
        xpertTemplateService.getUserDefaultSkillRefs.mockResolvedValue([
            {
                provider: 'github',
                repositoryName: 'anthropics/skills',
                skillId: 'skills/claude-api'
            },
            {
                provider: 'clawhub',
                repositoryName: 'clawhub/official',
                skillId: 'mcporter'
            }
        ])
        xpertTemplateService.getBootstrapDefaultSkillRefs.mockResolvedValue([
            {
                provider: 'github',
                repositoryName: 'anthropics/skills',
                skillId: 'skills/claude-api'
            },
            {
                provider: 'clawhub',
                repositoryName: 'clawhub/official',
                skillId: 'mcporter'
            }
        ])
        commandBus.execute.mockResolvedValue([
            {
                ref: {
                    provider: 'github',
                    repositoryName: 'anthropics/skills',
                    skillId: 'skills/claude-api'
                },
                skill: {
                    id: 'skill-1'
                }
            }
        ])

        await expect(
            service.bootstrapUserDefaultWorkspaceSkills({
                tenantId: 'tenant-1',
                organizationId: 'org-1',
                userId: 'member-1',
                workspaceId: 'workspace-1'
            })
        ).rejects.toThrow('Default workspace skill bootstrap incomplete')

        expect(xpertTemplateService.getBootstrapDefaultSkillRefs).toHaveBeenCalledTimes(1)
        expect(xpertTemplateService.getUserDefaultSkillRefs).not.toHaveBeenCalled()
        expect(skillPackageService.ensureInstalledSkillPackage).toHaveBeenCalledWith('workspace-1', 'skill-1')
    })

    it('installs all resolved default workspace skills when references are ready', async () => {
        const { commandBus, service, skillPackageService, userService, xpertTemplateService } = createService()
        userService.findOne.mockResolvedValue({
            id: 'member-1',
            preferredLanguage: 'en_US',
            role: {
                name: 'ADMIN'
            }
        })
        xpertTemplateService.getBootstrapDefaultSkillRefs.mockResolvedValue([
            {
                provider: 'github',
                repositoryName: 'anthropics/skills',
                skillId: 'skills/claude-api'
            }
        ])
        commandBus.execute.mockResolvedValue([
            {
                ref: {
                    provider: 'github',
                    repositoryName: 'anthropics/skills',
                    skillId: 'skills/claude-api'
                },
                skill: {
                    id: 'skill-1'
                }
            }
        ])

        await expect(
            service.bootstrapUserDefaultWorkspaceSkills({
                tenantId: 'tenant-1',
                organizationId: 'org-1',
                userId: 'member-1',
                workspaceId: 'workspace-1'
            })
        ).resolves.toBeUndefined()

        expect(skillPackageService.ensureInstalledSkillPackage).toHaveBeenCalledWith('workspace-1', 'skill-1')
    })

    it('includes install failure reasons in the aggregated bootstrap error', async () => {
        const { commandBus, service, skillPackageService, userService, xpertTemplateService } = createService()
        userService.findOne.mockResolvedValue({
            id: 'member-1',
            preferredLanguage: 'en_US',
            role: {
                name: 'ADMIN'
            }
        })
        xpertTemplateService.getBootstrapDefaultSkillRefs.mockResolvedValue([
            {
                provider: 'github',
                repositoryName: 'anthropics/skills',
                skillId: 'skills/claude-api'
            }
        ])
        commandBus.execute.mockResolvedValue([
            {
                ref: {
                    provider: 'github',
                    repositoryName: 'anthropics/skills',
                    skillId: 'skills/claude-api'
                },
                skill: {
                    id: 'skill-1'
                }
            }
        ])
        skillPackageService.ensureInstalledSkillPackage.mockRejectedValue(
            new Error('GitHub API error: 403 rate limit exceeded')
        )

        await expect(
            service.bootstrapUserDefaultWorkspaceSkills({
                tenantId: 'tenant-1',
                organizationId: 'org-1',
                userId: 'member-1',
                workspaceId: 'workspace-1'
            })
        ).rejects.toThrow(
            "Default workspace skill bootstrap incomplete for 'workspace-1' (failed: github:anthropics/skills:skills/claude-api (GitHub API error: 403 rate limit exceeded))"
        )
    })
})
