jest.mock('../../skill-repository/skill-repository.service', () => ({
    SkillRepositoryService: class SkillRepositoryService {}
}))

jest.mock('../../skill-repository/repository-index/skill-repository-index.service', () => ({
    SkillRepositoryIndexService: class SkillRepositoryIndexService {}
}))

jest.mock('@xpert-ai/server-config', () => ({
    ConfigService: class ConfigService {}
}))

jest.mock('@xpert-ai/server-core', () => ({
    LOADED_PLUGINS: 'XPERT_LOADED_PLUGINS',
    TenantBaseEntity: class TenantBaseEntity {},
    TenantAwareCrudService: class TenantAwareCrudService<T> {
        constructor(protected readonly repository: unknown) {}

        async findOneOrFailByWhereOptions() {
            return { record: null }
        }

        async update() {
            return undefined
        }

        async create() {
            return undefined
        }

        async findAll() {
            return { items: [] }
        }
    }
}))

import { CommandBus } from '@nestjs/cqrs'
import { ConfigService } from '@xpert-ai/server-config'
import type { LoadedPluginRecord } from '@xpert-ai/server-core'
import type { Cache } from 'cache-manager'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { Repository } from 'typeorm'
import { SkillRepositoryIndexService } from '../../skill-repository/repository-index/skill-repository-index.service'
import { SkillRepositoryService } from '../../skill-repository/skill-repository.service'
import { EnsureTemplateDirectoryCommand, ResolveTemplateSkillRefsCommand } from '../commands'
import { EnsureTemplateDirectoryHandler } from '../commands/handlers/ensure-template-directory.handler'
import { ResolveTemplateSkillRefsHandler } from '../commands/handlers/resolve-template-skill-refs.handler'
import { XpertTemplate } from '../xpert-template.entity'
import { XpertTemplateService } from '../xpert-template.service'

const cleanupPaths = new Set<string>()
export function cleanupTemplateFixtures() {
    for (const targetPath of cleanupPaths) rmSync(targetPath, { recursive: true, force: true })
    cleanupPaths.clear()
    jest.restoreAllMocks()
}
export function createService({
    serverRoot,
    dataPath,
    env = {},
    loadedPlugins = []
}: {
    serverRoot: string
    dataPath: string
    env?: Record<string, string>
    loadedPlugins?: unknown[]
}) {
    const cache = new Map<string, unknown>()
    const skillRepositoryService = {
        findAllInOrganizationOrTenant: jest.fn().mockResolvedValue({ items: [] })
    }
    const skillRepositoryIndexService = {
        findAllInOrganizationOrTenant: jest.fn().mockResolvedValue({ items: [] })
    }
    const cacheManager = {
        get: jest.fn(async (key: string) => cache.get(key)),
        set: jest.fn(async (key: string, value: unknown) => {
            cache.set(key, value)
        }),
        del: jest.fn(async (key: string) => {
            cache.delete(key)
        })
    }
    const configService = {
        assetOptions: { serverRoot, dataPath },
        environment: { env }
    } as ConfigService
    const initializer = new EnsureTemplateDirectoryHandler(configService)
    const commands = {
        execute: jest.fn((command: EnsureTemplateDirectoryCommand | ResolveTemplateSkillRefsCommand) => {
            if (command instanceof EnsureTemplateDirectoryCommand) return initializer.execute()
            return resolver.execute(command)
        })
    }
    const resolver = new ResolveTemplateSkillRefsHandler(
        skillRepositoryService as unknown as SkillRepositoryService,
        skillRepositoryIndexService as unknown as SkillRepositoryIndexService,
        commands as unknown as CommandBus,
        cacheManager as unknown as Cache
    )
    const service = new XpertTemplateService({} as Repository<XpertTemplate>, loadedPlugins as LoadedPluginRecord[])
    Object.defineProperties(service, {
        capabilities: { value: { compose: async (template: object) => template } },
        configService: { value: configService },
        cacheManager: { value: cacheManager },
        commands: { value: commands }
    })
    jest.spyOn(service, 'findOneOrFailByWhereOptions').mockResolvedValue({
        success: true,
        record: { id: 'record-1', visitCount: 1 } as XpertTemplate
    })
    jest.spyOn(service, 'update').mockResolvedValue(undefined)
    jest.spyOn(service, 'create').mockResolvedValue(undefined)
    jest.spyOn(service, 'findAll').mockResolvedValue({ items: [], total: 0 })
    return {
        service,
        commands,
        initializer,
        configService,
        cacheManager,
        skillRepositoryService,
        skillRepositoryIndexService
    }
}

