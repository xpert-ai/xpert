import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { ResolveTemplateSkillRefsCommand } from '../../commands'
import {
    cleanupTemplateFixtures,
    createService,
    createTempDir,
    seedBuiltinTemplates,
    writeJson
} from '../../testing/template-test-harness'

afterEach(cleanupTemplateFixtures)
it('reuses repository path trimming when resolving default workspace skill refs', async () => {
    const workspaceRoot = createTempDir()
    seedBuiltinTemplates(workspaceRoot)
    const { service, commands, skillRepositoryIndexService, skillRepositoryService } = createService({
        serverRoot: workspaceRoot,
        dataPath: createTempDir()
    })

    skillRepositoryService.findAllInOrganizationOrTenant.mockResolvedValue({
        items: [
            {
                id: 'repo-org',
                provider: 'github',
                name: 'obra/superpowers',
                organizationId: 'org-1',
                options: {
                    path: 'skills'
                }
            },
            {
                id: 'repo-tenant',
                provider: 'github',
                name: 'obra/superpowers',
                organizationId: null,
                options: {
                    path: 'skills'
                }
            }
        ]
    })
    skillRepositoryIndexService.findAllInOrganizationOrTenant.mockResolvedValueOnce({
        items: [
            {
                id: 'skill-1',
                repositoryId: 'repo-org',
                skillId: 'mcporter',
                skillPath: 'mcporter',
                name: 'MCPorter',
                repository: {
                    id: 'repo-org',
                    provider: 'github',
                    name: 'obra/superpowers'
                }
            }
        ]
    })

    const result = await commands.execute(
        new ResolveTemplateSkillRefsCommand([
            {
                provider: 'github',
                repositoryName: 'obra/superpowers',
                skillId: 'skills/mcporter'
            }
        ])
    )

    expect(skillRepositoryIndexService.findAllInOrganizationOrTenant).toHaveBeenNthCalledWith(1, {
        where: {
            repositoryId: 'repo-org',
            skillId: expect.objectContaining({
                _type: 'in',
                _value: ['skills/mcporter', 'mcporter']
            })
        },
        relations: ['repository'],
        take: 2,
        order: {
            updatedAt: 'DESC'
        }
    })
    expect(result).toEqual([
        {
            ref: {
                provider: 'github',
                repositoryName: 'obra/superpowers',
                skillId: 'skills/mcporter'
            },
            skill: expect.objectContaining({
                id: 'skill-1',
                repositoryId: 'repo-org',
                skillId: 'mcporter'
            })
        }
    ])
})

it('prefers template bundle backed public repository skills for matching refs', async () => {
    const workspaceRoot = createTempDir()
    const dataRoot = createTempDir()
    const externalRoot = join(dataRoot, 'external-templates')
    const bundleRoot = join(externalRoot, 'skill-packages', 'claude-api-bundle')

    seedBuiltinTemplates(workspaceRoot)
    mkdirSync(bundleRoot, { recursive: true })
    writeJson(join(externalRoot, 'templates.json'), {
        templates: {},
        details: {}
    })
    writeJson(join(externalRoot, 'mcp-templates.json'), {})
    writeJson(join(externalRoot, 'knowledge-pipelines.json'), {})
    writeFileSync(
        join(externalRoot, 'skills-market.yaml'),
        'en-US:\n  featured: []\n  filters:\n    roles:\n      label: Roles\n      options: []\n    appTypes:\n      label: Application types\n      options: []\n    hot:\n      label: Trending\n      options: []',
        'utf8'
    )
    writeFileSync(join(externalRoot, 'workspace-defaults.yaml'), 'userDefault:\n  skills: []', 'utf8')
    writeFileSync(
        join(bundleRoot, 'bundle.yaml'),
        'provider: github\nrepositoryName: anthropics/skills\nskillId: skills/claude-api\n',
        'utf8'
    )
    writeFileSync(join(bundleRoot, 'SKILL.md'), '---\nname: Claude API\ndescription: Example\n---\n', 'utf8')

    const { service, commands, skillRepositoryIndexService, skillRepositoryService } = createService({
        serverRoot: workspaceRoot,
        dataPath: join(dataRoot, 'fallback-data'),
        env: {
            XPERT_TEMPLATE_DIR: externalRoot
        }
    })

    skillRepositoryService.findAllInOrganizationOrTenant.mockResolvedValue({
        items: [
            {
                id: 'repo-public',
                provider: 'workspace-public',
                name: 'Workspace Shared Skills',
                organizationId: 'org-1'
            },
            {
                id: 'repo-github',
                provider: 'github',
                name: 'anthropics/skills',
                organizationId: 'org-1'
            }
        ]
    })
    skillRepositoryIndexService.findAllInOrganizationOrTenant.mockResolvedValueOnce({
        items: [
            {
                id: 'skill-public-1',
                repositoryId: 'repo-public',
                skillId: 'template-bundle__github__anthropics%2Fskills__skills%2Fclaude-api',
                skillPath: 'template-bundle__github__anthropics%2Fskills__skills%2Fclaude-api',
                name: 'Claude API',
                repository: {
                    id: 'repo-public',
                    provider: 'workspace-public',
                    name: 'Workspace Shared Skills'
                }
            }
        ]
    })

    await service.onApplicationBootstrap()

    const result = await commands.execute(
        new ResolveTemplateSkillRefsCommand([
            {
                provider: 'github',
                repositoryName: 'anthropics/skills',
                skillId: 'skills/claude-api'
            }
        ])
    )

    expect(skillRepositoryIndexService.findAllInOrganizationOrTenant).toHaveBeenCalledWith({
        where: {
            repositoryId: 'repo-public',
            skillId: expect.objectContaining({
                _type: 'in',
                _value: ['template-bundle__github__anthropics%2Fskills__skills%2Fclaude-api']
            })
        },
        relations: ['repository'],
        take: 1,
        order: {
            updatedAt: 'DESC'
        }
    })
    expect(result).toEqual([
        {
            ref: {
                provider: 'github',
                repositoryName: 'anthropics/skills',
                skillId: 'skills/claude-api'
            },
            skill: expect.objectContaining({
                id: 'skill-public-1',
                repositoryId: 'repo-public'
            })
        }
    ])
})
