jest.mock('../xpert-agent/commands', () => ({
    XpertAgentChatCommand: class XpertAgentChatCommand {
        constructor(
            public readonly state: Record<string, unknown>,
            public readonly agentKey: string,
            public readonly xpert: Record<string, unknown>,
            public readonly options: Record<string, unknown>
        ) {}
    }
}))

jest.mock('../xpert/xpert.entity', () => ({
    Xpert: class Xpert {}
}))

import { of } from 'rxjs'
import { STATE_VARIABLE_HUMAN } from '@xpert-ai/contracts'
import { XpertAgentChatCommand } from '../xpert-agent/commands'
import { XpertDreamerInvoker } from './adapters/xpert-dreamer-invoker'

describe('XpertDreamerInvoker', () => {
    const originalEnv = process.env

    afterEach(() => {
        process.env = originalEnv
    })

    it('runs the configured Dreamer agent in the target Xpert memory workspace', async () => {
        process.env = {
            ...originalEnv,
            FILE_MEMORY_DREAMER_XPERT_ID: 'dreamer-xpert',
            FILE_MEMORY_DREAMER_AGENT_KEY: 'DreamerAgent'
        }
        const commandBus = {
            execute: jest.fn().mockResolvedValue(of({ data: { ok: true } } as MessageEvent))
        }
        const xpertRepository = {
            findOne: jest.fn().mockResolvedValue({
                id: 'dreamer-xpert',
                agent: {
                    key: 'DreamerAgent'
                }
            })
        }
        const runner = new XpertDreamerInvoker(commandBus as any, xpertRepository as any)

        await runner.run({
            runId: 'dream-1',
            tenantId: 'tenant-1',
            targetXpertId: 'target-xpert',
            dreamerConfig: {
                dreamerXpertId: 'dreamer-xpert',
                dreamerAgentKey: 'DreamerAgent'
            },
            memoryRoot: '/volume/.xpert/memory',
            runRoot: '/volume/.xpert/memory/.dream/runs/dream-1',
            evidencePath: '/volume/.xpert/memory/.dream/runs/dream-1/evidence',
            instructionsPath: '/volume/.xpert/memory/.dream/runs/dream-1/evidence/instructions.md'
        })

        expect(xpertRepository.findOne).toHaveBeenCalledWith({
            where: {
                id: 'dreamer-xpert',
                tenantId: 'tenant-1'
            },
            relations: ['agent']
        })

        const command = commandBus.execute.mock.calls[0][0] as XpertAgentChatCommand
        expect(command).toBeInstanceOf(XpertAgentChatCommand)
        expect(command.agentKey).toBe('DreamerAgent')
        expect(command.state[STATE_VARIABLE_HUMAN]).toEqual(
            expect.objectContaining({
                input: expect.stringContaining('Run FileMemory Dream for target Xpert target-xpert.')
            })
        )
        expect(command.options).toMatchObject({
            isDraft: false,
            from: 'job',
            store: null
        })
        expect(command.options).not.toHaveProperty('context.runtimeWorkspace')
    })

    it('fails when the configured Dreamer template is not visible in the tenant', async () => {
        process.env = {
            ...originalEnv,
            FILE_MEMORY_DREAMER_XPERT_ID: 'dreamer-xpert',
            FILE_MEMORY_DREAMER_AGENT_KEY: 'DreamerAgent'
        }
        const runner = new XpertDreamerInvoker(
            { execute: jest.fn() } as any,
            { findOne: jest.fn().mockResolvedValue(null) } as any
        )

        await expect(
            runner.run({
                runId: 'dream-1',
                tenantId: 'tenant-1',
                targetXpertId: 'target-xpert',
                dreamerConfig: {
                    dreamerXpertId: 'dreamer-xpert',
                    dreamerAgentKey: 'DreamerAgent'
                },
                memoryRoot: '/memory',
                runRoot: '/memory/.dream/runs/dream-1',
                evidencePath: '/memory/.dream/runs/dream-1/evidence',
                instructionsPath: '/memory/.dream/runs/dream-1/evidence/instructions.md'
            })
        ).rejects.toThrow("FileMemory Dreamer Xpert 'dreamer-xpert' was not found in tenant 'tenant-1'")
    })
})
