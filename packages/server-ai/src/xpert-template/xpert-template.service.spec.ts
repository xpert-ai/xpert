import { LanguagesEnum, XpertTypeEnum } from '@xpert-ai/contracts'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import {
    cleanupTemplateFixtures,
    createService,
    createTempDir,
    readTemplatesCatalog,
    seedBuiltinTemplates,
    writeJson
} from './testing/template-test-harness'

afterEach(cleanupTemplateFixtures)
it('reads templates and yaml assets only from the external directory after initialization', async () => {
    const workspaceRoot = createTempDir()
    const dataRoot = createTempDir()
    const externalRoot = join(dataRoot, 'external-templates')

    seedBuiltinTemplates(workspaceRoot, {
        templatesJson: {
            templates: {
                'en-US': {
                    categories: ['builtin'],
                    recommendedApps: [{ id: 'template-1', name: 'Built-in Template' }]
                }
            },
            details: {}
        },
        mcpTemplatesJson: {
            'en-US': {
                categories: ['builtin'],
                templates: [{ id: 'mcp-1', name: 'Built-in MCP' }]
            }
        },
        knowledgePipelinesJson: {
            'en-US': {
                categories: ['builtin'],
                templates: [{ id: 'pipeline-1', name: 'Built-in Pipeline' }]
            }
        },
        templateYaml: 'source: builtin-template\n',
        pipelineYaml: 'source: builtin-pipeline\n'
    })

    mkdirSync(join(externalRoot, 'templates'), { recursive: true })
    mkdirSync(join(externalRoot, 'pipelines'), { recursive: true })
    writeJson(join(externalRoot, 'templates.json'), {
        templates: {
            'en-US': {
                categories: ['external'],
                recommendedApps: [{ id: 'template-1', name: 'External Template' }]
            }
        },
        details: {}
    })
    writeJson(join(externalRoot, 'mcp-templates.json'), {
        'en-US': {
            categories: ['external'],
            templates: [{ id: 'mcp-1', name: 'External MCP' }]
        }
    })
    writeJson(join(externalRoot, 'knowledge-pipelines.json'), {
        'en-US': {
            categories: ['external'],
            templates: [{ id: 'pipeline-1', name: 'External Pipeline' }]
        }
    })
    writeFileSync(
        join(externalRoot, 'skills-market.yaml'),
        [
            'en-US:',
            '  featured:',
            '    - provider: github',
            '      repositoryName: anthropics/skills',
            '      skillId: skills/claude-api',
            '      badge: Official Picks',
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
    writeFileSync(join(externalRoot, 'templates', 'template-1.yaml'), 'source: external-template\n', 'utf8')
    writeFileSync(join(externalRoot, 'pipelines', 'pipeline-1.yaml'), 'source: external-pipeline\n', 'utf8')

    const { service } = createService({
        serverRoot: workspaceRoot,
        dataPath: join(dataRoot, 'fallback-data'),
        env: {
            XPERT_TEMPLATE_DIR: externalRoot
        }
    })

    await service.onApplicationBootstrap()

    const templatesFile = await service.readTemplatesFile()
    const mcpTemplates = await service.readMCPTemplates()
    const templateDetail = await service.getTemplateDetail('template-1', LanguagesEnum.English)
    const knowledgePipeline = await service.getKnowledgePipeline(LanguagesEnum.English, 'pipeline-1')
    const skillsMarket = await service.getSkillsMarket(LanguagesEnum.English)
    const workspaceDefaults = await service.readWorkspaceDefaults()

    expect(templatesFile.templates['en-US'].categories).toEqual(['external'])
    expect(mcpTemplates['en-US'].templates[0].name).toBe('External MCP')
    expect(templateDetail.name).toBe('External Template')
    expect(templateDetail.export_data).toBe('source: external-template\n')
    expect(knowledgePipeline.name).toBe('External Pipeline')
    expect(knowledgePipeline.export_data).toBe('source: external-pipeline\n')
    expect(skillsMarket.filters.roles.label).toBe('Roles')
    expect(skillsMarket.featured).toEqual([])
    expect(workspaceDefaults.userDefault.skills).toEqual([])
})

it('resolves template details from another language group when the requested language catalog misses the template', async () => {
    const workspaceRoot = createTempDir()
    const dataRoot = createTempDir()
    const builtinRoot = seedBuiltinTemplates(workspaceRoot, {
        templatesJson: {
            templates: {
                'en-US': {
                    categories: ['builtin'],
                    recommendedApps: [{ id: 'template-1', name: 'English Template' }]
                },
                'zh-Hans': {
                    categories: ['builtin'],
                    recommendedApps: [
                        {
                            id: 'xpert-my-claw-xpert',
                            name: 'ClawXpert',
                            dependencies: {
                                plugins: ['@xpert-ai/plugin-file-memory']
                            }
                        }
                    ]
                }
            },
            details: {}
        }
    })
    writeFileSync(join(builtinRoot, 'templates', 'xpert-my-claw-xpert.yaml'), 'team:\n  name: ClawXpert\n', 'utf8')
    const { service } = createService({
        serverRoot: workspaceRoot,
        dataPath: dataRoot
    })

    await service.onApplicationBootstrap()

    const detail = await service.getTemplateDetail('xpert-my-claw-xpert', LanguagesEnum.English)

    expect(detail.dependencies?.plugins).toEqual(['@xpert-ai/plugin-file-memory'])
    expect(detail.export_data).toBe('team:\n  name: ClawXpert\n')
})

it('enriches stale external template metadata with builtin plugin dependencies', async () => {
    const workspaceRoot = createTempDir()
    const dataRoot = createTempDir()
    const externalRoot = join(dataRoot, 'external-templates')
    seedBuiltinTemplates(workspaceRoot, {
        templatesJson: {
            templates: {
                'zh-Hans': {
                    categories: ['builtin'],
                    recommendedApps: [
                        {
                            id: 'xpert-my-claw-xpert',
                            name: 'ClawXpert',
                            dependencies: {
                                plugins: ['@xpert-ai/plugin-file-memory']
                            }
                        }
                    ]
                }
            },
            details: {}
        }
    })
    mkdirSync(join(externalRoot, 'templates'), { recursive: true })
    writeJson(join(externalRoot, 'templates.json'), {
        templates: {
            'zh-Hans': {
                categories: ['stale'],
                recommendedApps: [{ id: 'xpert-my-claw-xpert', name: 'Old ClawXpert' }]
            }
        },
        details: {
            'xpert-my-claw-xpert': {
                id: 'xpert-my-claw-xpert',
                name: 'Old ClawXpert Detail'
            }
        }
    })
    writeFileSync(join(externalRoot, 'templates', 'xpert-my-claw-xpert.yaml'), 'team:\n  name: Old ClawXpert\n', 'utf8')
    const { service } = createService({
        serverRoot: workspaceRoot,
        dataPath: join(dataRoot, 'fallback-data'),
        env: {
            XPERT_TEMPLATE_DIR: externalRoot
        }
    })

    await service.onApplicationBootstrap()

    const detail = await service.getTemplateDetail('xpert-my-claw-xpert', LanguagesEnum.SimplifiedChinese)

    expect(detail.name).toBe('Old ClawXpert Detail')
    expect(detail.dependencies?.plugins).toEqual(['@xpert-ai/plugin-file-memory'])
    expect(detail.export_data).toBe('team:\n  name: Old ClawXpert\n')
})

it('saves an exported xpert template file and registers it in the template catalog', async () => {
    const workspaceRoot = createTempDir()
    const dataRoot = createTempDir()
    const externalRoot = join(dataRoot, 'external-templates')
    const dslYaml = 'team:\n  name: Support Expert\n'

    seedBuiltinTemplates(workspaceRoot, {
        templatesJson: {
            templates: {
                'en-US': {
                    categories: ['builtin'],
                    recommendedApps: [{ id: 'template-1', name: 'Built-in Template' }]
                },
                'zh-Hans': {
                    categories: ['builtin'],
                    recommendedApps: [{ id: 'template-1', name: 'Built-in Template' }]
                }
            },
            details: {}
        }
    })
    const { service } = createService({
        serverRoot: workspaceRoot,
        dataPath: join(dataRoot, 'fallback-data'),
        env: {
            XPERT_TEMPLATE_DIR: externalRoot
        }
    })

    await service.onApplicationBootstrap()
    const exportedTemplate = await service.saveExportedXpertTemplate({
        xpert: {
            id: 'xpert-1',
            name: 'Support Expert',
            title: 'Support',
            description: 'Handles support tickets',
            type: XpertTypeEnum.Agent
        },
        dslYaml,
        isDraft: true,
        includeMemory: false
    })
    const catalog = readTemplatesCatalog(join(externalRoot, 'templates.json'))
    const detail = await service.getTemplateDetail(exportedTemplate.id, LanguagesEnum.English)

    expect(exportedTemplate).toMatchObject({
        id: 'xpert-xpert-1',
        filePath: 'templates/xpert-xpert-1.yaml',
        isDraft: true,
        includeMemory: false
    })
    expect(readFileSync(join(externalRoot, exportedTemplate.filePath), 'utf8')).toBe(dslYaml)
    expect(catalog.templates['en-US'].categories).toEqual(expect.arrayContaining(['Xpert']))
    expect(catalog.templates['en-US'].recommendedApps[0]).toMatchObject({
        id: exportedTemplate.id,
        name: 'Support Expert',
        title: 'Support',
        type: XpertTypeEnum.Agent,
        category: 'Xpert'
    })
    expect(catalog.templates['zh-Hans'].categories).toEqual(expect.arrayContaining(['Xpert']))
    expect(catalog.templates['zh-Hans'].recommendedApps[0].id).toBe(exportedTemplate.id)
    expect(catalog.details[exportedTemplate.id]).not.toHaveProperty('export_data')
    expect(detail.export_data).toBe(dslYaml)
})

it('deletes an exported xpert template file and removes its catalog records', async () => {
    const workspaceRoot = createTempDir()
    const dataRoot = createTempDir()
    const externalRoot = join(dataRoot, 'external-templates')

    seedBuiltinTemplates(workspaceRoot)
    const { service } = createService({
        serverRoot: workspaceRoot,
        dataPath: join(dataRoot, 'fallback-data'),
        env: {
            XPERT_TEMPLATE_DIR: externalRoot
        }
    })

    await service.onApplicationBootstrap()
    const exportedTemplate = await service.saveExportedXpertTemplate({
        xpert: {
            id: 'xpert-1',
            name: 'Support Expert',
            title: 'Support',
            description: 'Handles support tickets',
            type: XpertTypeEnum.Agent
        },
        dslYaml: 'team:\n  name: Support Expert\n',
        isDraft: false,
        includeMemory: true
    })

    await service.deleteExportedXpertTemplate(exportedTemplate)
    await expect(service.deleteExportedXpertTemplate(exportedTemplate)).resolves.toBeUndefined()

    const catalog = readTemplatesCatalog(join(externalRoot, 'templates.json'))
    expect(existsSync(join(externalRoot, exportedTemplate.filePath))).toBe(false)
    expect(catalog.templates['en-US'].recommendedApps.some((item) => item.id === exportedTemplate.id)).toBe(false)
    expect(catalog.details).not.toHaveProperty(exportedTemplate.id)
})

it('returns every configured recommendation in configuration order without a fixed limit', async () => {
    const workspaceRoot = createTempDir()
    const dataRoot = createTempDir()
    const externalRoot = join(dataRoot, 'external-templates')
    const configuredIds = Array.from({ length: 7 }, (_, index) => `template-${7 - index}`)
    seedBuiltinTemplates(workspaceRoot, {
        templatesJson: {
            templates: {
                'en-US': {
                    categories: ['Built-in'],
                    recommendedApps: Array.from({ length: 7 }, (_, index) => ({
                        id: `template-${index + 1}`,
                        name: `Template ${index + 1}`,
                        category: 'Built-in'
                    }))
                }
            },
            details: {}
        },
        templatesMarketYaml: ['recommendedApps:', ...configuredIds.map((id) => `  - id: ${id}`)].join('\n')
    })
    mkdirSync(externalRoot, { recursive: true })
    writeJson(join(externalRoot, 'templates.json'), {
        templates: {
            'en-US': {
                categories: ['External'],
                recommendedApps: Array.from({ length: 7 }, (_, index) => ({
                    id: `template-${index + 1}`,
                    name: `External Template ${index + 1}`,
                    category: 'External'
                }))
            }
        },
        details: {}
    })
    const { service } = createService({
        serverRoot: workspaceRoot,
        dataPath: join(dataRoot, 'fallback-data'),
        env: {
            XPERT_TEMPLATE_DIR: externalRoot
        }
    })

    const catalog = await service.getAll(LanguagesEnum.English)
    const recommendations = await service.getMarketplaceRecommendedTemplates(LanguagesEnum.English)

    expect(catalog.recommendedApps.map((template) => template.id)).toEqual(
        Array.from({ length: 7 }, (_, index) => `template-${index + 1}`)
    )
    expect(recommendations.map((template) => template.id)).toEqual(configuredIds)
})

it('resolves configured plugin templates with namespaced ids and skips unavailable refs', async () => {
    const workspaceRoot = createTempDir()
    const dataRoot = createTempDir()
    const pluginDsl = [
        'team:',
        '  name: Plugin Business',
        '  description:',
        '    en_US: English plugin description',
        '    zh_Hans: 中文插件描述',
        '  avatar:',
        '    url: data:image/svg+xml;base64,PHN2Zz48L3N2Zz4='
    ].join('\n')
    seedBuiltinTemplates(workspaceRoot, {
        templatesJson: {
            templates: {
                'en-US': {
                    categories: ['Built-in'],
                    recommendedApps: [{ id: 'builtin-1', name: 'Built-in Template', category: 'Built-in' }]
                }
            },
            details: {}
        },
        templatesMarketYaml: [
            'recommendedApps:',
            '  - id: "@xpert-ai/plugin-demo:business"',
            '  - id: "@xpert-ai/plugin-missing:assistant"'
        ].join('\n')
    })
    const { service } = createService({
        serverRoot: workspaceRoot,
        dataPath: dataRoot,
        loadedPlugins: [
            {
                organizationId: 'global',
                name: '@xpert-ai/plugin-demo',
                packageName: '@xpert-ai/plugin-demo@0.1.0',
                ctx: {},
                instance: {
                    meta: {
                        displayName: 'Demo Plugin',
                        targetApps: ['data-xpert'],
                        targetAppMeta: {
                            'data-xpert': {
                                types: ['business-assistant'],
                                marketplace: {
                                    contents: [
                                        {
                                            type: 'app',
                                            name: 'demo-studio',
                                            displayName: 'Demo Studio',
                                            appConfig: {
                                                scope: 'organization',
                                                assistantTemplateKey: 'business',
                                                workspace: {
                                                    mode: 'dedicated',
                                                    name: 'Demo Workspace',
                                                    sharing: 'organization'
                                                }
                                            }
                                        }
                                    ]
                                }
                            }
                        }
                    },
                    templates: [
                        {
                            key: 'business',
                            name: 'Plugin Business',
                            title: {
                                en_US: 'Plugin Business Assistant',
                                zh_Hans: '插件业务助手'
                            },
                            description: {
                                en_US: 'Plugin contributed template',
                                zh_Hans: '插件贡献的模板'
                            },
                            category: 'Plugin',
                            type: XpertTypeEnum.Agent,
                            dslContent: pluginDsl,
                            promptWorkflows: [
                                {
                                    name: 'presentation-create',
                                    template: 'Create a presentation from {{args}}.',
                                    visibility: 'team'
                                }
                            ],
                            order: 1
                        }
                    ]
                }
            }
        ]
    })

    const query = {
        targetApp: 'data-xpert',
        templateType: 'business-assistant'
    }
    const catalog = await service.getAll(LanguagesEnum.English, query)
    const chineseCatalog = await service.getAll(LanguagesEnum.SimplifiedChinese, query)
    const recommendations = await service.getMarketplaceRecommendedTemplates(LanguagesEnum.English, query)
    const detail = await service.getTemplateDetail('@xpert-ai/plugin-demo:business', LanguagesEnum.English, query)
    const chineseDetail = await service.getTemplateDetail(
        '@xpert-ai/plugin-demo:business',
        LanguagesEnum.SimplifiedChinese,
        query
    )
    const legacyVersionedDetail = await service.getTemplateDetail(
        '@xpert-ai/plugin-demo@0.1.0:business',
        LanguagesEnum.English,
        query
    )
    const legacyBareDetail = await service.getTemplateDetail('business', LanguagesEnum.English, query)

    expect(catalog.recommendedApps.map((template) => template.id)).toEqual(['@xpert-ai/plugin-demo:business'])
    expect(chineseCatalog.recommendedApps[0]).toMatchObject({
        title: '插件业务助手',
        description: '中文插件描述',
        avatar: { url: 'data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=' }
    })
    expect(recommendations.map((template) => template.id)).toEqual(['@xpert-ai/plugin-demo:business'])
    expect(catalog.categories).toEqual(expect.arrayContaining(['Built-in', 'Plugin']))
    expect(detail).toMatchObject({
        id: '@xpert-ai/plugin-demo:business',
        key: '@xpert-ai/plugin-demo:business',
        type: XpertTypeEnum.Agent,
        source: 'plugin',
        pluginDisplayName: 'Demo Plugin',
        title: 'Plugin Business Assistant',
        description: 'English plugin description',
        avatar: { url: 'data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=' },
        export_data: pluginDsl,
        promptWorkflows: [
            {
                name: 'presentation-create',
                template: 'Create a presentation from {{args}}.',
                visibility: 'team'
            }
        ],
        application: {
            id: '@xpert-ai/plugin-demo:demo-studio',
            pluginName: '@xpert-ai/plugin-demo',
            appName: 'demo-studio',
            displayName: 'Demo Studio',
            scope: 'organization',
            assistantTemplateKey: 'business'
        }
    })
    expect(chineseDetail.description).toBe('中文插件描述')
    expect(legacyVersionedDetail.id).toBe('@xpert-ai/plugin-demo:business')
    expect(legacyBareDetail.id).toBe('@xpert-ai/plugin-demo:business')
})

it('lists a scoped catalog without resolving bodies, then resolves only the chosen language', async () => {
    const workspaceRoot = createTempDir()
    const dataRoot = createTempDir()
    seedBuiltinTemplates(workspaceRoot, {
        templatesJson: { templates: { 'en-US': { categories: [], recommendedApps: [] } }, details: {} },
        templatesMarketYaml: 'recommendedApps: []'
    })
    const resolveTemplate = jest.fn((_ctx: object, key: string, locale: string) => ({
        key,
        title: 'Resolved role',
        type: XpertTypeEnum.Agent,
        locale,
        contentHash: 'body-v1',
        pluginVersion: '0.1.0',
        dslContent: JSON.stringify({ team: { name: key, agent: { prompt: locale } } })
    }))
    const { service } = createService({
        serverRoot: workspaceRoot,
        dataPath: dataRoot,
        loadedPlugins: [
            {
                organizationId: 'global',
                name: '@xpert-ai/agency',
                packageName: '@xpert-ai/agency@0.1.0',
                ctx: {},
                instance: {
                    meta: { displayName: { en_US: 'Agency', zh_Hans: 'Agency roles' } },
                    templates: {
                        kind: 'catalog',
                        resolveTemplate,
                        listTemplates: () =>
                            Array.from({ length: 110 }, (_, index) => ({
                                key: `role-${index}`,
                                title: `Role ${index}`,
                                category: 'engineering',
                                availableLocales: ['en-US', 'zh-Hans'],
                                defaultLocale: 'zh-Hans'
                            }))
                    }
                }
            }
        ]
    })
    const page = await service.getCatalog(LanguagesEnum.English, { offset: 24, limit: 24 })
    expect(page.total).toBe(110)
    expect(page.items).toHaveLength(24)
    expect(page.items[0]).not.toHaveProperty('export_data')
    expect(page.items[0]).not.toHaveProperty('dslContent')
    expect(resolveTemplate).not.toHaveBeenCalled()
    expect(await service.getMarketplaceRecommendedTemplates(LanguagesEnum.English)).toEqual([])
    const detail = await service.getTemplateDetail('@xpert-ai/agency:role-7', LanguagesEnum.English, {
        locale: 'zh-Hans'
    })
    expect(resolveTemplate).toHaveBeenCalledTimes(1)
    expect(resolveTemplate).toHaveBeenCalledWith({}, 'role-7', 'zh-Hans')
    expect(detail.locale).toBe('zh-Hans')
    expect(detail.contentHash).toBe('body-v1')
    expect(JSON.parse(detail.export_data).team.agent.prompt).toBe('zh-Hans')
    await expect(service.getTemplateDetail('@xpert-ai/agency:missing', LanguagesEnum.English)).rejects.toThrow()
    expect(resolveTemplate).toHaveBeenCalledTimes(1)
    const preferred = await service.getTemplateDetail('@xpert-ai/agency:role-8', LanguagesEnum.English)
    expect(resolveTemplate).toHaveBeenLastCalledWith({}, 'role-8', 'zh-Hans')
    expect(preferred.locale).toBe('zh-Hans')
    await service.getTemplateDetail('@xpert-ai/agency:role-8', LanguagesEnum.English, { locale: 'en-US' })
    expect(resolveTemplate).toHaveBeenLastCalledWith({}, 'role-8', 'en-US')
})
