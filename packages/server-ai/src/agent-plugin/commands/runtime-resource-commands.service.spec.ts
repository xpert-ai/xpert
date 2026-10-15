import { Test } from '@nestjs/testing'
import { CommandBus, QueryBus } from '@nestjs/cqrs'
import { mkdtemp, mkdir, writeFile, rm, symlink } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import type { RuntimeResourcesSelection } from '@xpert-ai/contracts'
import { RuntimeResourceCommandsService } from './runtime-resource-commands.service'
import { AgentPluginInstallationsService } from '../agent-plugin-installations.service'
import { parseAgentPlugin } from '../agent-plugin-parser'
import { portablePackageDigest } from '../agent-plugin-source'
import { assertAssistantAudience } from '../../ai/assistant-audience'
import { AssertProjectAssistantAccessCommand } from '../../xpert-project/commands/assert-project-assistant-access.command'

jest.mock('../../ai/assistant-audience', () => ({ assertAssistantAudience: jest.fn() }))
jest.mock('../agent-plugin-installations.service', () => ({ AgentPluginInstallationsService: class {} }))

const ref = { bindingId: '11111111-1111-4111-8111-111111111111', version: 'a'.repeat(64) }
const selected: RuntimeResourcesSelection = { revision: 3, resources: [ref] }
const skill = { ...ref, skillKey: 'bom' }
const manifest = {
    $schema: 'https://agent-plugins.org/schemas/1.0.0/plugin.schema.json',
    name: 'commands-test',
    extensions: { xpertai: { version: 2, commands: { bom: { subcommands: { import: {}, plan: {} } } } } }
}

describe('plugin skill commands', () => {
    let root: string
    let service: RuntimeResourceCommandsService
    const packages = { reference: jest.fn(), prepare: jest.fn() }
    const commands = { execute: jest.fn() }
    const queries = { execute: jest.fn() }
    const resolve = async () => ({
        pkg: { rootPath: root, descriptor: await parseAgentPlugin(root), digest: await portablePackageDigest(root) }
    })
    beforeEach(async () => {
        jest.resetAllMocks()
        root = await mkdtemp(join(tmpdir(), 'skill-commands-'))
        await mkdir(join(root, 'skills/bom'), { recursive: true })
        await writeFile(
            join(root, 'skills/bom/SKILL.md'),
            '---\nname: bom\ndescription: Manage BOM\n---\nRoute /import and /plan within this skill.'
        )
        await writeFile(join(root, 'plugin.json'), JSON.stringify(manifest))
        packages.reference.mockResolvedValue(await resolve())
        commands.execute.mockResolvedValue({})
        queries.execute.mockResolvedValue({ agent: { team: { workspaceId: 'workspace' } } })
        const module = await Test.createTestingModule({
            providers: [
                RuntimeResourceCommandsService,
                { provide: AgentPluginInstallationsService, useValue: packages },
                { provide: CommandBus, useValue: commands },
                { provide: QueryBus, useValue: queries }
            ]
        }).compile()
        service = module.get(RuntimeResourceCommandsService)
    })
    afterEach(() => rm(root, { recursive: true, force: true }))

    it('returns only metadata from the exact selected version without creating workspace resources', async () => {
        const result = await service.list('assistant', selected, 'project')
        expect(result).toEqual([
            {
                skill,
                packageName: 'commands-test',
                description: 'Manage BOM',
                command: { subcommands: { import: {}, plan: {} } }
            }
        ])
        expect(packages.reference).toHaveBeenCalledWith(ref, 'workspace')
        expect(packages.prepare).not.toHaveBeenCalled()
        expect(commands.execute.mock.calls[0][0]).toBeInstanceOf(AssertProjectAssistantAccessCommand)
        expect(assertAssistantAudience).toHaveBeenCalledWith('assistant')
        expect(JSON.stringify(result)).not.toContain(root)
        expect(JSON.stringify(result)).not.toContain('Route /import')
    })
    it.each([undefined, 'capability', 'subagent', 'assistant'])('honors package role %s', async (role) => {
        await writeFile(
            join(root, 'plugin.json'),
            JSON.stringify({ ...manifest, extensions: { xpertai: { ...manifest.extensions.xpertai, role } } })
        )
        packages.reference.mockResolvedValue(await resolve())
        expect(await service.list('assistant', selected)).toHaveLength(role === 'assistant' ? 0 : 1)
        if (role === 'assistant') await expect(service.instructions('assistant', selected, [skill])).rejects.toThrow()
    })
    it('loads the authorized skill body and retains its subcommand instructions', async () => {
        expect(await service.instructions('assistant', selected, [skill])).toContain('Route /import and /plan')
        expect(packages.prepare).not.toHaveBeenCalled()
    })
    it.each([
        [{ ...skill, version: 'b'.repeat(64) }],
        [{ ...skill, bindingId: '22222222-2222-4222-8222-222222222222' }],
        [{ ...skill, skillKey: 'missing' }],
        [{ ...skill, skillKey: '../escape' }],
        [skill, skill],
        [{ ...skill, path: '/tmp/secret' }]
    ])('rejects unselected or forged skill references %j', async (references) => {
        await expect(service.instructions('assistant', selected, references)).rejects.toThrow()
    })
    it('rejects removed/disabled bindings and permission revocation on activation', async () => {
        packages.reference.mockResolvedValue(null)
        expect(await service.list('assistant', selected)).toEqual([])
        await expect(service.instructions('assistant', selected, [skill])).rejects.toThrow()
        commands.execute.mockRejectedValue(new Error('Access revoked'))
        packages.reference.mockClear()
        await expect(service.list('assistant', selected)).rejects.toThrow('Access revoked')
        await expect(service.instructions('assistant', selected, [skill])).rejects.toThrow('Access revoked')
        expect(packages.reference).not.toHaveBeenCalled()
    })
    it('detects package tampering and contained-path escapes', async () => {
        await writeFile(join(root, 'skills/bom/SKILL.md'), 'tampered')
        await expect(service.list('assistant', selected)).rejects.toThrow()
        await expect(service.instructions('assistant', selected, [skill])).rejects.toThrow()
        await rm(join(root, 'skills/bom/SKILL.md'))
        await symlink('/etc/passwd', join(root, 'skills/bom/SKILL.md'))
        await expect(service.instructions('assistant', selected, [skill])).rejects.toThrow()
    })
})
