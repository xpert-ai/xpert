import { RequestContext } from '@xpert-ai/plugin-sdk'

// Existing orchestration scenarios use an authoring principal; restricted projection has separate coverage.
beforeEach(() => jest.spyOn(RequestContext, 'hasPermission').mockReturnValue(true))
afterEach(() => jest.restoreAllMocks())

import { ChatMessageDTO } from './conversation.dto'
import { instanceToPlain } from 'class-transformer'

describe('ChatMessageDTO', () => {
    it.each([false, true])('serializes the same declared tool details with XPERT_VIEW=%s', (canView) => {
        jest.spyOn(RequestContext, 'hasPermission').mockReturnValue(canView)
        const row = {
            type: 'component' as const,
            id: 'one',
            data: {
                category: 'Tool' as const,
                tool: 'lookup',
                toolPresentation: 'redacted',
                title: 'Lookup',
                output: { rows: 3 }
            }
        }
        const dto = new ChatMessageDTO({ id: 'm', role: 'ai', content: [row] })
        expect(instanceToPlain(dto).content).toEqual([row])
    })

    it('exposes a flat run list for both historical snapshot formats', () => {
        const visible = { id: 'business', title: '总结标题' }
        const legacy = [visible, { id: 'title-job', title: '总结标题', presentation: 'runtime' as const }]
        for (const stored of [legacy, { version: 1 as const, runs: [visible] }]) {
            const dto = new ChatMessageDTO({ role: 'ai', historicalAgentRuns: stored })
            const payload = instanceToPlain(dto)
            expect(payload.agentRuns).toEqual([visible])
            expect(payload.historical).toBe(true)
            expect(payload).not.toHaveProperty('historicalAgentRuns')
        }
    })

    it('serializes derived execution summaries without exposing raw execution metadata', () => {
        const dto = new ChatMessageDTO({ id: 'a', role: 'ai' })
        dto.agentRuns = [{ id: 'external', invocationKind: 'external_assistant', model: 'model-a' }]
        expect(instanceToPlain(dto)).toMatchObject({
            agentRuns: [{ id: 'external', invocationKind: 'external_assistant', model: 'model-a' }]
        })
    })
    it('exposes normalized runtime capabilities saved in third-party metadata', () => {
        const dto = new ChatMessageDTO({
            id: 'message-1',
            role: 'human',
            content: 'Try this',
            thirdPartyMessage: {
                model: 'mdl_primary',
                runtimeCapabilities: {
                    mode: 'allowlist',
                    skills: {
                        workspaceId: 'workspace-1',
                        ids: ['skill-available']
                    },
                    plugins: {
                        nodeKeys: []
                    },
                    recommended: {
                        skills: {
                            ids: ['skill-recommended']
                        },
                        plugins: {
                            nodeKeys: ['middleware-recommended']
                        },
                        subAgents: {
                            nodeKeys: ['researcher']
                        }
                    }
                }
            }
        })

        expect(dto.runtimeCapabilities).toEqual({
            mode: 'allowlist',
            skills: {
                workspaceId: 'workspace-1',
                ids: ['skill-available', 'skill-recommended']
            },
            plugins: {
                nodeKeys: ['middleware-recommended']
            },
            subAgents: {
                nodeKeys: ['researcher']
            },
            recommended: {
                skills: {
                    workspaceId: 'workspace-1',
                    ids: ['skill-recommended']
                },
                plugins: {
                    nodeKeys: ['middleware-recommended']
                },
                subAgents: {
                    nodeKeys: ['researcher']
                }
            }
        })
        expect(dto.model).toBe('mdl_primary')
    })
})
