import { parse } from 'yaml'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
    XpertTypeEnum,
    XpertParameterTypeEnum,
    type AgentPluginRole,
    type AssistantTemplateDefinition
} from '@xpert-ai/contracts'
import { AgentPluginPackage } from '../agent-plugin.entity'
import { portablePackageDigest } from '../agent-plugin-source'
import { parseAgentPlugin } from '../agent-plugin-parser'
import { runtimeTemplateDescriptors, loadRuntimeTemplate, templateInputParameters } from './runtime-template'
import {
    ResolveTemplateExecutionHandler,
    ResolveTemplateExecutionCommand,
    AuthorizeTemplateExecutionCommand
} from './resolve-template-execution.command'
import { PrepareTemplateExecutionCommand } from '../../plugin-resource/template-installation/prepare-template-execution.command'
import type { CommandBus } from '@nestjs/cqrs'
import type { AgentPluginInstallationsService } from '../agent-plugin-installations.service'

describe('runtime template declarations', () => {
    let root: string
    beforeEach(async () => {
        root = await mkdtemp(join(tmpdir(), 'runtime-template-'))
    })
    afterEach(async () => {
        await rm(root, { recursive: true, force: true })
    })
    async function fixture(role?: AgentPluginRole) {
        const definition = {
            team: { name: 'reviewer', title: 'Reviewer', type: XpertTypeEnum.Agent, agent: { key: 'primary' } },
            nodes: [{ key: 'primary', type: 'agent', entity: { key: 'primary' }, position: { x: 0, y: 0 } }],
            connections: [],
            template: {
                schemaVersion: 2,
                dependencies: {
                    skills: [{ componentKey: 'review', source: { kind: 'agent-plugin', name: 'reviewers' } }]
                }
            }
        }
        await writeFile(join(root, 'reviewer.json'), JSON.stringify(definition))
        const pkg = new AgentPluginPackage()
        Object.assign(pkg, {
            rootPath: root,
            digest: await portablePackageDigest(root),
            descriptor: {
                name: 'reviewers',
                extension: { version: 2, role },
                templates: [{ key: 'reviewer', path: 'reviewer.json' }]
            }
        })
        return pkg
    }
    it.each([undefined, 'capability', 'subagent'] as const)(
        'offers templates for role %s and pins self dependencies',
        async (role) => {
            const pkg = await fixture(role)
            expect(await runtimeTemplateDescriptors(pkg, { bindingId: 'package', version: 'v1' })).toEqual([
                expect.objectContaining({
                    kind: 'agent_plugin_template',
                    templateKey: 'reviewer',
                    title: 'Reviewer',
                    digest: pkg.digest
                })
            ])
            expect((await loadRuntimeTemplate(pkg, 'reviewer')).dependencies.skills[0].source.digest).toBe(pkg.digest)
        }
    )
    it('does not turn assistant-role templates into delegation tools', async () => {
        expect(
            await runtimeTemplateDescriptors(await fixture('assistant'), { bindingId: 'package', version: 'v1' })
        ).toEqual([])
    })
    it('loads the deployable expense-review fixture with its complete internal Agent graph', async () => {
        const rootPath = join(__dirname, '../../xpert-agent/template-subagents/fixtures/expense-review')
        const descriptor = await parseAgentPlugin(rootPath)
        expect(descriptor.diagnostics).toEqual([])
        const pkg = Object.assign(new AgentPluginPackage(), {
            rootPath,
            descriptor,
            digest: await portablePackageDigest(rootPath)
        })
        const declarations = await runtimeTemplateDescriptors(pkg, { bindingId: 'acceptance', version: '1.0.0' })
        expect(declarations).toHaveLength(1)
        expect(declarations[0]).toMatchObject({ templateKey: 'expense-review', title: '费用复核子智能体' })
        const { definition } = await loadRuntimeTemplate(pkg, declarations[0].templateKey)
        expect(definition.nodes.map(({ key }) => key)).toEqual(['ExpenseReview', 'MathVerifier'])
        expect(definition.connections).toEqual([
            expect.objectContaining({ type: 'agent', from: 'ExpenseReview', to: 'MathVerifier', required: true })
        ])
        expect(definition.team.copilotModel).toBeUndefined()
    })
    it('rejects changed content under an existing package digest', async () => {
        const pkg = await fixture()
        await writeFile(join(root, 'reviewer.json'), '{}')
        await expect(loadRuntimeTemplate(pkg, 'reviewer')).rejects.toThrow()
    })

    it('merges global and entry Agent inputs and rejects runtime state collisions', async () => {
        const { definition } = await loadRuntimeTemplate(await fixture(), 'reviewer')
        definition.team.agentConfig = { parameters: [{ name: 'format', type: XpertParameterTypeEnum.STRING }] }
        const node = definition.nodes[0]
        if (node.type !== 'agent') throw new Error('Expected entry Agent')
        node.entity.parameters = [{ name: 'caseId', type: XpertParameterTypeEnum.STRING }]
        expect(templateInputParameters(definition).map(({ name }) => name)).toEqual(['format', 'caseId'])
        node.entity.parameters.push({ name: 'sys', type: XpertParameterTypeEnum.OBJECT })
        expect(() => templateInputParameters(definition)).toThrow()
    })

    it('reuses a dependency digest recorded on first dispatch after its package is upgraded', async () => {
        const pkg = await fixture()
        const definition: AssistantTemplateDefinition = (await loadRuntimeTemplate(pkg, 'reviewer')).definition
        definition.template.dependencies.skills[0].source = { kind: 'agent-plugin', name: 'evidence' }
        await writeFile(join(root, 'reviewer.json'), JSON.stringify(definition))
        pkg.digest = await portablePackageDigest(root)
        const pinnedDigest = 'a'.repeat(64)
        const commands = {
            execute: jest.fn(async (command: unknown) => {
                if (command instanceof AuthorizeTemplateExecutionCommand)
                    return { id: 'owner', workspaceId: 'workspace' }
                if (command instanceof PrepareTemplateExecutionCommand) {
                    expect(command.template.dependencies.skills[0].source.digest).toBe(pinnedDigest)
                    expect(parse(command.template.export_data).template.dependencies.skills[0].source.digest).toBe(
                        pinnedDigest
                    )
                    return { draft: definition, locks: command.locks, skills: {} }
                }
                throw new Error('Unexpected mutation')
            })
        }
        const handler = new ResolveTemplateExecutionHandler(
            { reference: async () => ({ pkg }) } as unknown as AgentPluginInstallationsService,
            commands as unknown as CommandBus
        )
        const source = (await runtimeTemplateDescriptors(pkg, { bindingId: 'package', version: 'v1' }))[0]
        await handler.execute(
            new ResolveTemplateExecutionCommand('owner', { revision: 1, resources: [source] }, source, undefined, [
                {
                    pluginName: 'evidence-version-one',
                    version: pinnedDigest,
                    source: {
                        kind: 'agent-plugin',
                        name: 'evidence',
                        digest: pinnedDigest,
                        bindingId: '11111111-1111-4111-8111-111111111111',
                        bindingVersion: 'old'
                    },
                    components: [{ type: 'skill', key: 'review', hash: pinnedDigest }]
                }
            ])
        )
    })
})
