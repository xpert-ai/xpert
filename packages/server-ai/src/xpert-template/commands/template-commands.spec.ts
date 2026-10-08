import {
    cleanupTemplateFixtures,
    createService,
    createTempDir,
    seedBuiltinTemplates
} from '../testing/template-test-harness'
import { CACHE_MANAGER } from '@nestjs/cache-manager'
import { CommandBus, CqrsModule } from '@nestjs/cqrs'
import { Test } from '@nestjs/testing'
import { getRepositoryToken } from '@nestjs/typeorm'
import { ConfigService } from '@xpert-ai/server-config'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { SkillRepositoryService } from '../../skill-repository/skill-repository.service'
import { SkillRepositoryIndexService } from '../../skill-repository/repository-index/skill-repository-index.service'
import { AssistantCapabilityService } from '../capabilities/assistant-capability.service'
import { XpertTemplate } from '../xpert-template.entity'
import { XpertTemplateService } from '../xpert-template.service'
import { EnsureTemplateDirectoryCommand, ResolveTemplateSkillRefsCommand } from './index'
import { CommandHandlers } from './handlers'

afterEach(cleanupTemplateFixtures)

it('registers both commands and initializes assets after CQRS handlers become available', async () => {
    const serverRoot = createTempDir()
    const dataPath = createTempDir()
    seedBuiltinTemplates(serverRoot)
    const fixture = createService({ serverRoot, dataPath })
    const module = await Test.createTestingModule({
        imports: [CqrsModule.forRoot()],
        providers: [
            ...CommandHandlers,
            XpertTemplateService,
            { provide: ConfigService, useValue: fixture.configService },
            { provide: CACHE_MANAGER, useValue: fixture.cacheManager },
            { provide: getRepositoryToken(XpertTemplate), useValue: {} },
            { provide: AssistantCapabilityService, useValue: {} },
            { provide: SkillRepositoryService, useValue: fixture.skillRepositoryService },
            { provide: SkillRepositoryIndexService, useValue: fixture.skillRepositoryIndexService }
        ]
    }).compile()
    try {
        await module.init()
        const root = join(dataPath, 'xpert-template')
        expect(existsSync(join(root, 'templates.json'))).toBe(true)
        const commands = module.get(CommandBus)
        await expect(commands.execute(new EnsureTemplateDirectoryCommand())).resolves.toBe(root)
        await expect(commands.execute(new ResolveTemplateSkillRefsCommand([]))).resolves.toEqual([])

        const ref = { provider: 'github', repositoryName: 'sample/skills', skillId: 'write' }
        for (const scope of ['organization-a', 'organization-b']) {
            fixture.skillRepositoryService.findAllInOrganizationOrTenant.mockResolvedValue({
                items: [{ id: scope, organizationId: scope, provider: ref.provider, name: ref.repositoryName }]
            })
            fixture.skillRepositoryIndexService.findAllInOrganizationOrTenant.mockResolvedValue({
                items: [{ id: `${scope}-skill`, repositoryId: scope, skillId: ref.skillId }]
            })
            await expect(commands.execute(new ResolveTemplateSkillRefsCommand([ref]))).resolves.toMatchObject([
                { ref, skill: { id: `${scope}-skill` } }
            ])
            expect(fixture.skillRepositoryIndexService.findAllInOrganizationOrTenant).toHaveBeenLastCalledWith(
                expect.objectContaining({ where: expect.objectContaining({ repositoryId: scope }) })
            )
        }
    } finally {
        await module.close()
    }
})

it('shares concurrent directory initialization and preserves later edits', async () => {
    const serverRoot = createTempDir()
    const dataPath = createTempDir()
    seedBuiltinTemplates(serverRoot)
    const { initializer } = createService({ serverRoot, dataPath })
    const first = initializer.execute()
    const second = initializer.execute()
    expect(second).toBe(first)
    const root = await first
    const file = join(root, 'templates', 'template-1.yaml')
    writeFileSync(file, 'user changes')
    await initializer.execute()
    expect(readFileSync(file, 'utf8')).toBe('user changes')
})

it('allows retrying initialization after a missing template source is restored', async () => {
    const serverRoot = createTempDir()
    const dataPath = createTempDir()
    const { initializer } = createService({ serverRoot, dataPath })
    await expect(initializer.execute()).rejects.toThrow('Built-in xpert template source')
    seedBuiltinTemplates(serverRoot)
    await expect(initializer.execute()).resolves.toBe(join(dataPath, 'xpert-template'))
})
