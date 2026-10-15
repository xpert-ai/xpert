import { mkdtemp, readFile, readdir, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { CommandBus } from '@nestjs/cqrs'
import { XpertTypeEnum, type IXpert, type AssistantTemplateMetadata } from '@xpert-ai/contracts'
import { ResolveTemplateConnectorsCommand } from '../../connector/template-connectors.command'
import { VolumeHandle } from '../../shared/volume/volume'
import type { XpertRuntimeWorkArea } from '../../shared/volume/work-area'
import { createTemplateTaskContext } from './template-task-context'

describe('template task workspace', () => {
    let root: string
    beforeEach(async () => {
        root = await mkdtemp(join(tmpdir(), 'template-task-'))
    })
    afterEach(async () => {
        await rm(root, { recursive: true, force: true })
    })

    function fixture() {
        const owner: IXpert = { id: 'owner', slug: 'owner', name: 'Owner', type: XpertTypeEnum.Agent }
        const volume = new VolumeHandle(
            { tenantId: 'tenant', catalog: 'xperts', xpertId: owner.id },
            root,
            root,
            '/files'
        )
        const area: XpertRuntimeWorkArea = {
            volume,
            volumeScope: volume.scope,
            volumePath: root,
            workspaceRoot: root,
            workingDirectory: root,
            workspaceBinding: { volumeRoot: root, workspaceRoot: root, workspacePath: root },
            defaultPath: { relativePath: '', serverPath: root, workspacePath: root }
        }
        const manifest: AssistantTemplateMetadata['manifest'] = {
            schemaVersion: 2,
            onboarding: { skill: 'setup', required: true, preferences: ['tone'], completionCriteria: 'A report' },
            files: {
                scope: 'shared',
                entries: [
                    {
                        kind: 'file',
                        path: 'report.md',
                        content: 'template seed',
                        contentVersion: '1',
                        policy: 'create-only'
                    }
                ]
            },
            routines: [
                {
                    key: 'daily',
                    required: false,
                    trigger: 'schedule',
                    expression: '0 9 * * *',
                    timezone: 'user',
                    skill: 'report',
                    output: 'Report',
                    enabled: false
                }
            ]
        }
        const commands = {
            execute: jest.fn(async (command: unknown) => {
                if (command instanceof ResolveTemplateConnectorsCommand) return { connectors: [] }
                throw new Error('Task templates must not create Assistants, edit their setup or schedule routines')
            })
        }
        const authorize = jest.fn(async () => undefined)
        const create = (id: string) =>
            createTemplateTaskContext(area, id, owner, manifest, commands as unknown as CommandBus, authorize)
        return { create, authorize }
    }

    it('isolates seed files and onboarding from the parent and concurrent tasks, and preserves edits on resume', async () => {
        const f = fixture()
        await writeFile(join(root, 'report.md'), 'parent data')
        const [one, two] = await Promise.all([f.create('one'), f.create('two')])
        await one.taskSetup({ revision: 0, preferences: { tone: 'concise' }, firstResult: 'Report produced' })
        expect((await one.taskSetup()).state.preferences).toEqual({ tone: 'concise' })
        expect((await two.taskSetup()).state.preferences).toEqual({})
        expect((await one.taskSetup()).routines).toEqual([])
        await writeFile(join(one.volume.serverRoot, 'report.md'), 'task edit')
        const resumed = await f.create('one')
        expect(await readFile(join(resumed.volume.serverRoot, 'report.md'), 'utf8')).toBe('task edit')
        expect(await readFile(join(two.volume.serverRoot, 'report.md'), 'utf8')).toBe('template seed')
        expect(await readFile(join(root, 'report.md'), 'utf8')).toBe('parent data')
        await expect(one.taskSetup({ revision: 0, preferences: { tone: 'stale' } })).rejects.toThrow()
    })

    it('checks current authorization and only accepts declared preferences', async () => {
        const f = fixture()
        const task = await f.create('one')
        await expect(task.taskSetup({ revision: 0, preferences: { undeclared: 'value' } })).rejects.toThrow()
        f.authorize.mockRejectedValue(new Error('revoked'))
        await expect(task.taskSetup()).rejects.toThrow('revoked')
    })

    it('rejects revoked access before creating task directories or initializing files', async () => {
        const f = fixture()
        f.authorize.mockRejectedValue(new Error('revoked'))
        await expect(f.create('denied')).rejects.toThrow('revoked')
        expect(await readdir(root)).toEqual([])
    })
})