export function createTempDir() {
    const directory = mkdtempSync(join(tmpdir(), 'xpert-template-service-'))
    cleanupPaths.add(directory)
    return directory
}

export function seedBuiltinTemplates(
    serverRoot: string,
    overrides: {
        templatesJson?: Record<string, unknown>
        mcpTemplatesJson?: Record<string, unknown>
        knowledgePipelinesJson?: Record<string, unknown>
        skillsMarketYaml?: string
        templatesMarketYaml?: string
        skillRepositoriesYaml?: string
        workspaceDefaultsYaml?: string
        templateYaml?: string
        pipelineYaml?: string
    } = {}
) {
    const builtinRoot = join(serverRoot, 'packages', 'server-ai', 'src', 'xpert-template')
    mkdirSync(join(builtinRoot, 'templates'), { recursive: true })
    mkdirSync(join(builtinRoot, 'pipelines'), { recursive: true })
    mkdirSync(join(builtinRoot, 'skill-packages'), { recursive: true })

    writeJson(
        join(builtinRoot, 'templates.json'),
        overrides.templatesJson ?? {
            templates: {
                'en-US': {
                    categories: ['builtin'],
                    recommendedApps: [{ id: 'template-1', name: 'Built-in Template' }]
                }
            },
            details: {}
        }
    )
    writeJson(
        join(builtinRoot, 'mcp-templates.json'),
        overrides.mcpTemplatesJson ?? {
            'en-US': {
                categories: ['builtin'],
                templates: [{ id: 'mcp-1', name: 'Built-in MCP' }]
            }
        }
    )
    writeJson(
        join(builtinRoot, 'knowledge-pipelines.json'),
        overrides.knowledgePipelinesJson ?? {
            'en-US': {
                categories: ['builtin'],
                templates: [{ id: 'pipeline-1', name: 'Built-in Pipeline' }]
            }
        }
    )
    writeFileSync(
        join(builtinRoot, 'skills-market.yaml'),
        overrides.skillsMarketYaml ??
            [
                'en-US:',
                '  featured: []',
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
    writeFileSync(
        join(builtinRoot, 'templates-market.yaml'),
        overrides.templatesMarketYaml ?? ['recommendedApps:', '  - id: template-1'].join('\n'),
        'utf8'
    )
    writeFileSync(
        join(builtinRoot, 'skill-repositories.yaml'),
        overrides.skillRepositoriesYaml ??
            [
                'repositories:',
                '  - name: anthropics/skills',
                '    provider: github',
                '    options:',
                '      url: https://github.com/anthropics/skills',
                '      branch: main',
                '      path: skills'
            ].join('\n'),
        'utf8'
    )
    writeFileSync(
        join(builtinRoot, 'workspace-defaults.yaml'),
        overrides.workspaceDefaultsYaml ?? ['userDefault:', '  skills: []'].join('\n'),
        'utf8'
    )
    writeFileSync(
        join(builtinRoot, 'templates', 'template-1.yaml'),
        overrides.templateYaml ?? 'source: builtin-template\n',
        'utf8'
    )
    writeFileSync(
        join(builtinRoot, 'pipelines', 'pipeline-1.yaml'),
        overrides.pipelineYaml ?? 'source: builtin-pipeline\n',
        'utf8'
    )
    writeFileSync(join(builtinRoot, 'skill-packages', '.gitkeep'), '', 'utf8')

    return builtinRoot
}

export function writeJson(filePath: string, value: Record<string, unknown>) {
    mkdirSync(dirname(filePath), { recursive: true })
    writeFileSync(filePath, JSON.stringify(value, null, 2), 'utf8')
}

export function readJson(filePath: string) {
    return JSON.parse(readFileSync(filePath, 'utf8')) as unknown
}

export function readTemplatesCatalog(filePath: string): {
    templates: Record<string, { categories?: string[]; recommendedApps: Array<{ id: string }> }>
    details: Record<string, { export_data?: string }>
} {
    return JSON.parse(readFileSync(filePath, 'utf8'))
}
