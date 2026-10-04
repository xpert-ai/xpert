import { LanguagesEnum } from '@xpert-ai/contracts'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import {
    cleanupTemplateFixtures,
    createService,
    createTempDir,
    seedBuiltinTemplates,
    writeJson
} from './testing/template-test-harness'

afterEach(cleanupTemplateFixtures)
it('preserves featured avatars from skills market config when resolving featured skills', async () => {
    const workspaceRoot = createTempDir()
    const dataRoot = createTempDir()
    const externalRoot = join(dataRoot, 'external-templates')

    seedBuiltinTemplates(workspaceRoot)
    mkdirSync(externalRoot, { recursive: true })
    writeFileSync(
        join(externalRoot, 'skills-market.yaml'),
        [
            'en-US:',
            '  featured:',
            '    - provider: github',
            '      repositoryName: anthropics/skills',
            '      skillId: skills/claude-api',
            '      avatar:',
            '        type: font',
            '        value: ri-code-box-line',
            '        size: 22',
            '  filters:',
            '    roles:',
            '      label: Roles',
            '      options: []',
            '    appTypes:',
            '      label: Application types',
            '      options: []',
            '    hot:',
            '      label: Trending',
            '      options: []'
        ].join('\n'),
        'utf8'
    )

    const { service, skillRepositoryService, skillRepositoryIndexService } = createService({
        serverRoot: workspaceRoot,
        dataPath: join(dataRoot, 'fallback-data'),
        env: {
            XPERT_TEMPLATE_DIR: externalRoot
        }
    })

    skillRepositoryService.findAllInOrganizationOrTenant.mockResolvedValue({
        items: [
            {
                id: 'repo-1',
                provider: 'github',
                name: 'anthropics/skills'
            }
        ]
    })
    skillRepositoryIndexService.findAllInOrganizationOrTenant.mockResolvedValue({
        items: [
            {
                id: 'skill-1',
                repositoryId: 'repo-1',
                skillId: 'skills/claude-api',
                skillPath: 'skills/claude-api',
                name: 'Claude API',
                repository: {
                    id: 'repo-1',
                    provider: 'github',
                    name: 'anthropics/skills'
                }
            }
        ]
    })

    await service.onApplicationBootstrap()

    const skillsMarket = await service.getSkillsMarket(LanguagesEnum.English)

    expect(skillsMarket.featured).toHaveLength(1)
    expect(skillsMarket.featured[0].avatar).toEqual({
        type: 'font',
        value: 'ri-code-box-line',
        size: 22
    })
    expect(skillsMarket.featured[0].skill.id).toBe('skill-1')
})

it('normalizes workspace defaults config and trims invalid entries', async () => {
    const workspaceRoot = createTempDir()
    const dataRoot = createTempDir()
    const externalRoot = join(dataRoot, 'external-templates')

    seedBuiltinTemplates(workspaceRoot)
    mkdirSync(externalRoot, { recursive: true })
    writeFileSync(
        join(externalRoot, 'workspace-defaults.yaml'),
        [
            'userDefault:',
            '  skills:',
            '    - provider: github',
            '      repositoryName: anthropics/skills',
            '      skillId: skills/claude-api',
            '    - provider: "  "',
            '      repositoryName: ignored/repo',
            '      skillId: ignored-skill',
            '    - provider: clawhub',
            '      repositoryName: clawhub/official',
            '      skillId: mcporter'
        ].join('\n'),
        'utf8'
    )

    const { service } = createService({
        serverRoot: workspaceRoot,
        dataPath: join(dataRoot, 'fallback-data'),
        env: {
            XPERT_TEMPLATE_DIR: externalRoot
        }
    })

    await service.onApplicationBootstrap()

    await expect(service.readWorkspaceDefaults()).resolves.toEqual({
        userDefault: {
            skills: [
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
            ]
        }
    })
})

