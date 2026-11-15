jest.mock('../../skill-package.entity', () => ({
    SkillPackage: class SkillPackage {}
}))

jest.mock('../../skill-package.service', () => ({
    SkillPackageService: class SkillPackageService {}
}))

jest.mock('../../../skill-repository/repository-index/skill-repository-index.service', () => ({
    SkillRepositoryIndexService: class SkillRepositoryIndexService {}
}))

jest.mock('../../../xpert-workspace', () => ({
    getWorkspaceRoot: jest.fn(() => '/workspace-root')
}))

jest.mock('../../../xpert-workspace/workspace.entity', () => ({
    XpertWorkspace: class XpertWorkspace {}
}))

jest.mock('../../../sandbox', () => ({
    SandboxAcquireBackendCommand: class SandboxAcquireBackendCommand {
        constructor(public readonly payload: unknown) {}
    },
    SandboxCopyTreeCommand: class SandboxCopyTreeCommand {
        constructor(
            public readonly sandbox: unknown,
            public readonly copyTree: unknown
        ) {}
    }
}))

import { SkillsMiddleware } from './index'
import {
    InstallProjectSkillCommand,
    ListProjectSkillsCommand
} from '../../../xpert-project/commands/project-skills.command'
import type { TXpertProjectSkills } from '@xpert-ai/contracts'

function fixture(projectId: string | null = 'project-1') {
    const installed: TXpertProjectSkills['items'] = []
    const workspace = { ensureInstalledSkillPackage: jest.fn() }
    const catalog = {
        findMarketplace: jest
            .fn()
            .mockResolvedValue({ items: [{ id: 'index-1', repositoryId: 'repo-1', name: 'Testing' }], total: 1 })
    }
    const commands = {
        execute: jest.fn(async (command: ListProjectSkillsCommand | InstallProjectSkillCommand) => {
            if (command instanceof ListProjectSkillsCommand) return { items: [...installed], total: installed.length }
            const item = installed.find((item) => item.skillIndexId === command.indexId) ?? {
                id: 'testing',
                name: 'Testing',
                path: 'skills/testing/SKILL.md',
                enabled: true,
                source: 'repository' as const,
                skillIndexId: command.indexId
            }
            if (!installed.includes(item)) installed.push(item)
            return item
        })
    }
    const middleware = new SkillsMiddleware(
        { find: jest.fn().mockResolvedValue([]) } as never,
        { assertCanRun: jest.fn() } as never,
        workspace as never,
        catalog as never
    )
    Reflect.set(middleware, 'commandBus', commands)
    const context = {
        tenantId: 'tenant-1',
        organizationId: 'organization-1',
        userId: 'user-1',
        workspaceId: 'workspace-1',
        projectId,
        node: {} as never,
        tools: new Map(),
        runtime: { createModelClient: jest.fn(), wrapWorkflowNodeExecution: jest.fn() }
    }
    return { middleware, context, commands, catalog, workspace, installed }
}
async function tools(
    f: ReturnType<typeof fixture>,
    autoDiscovery = { enabled: true, repositoryIds: ['repo-1'], searchLimit: 2, maxInstallPerRun: 1 }
) {
    const middleware = await f.middleware.createMiddleware({ autoDiscovery }, f.context)
    return (name: string) => {
        const tool = middleware.tools?.find((tool) => tool.name === name)
        if (!tool) throw Error('Missing test tool: ' + name)
        return tool
    }
}

describe('Unified skill discovery', () => {
    it('installs into the bound Project and reuses it in a fresh middleware instance', async () => {
        const f = fixture(),
            run = await tools(f)
        await expect(run('list_skills').invoke({})).resolves.toEqual({ items: [], total: 0 })
        await run('install_skills').invoke({ indexIds: ['index-1'] })
        expect(f.commands.execute).toHaveBeenCalledWith(
            new InstallProjectSkillCommand('project-1', 'index-1', ['repo-1'])
        )
        expect(f.workspace.ensureInstalledSkillPackage).not.toHaveBeenCalled()
        const nextRun = await tools(f)
        await expect(nextRun('list_skills').invoke({})).resolves.toMatchObject({
            total: 1,
            items: [{ path: 'skills/testing/SKILL.md', enabled: true }]
        })
        await expect(nextRun('search_skill_repository').invoke({ query: 'Testing', limit: 20 })).resolves.toMatchObject(
            { projectId: 'project-1', items: [{ installed: true }] }
        )
        expect(f.catalog.findMarketplace.mock.calls[0][0].take).toBe(2)
    })

    it('keeps disabled installations disabled and rejects scope/path overrides before mutation', async () => {
        const f = fixture(),
            run = await tools(f)
        f.installed.push({
            id: 'testing',
            name: 'Testing',
            path: 'skills/testing/SKILL.md',
            enabled: false,
            source: 'repository',
            skillIndexId: 'index-1'
        })
        await expect(run('install_skills').invoke({ indexIds: ['index-1'] })).resolves.toMatchObject({
            installed: [{ enabled: false }]
        })
        f.commands.execute.mockClear()
        await expect(
            run('install_skills').invoke({ indexIds: ['index-1'], projectId: 'other', directory: '/tmp' })
        ).rejects.toThrow()
        await expect(run('list_skills').invoke({ projectId: 'other' })).rejects.toThrow()
        expect(f.commands.execute).not.toHaveBeenCalled()
    })

    it('checks live Project permission before searching and cannot broaden configured repositories', async () => {
        const f = fixture(),
            run = await tools(f)
        await expect(
            run('search_skill_repository').invoke({ query: 'Testing', repositoryIds: ['outside'] })
        ).resolves.toMatchObject({ total: 0 })
        expect(f.commands.execute).toHaveBeenCalledWith(new ListProjectSkillsCommand('project-1', 'edit'))
        expect(f.catalog.findMarketplace).not.toHaveBeenCalled()
        f.commands.execute.mockRejectedValue(new Error('Access revoked'))
        await expect(run('search_skill_repository').invoke({ query: 'Testing' })).rejects.toThrow('Access revoked')
        await expect(run('install_skills').invoke({ indexIds: ['index-1'] })).rejects.toThrow('Access revoked')
        expect(f.catalog.findMarketplace).not.toHaveBeenCalled()
        expect(f.workspace.ensureInstalledSkillPackage).not.toHaveBeenCalled()
    })

    it('keeps discovery opt-in and does not expose authoring discovery to portable resource-only runs', async () => {
        const f = fixture()
        const names = (instance: Awaited<ReturnType<SkillsMiddleware['createMiddleware']>>) =>
            instance.tools?.map((tool) => tool.name)
        expect(names(await f.middleware.createMiddleware({}, f.context))).toEqual(['read_skill_file', 'list_skills'])
        expect(
            names(
                await f.middleware.createMiddleware({ resourceOnly: true, autoDiscovery: { enabled: true } }, f.context)
            )
        ).toEqual(['read_skill_file'])
        const run = await tools(f)
        await expect(run('install_skills').invoke({ indexIds: ['one', 'two'] })).rejects.toThrow('at most 1')
        expect(f.commands.execute).not.toHaveBeenCalled()
    })
})