it('normalizes skill repository config and trims invalid entries', async () => {
    const workspaceRoot = createTempDir()
    const dataRoot = createTempDir()
    const externalRoot = join(dataRoot, 'external-templates')

    seedBuiltinTemplates(workspaceRoot)
    mkdirSync(externalRoot, { recursive: true })
    writeFileSync(
        join(externalRoot, 'skill-repositories.yaml'),
        [
            'repositories:',
            '  - name: " anthropics/skills "',
            '    provider: " github "',
            '    options:',
            '      url: https://github.com/anthropics/skills',
            '      branch: main',
            '  - provider: github',
            '  - name: clawhub/official',
            '    provider: clawhub',
            '    credentials: invalid',
            '  - name: clawhub/official',
            '    provider: clawhub',
            '    credentials:',
            '      token: abc'
        ].join('\n'),
        'utf8'
    )

    const { service } = createService({
        serverRoot: workspaceRoot,
        dataPath: join(dataRoot, 'fallback-data'),
        env: {
            XPERT_TEMPLATE_DIR: externalRoot
        }
    })

    await service.onApplicationBootstrap()

    await expect(service.readSkillRepositories()).resolves.toEqual({
        repositories: [
            {
                name: 'anthropics/skills',
                provider: 'github',
                options: {
                    url: 'https://github.com/anthropics/skills',
                    branch: 'main'
                }
            },
            {
                name: 'clawhub/official',
                provider: 'clawhub',
                credentials: {
                    token: 'abc'
                }
            }
        ]
    })
})

it('returns bootstrap default skill refs without requiring skills-market featured entries', async () => {
    const workspaceRoot = createTempDir()
    const dataRoot = createTempDir()
    const externalRoot = join(dataRoot, 'external-templates')

    seedBuiltinTemplates(workspaceRoot)
    mkdirSync(externalRoot, { recursive: true })
    writeFileSync(
        join(externalRoot, 'skills-market.yaml'),
        [
            'en-US:',
            '  featured:',
            '    - provider: github',
            '      repositoryName: anthropics/skills',
            '      skillId: skills/claude-api',
            '  filters:',
            '    roles:',
            '      label: Roles',
            '      options:',
            '        - value: all',
            '          label: All roles',
            '    appTypes:',
            '      label: Application types',
            '      options:',
            '        - value: all',
            '          label: All types',
            '    hot:',
            '      label: Trending',
            '      options:',
            '        - value: all',
            '          label: Default'
        ].join('\n'),
        'utf8'
    )
    writeFileSync(
        join(externalRoot, 'workspace-defaults.yaml'),
        [
            'userDefault:',
            '  skills:',
            '    - provider: github',
            '      repositoryName: anthropics/skills',
            '      skillId: skills/claude-api',
            '    - provider: clawhub',
            '      repositoryName: clawhub/official',
            '      skillId: mcporter'
        ].join('\n'),
        'utf8'
    )

    const { service } = createService({
        serverRoot: workspaceRoot,
        dataPath: join(dataRoot, 'fallback-data'),
        env: {
            XPERT_TEMPLATE_DIR: externalRoot
        }
    })

    await service.onApplicationBootstrap()

    await expect(service.getBootstrapDefaultSkillRefs()).resolves.toEqual([
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
})

it('keeps market-facing default skill refs aligned with skills-market featured refs', async () => {
    const workspaceRoot = createTempDir()
    const dataRoot = createTempDir()
    const externalRoot = join(dataRoot, 'external-templates')

    seedBuiltinTemplates(workspaceRoot)
    mkdirSync(externalRoot, { recursive: true })
    writeFileSync(
        join(externalRoot, 'skills-market.yaml'),
        [
            'en-US:',
            '  featured:',
            '    - provider: github',
            '      repositoryName: anthropics/skills',
            '      skillId: skills/claude-api',
            '  filters:',
            '    roles:',
            '      label: Roles',
            '      options:',
            '        - value: all',
            '          label: All roles',
            '    appTypes:',
            '      label: Application types',
            '      options:',
            '        - value: all',
            '          label: All types',
            '    hot:',
            '      label: Trending',
            '      options:',
            '        - value: all',
            '          label: Default'
        ].join('\n'),
        'utf8'
    )
    writeFileSync(
        join(externalRoot, 'workspace-defaults.yaml'),
        [
            'userDefault:',
            '  skills:',
            '    - provider: github',
            '      repositoryName: anthropics/skills',
            '      skillId: skills/claude-api',
            '    - provider: clawhub',
            '      repositoryName: clawhub/official',
            '      skillId: mcporter'
        ].join('\n'),
        'utf8'
    )

    const { service } = createService({
        serverRoot: workspaceRoot,
        dataPath: join(dataRoot, 'fallback-data'),
        env: {
            XPERT_TEMPLATE_DIR: externalRoot
        }
    })

    await service.onApplicationBootstrap()

    await expect(service.getUserDefaultSkillRefs()).resolves.toEqual([
        {
            provider: 'github',
            repositoryName: 'anthropics/skills',
            skillId: 'skills/claude-api'
        }
    ])
})

it('parses template skill bundle directories using bundle.yaml', async () => {
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
    writeFileSync(join(externalRoot, 'skill-packages', 'README.md'), 'ignore me', 'utf8')

    const { service } = createService({
        serverRoot: workspaceRoot,
        dataPath: join(dataRoot, 'fallback-data'),
        env: {
            XPERT_TEMPLATE_DIR: externalRoot
        }
    })

    await service.onApplicationBootstrap()

    await expect(service.getTemplateSkillBundles()).resolves.toEqual([
        {
            directoryName: 'claude-api-bundle',
            directoryPath: bundleRoot,
            sharedSkillId: 'template-bundle__github__anthropics%2Fskills__skills%2Fclaude-api',
            ref: {
                provider: 'github',
                repositoryName: 'anthropics/skills',
                skillId: 'skills/claude-api'
            }
        }
    ])
})

it('infers local template bundle refs from standard skill package directories', async () => {
    const workspaceRoot = createTempDir()
    const dataRoot = createTempDir()
    const externalRoot = join(dataRoot, 'external-templates')
    const bundleRoot = join(externalRoot, 'skill-packages', 'slides')

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
    writeFileSync(join(bundleRoot, 'SKILL.md'), '---\nname: slides\ndescription: Example\n---\n', 'utf8')

    const { service } = createService({
        serverRoot: workspaceRoot,
        dataPath: join(dataRoot, 'fallback-data'),
        env: {
            XPERT_TEMPLATE_DIR: externalRoot
        }
    })

    await service.onApplicationBootstrap()

    await expect(service.getTemplateSkillBundles()).resolves.toEqual([
        {
            directoryName: 'slides',
            directoryPath: bundleRoot,
            sharedSkillId: 'template-bundle__local__root%2Fskills__slides',
            ref: {
                provider: 'local',
                repositoryName: 'root/skills',
                skillId: 'slides'
            }
        }
    ])
})

it('invalidates all cached template skill asset entries', async () => {
    const workspaceRoot = createTempDir()
    const dataRoot = createTempDir()
    seedBuiltinTemplates(workspaceRoot)

    const { cacheManager, service } = createService({
        serverRoot: workspaceRoot,
        dataPath: dataRoot
    })

    await service.invalidateSkillTemplateCaches()

    expect(cacheManager.del).toHaveBeenCalledTimes(4)
    expect(cacheManager.del).toHaveBeenCalledWith('xpert:skills-market')
    expect(cacheManager.del).toHaveBeenCalledWith('xpert:skill-repositories')
    expect(cacheManager.del).toHaveBeenCalledWith('xpert:workspace-defaults')
    expect(cacheManager.del).toHaveBeenCalledWith('xpert:template-skill-bundles')
})
