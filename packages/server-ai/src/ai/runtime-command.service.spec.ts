import { RuntimeCommandService } from './runtime-command.service'
import type { RuntimeSlashCommand } from './runtime-command.guards'

function runtimeCommand(name: string, source: RuntimeSlashCommand['source']): RuntimeSlashCommand {
    return {
        name,
        label: name,
        action: {
            type: 'submit_prompt',
            template: `Run ${name}`
        },
        source
    }
}

describe('RuntimeCommandService', () => {
    it('normalizes valid skill runtime commands and injects the owning skill capability', () => {
        const service = new RuntimeCommandService()

        expect(
            service.normalizeSkillRuntimeSlashCommands(
                {
                    id: 'skill-review',
                    metadata: {
                        icon: {
                            type: 'svg',
                            value: '<svg viewBox="0 0 16 16"><path d="M2 2h12v12H2z" /></svg>'
                        },
                        tags: ['code'],
                        commands: [
                            {
                                name: 'review',
                                label: 'Review',
                                description: 'Review selected files',
                                category: 'quality',
                                aliases: ['audit', 'check', 'audit'],
                                argsHint: '<path>',
                                action: {
                                    type: 'submit_prompt',
                                    template: 'Review {{args}}'
                                }
                            }
                        ]
                    }
                },
                { workspaceId: 'workspace-1', label: 'Review Skill' }
            )
        ).toEqual([
            {
                name: 'review',
                label: 'Review',
                description: 'Review selected files',
                icon: {
                    type: 'svg',
                    value: '<svg viewBox="0 0 16 16"><path d="M2 2h12v12H2z" /></svg>'
                },
                category: 'quality',
                aliases: ['audit', 'check'],
                argsHint: '<path>',
                kind: 'prompt_workflow',
                workflow: {
                    type: 'prompt_workflow',
                    name: 'review',
                    label: 'Review',
                    description: 'Review selected files',
                    tags: ['code']
                },
                meta: {
                    icon: {
                        type: 'svg',
                        value: '<svg viewBox="0 0 16 16"><path d="M2 2h12v12H2z" /></svg>'
                    }
                },
                action: {
                    type: 'submit_prompt',
                    template: 'Review {{args}}',
                    runtimeCapabilities: {
                        mode: 'allowlist',
                        skills: {
                            workspaceId: 'workspace-1',
                            ids: ['skill-review']
                        },
                        plugins: {
                            nodeKeys: []
                        },
                        subAgents: {
                            nodeKeys: []
                        }
                    }
                },
                source: {
                    type: 'skill',
                    skillId: 'skill-review',
                    workspaceId: 'workspace-1',
                    label: 'Review Skill'
                }
            }
        ])
    })

    it('defaults skill submit_prompt commands to prompt workflow commands', () => {
        const service = new RuntimeCommandService()

        expect(
            service.normalizeSkillRuntimeSlashCommands(
                {
                    id: 'skill-debug',
                    metadata: {
                        commands: [
                            {
                                name: 'debug',
                                label: 'Debug',
                                description: 'Debug failing code',
                                action: {
                                    type: 'submit_prompt',
                                    template: 'Debug {{args}}'
                                }
                            }
                        ]
                    }
                },
                { workspaceId: 'workspace-1', label: 'Debug Skill' }
            )
        ).toEqual([
            expect.objectContaining({
                name: 'debug',
                category: 'prompt_workflow',
                argsHint: '<args>',
                kind: 'prompt_workflow',
                workflow: {
                    type: 'prompt_workflow',
                    name: 'debug',
                    label: 'Debug',
                    description: 'Debug failing code'
                },
                action: expect.objectContaining({
                    type: 'submit_prompt',
                    template: 'Debug {{args}}'
                })
            })
        ])
    })

    it('filters invalid names, empty templates, unknown actions, and unsafe capability selection', () => {
        const service = new RuntimeCommandService()

        expect(
            service.normalizeSkillRuntimeSlashCommands(
                {
                    id: 'skill-review',
                    metadata: {
                        commands: [
                            {
                                name: 'Invalid Name',
                                action: {
                                    type: 'submit_prompt',
                                    template: 'ignore'
                                }
                            },
                            {
                                name: 'empty',
                                action: {
                                    type: 'submit_prompt',
                                    template: ''
                                }
                            },
                            {
                                name: 'unknown',
                                action: {
                                    type: 'shell',
                                    template: 'ignore'
                                }
                            },
                            {
                                name: 'plugin',
                                action: {
                                    type: 'select_capability',
                                    capability: {
                                        type: 'plugin',
                                        id: 'plugin-search'
                                    }
                                }
                            },
                            {
                                name: 'self',
                                action: {
                                    type: 'select_capability',
                                    capability: {
                                        type: 'skill',
                                        id: 'skill-review'
                                    }
                                }
                            }
                        ]
                    }
                },
                { workspaceId: 'workspace-1', label: 'Review Skill' }
            )
        ).toEqual([
            expect.objectContaining({
                name: 'self',
                action: {
                    type: 'select_capability',
                    capability: {
                        type: 'skill',
                        id: 'skill-review'
                    }
                }
            })
        ])
    })

    it('normalizes workspace prompt workflow commands and filters runtime capabilities to available ids', () => {
        const service = new RuntimeCommandService()

        expect(
            service.normalizePromptWorkflowRuntimeSlashCommands(
                [
                    {
                        sourceType: 'workspace_prompt_workflow',
                        workflowId: 'workflow-review',
                        workspaceId: 'workspace-1',
                        name: 'review',
                        label: 'Review',
                        description: 'Review selected files',
                        template: 'Review {{args}}',
                        runtimeCapabilities: {
                            mode: 'allowlist',
                            skills: {
                                workspaceId: 'workspace-1',
                                ids: ['skill-review', 'missing-skill']
                            },
                            plugins: {
                                nodeKeys: ['plugin-search', 'missing-plugin']
                            },
                            subAgents: {
                                nodeKeys: ['agent-1', 'missing-agent']
                            }
                        }
                    }
                ],
                {
                    sourceType: 'workspace_prompt_workflow',
                    workspaceId: 'workspace-1',
                    label: 'Assistant',
                    allowList: {
                        workspaceId: 'workspace-1',
                        skillIds: ['skill-review'],
                        pluginNodeKeys: ['plugin-search'],
                        subAgentNodeKeys: ['agent-1']
                    }
                }
            )
        ).toEqual([
            expect.objectContaining({
                name: 'review',
                category: 'prompt_workflow',
                argsHint: '<args>',
                kind: 'prompt_workflow',
                action: {
                    type: 'insert_invocation',
                    template: '/review ',
                    runtimeCapabilities: {
                        mode: 'allowlist',
                        skills: {
                            workspaceId: 'workspace-1',
                            ids: ['skill-review']
                        },
                        plugins: {
                            nodeKeys: ['plugin-search']
                        },
                        subAgents: {
                            nodeKeys: ['agent-1']
                        }
                    }
                },
                source: {
                    type: 'workspace_prompt_workflow',
                    workflowId: 'workflow-review',
                    workspaceId: 'workspace-1',
                    label: 'Assistant'
                }
            })
        ])
    })

    it('keeps xpert-local prompt workflow commands as submitted prompts', () => {
        const service = new RuntimeCommandService()

        expect(
            service.normalizePromptWorkflowRuntimeSlashCommands(
                [
                    {
                        sourceType: 'xpert',
                        xpertId: 'xpert-1',
                        workflowId: 'workflow-review',
                        name: 'review',
                        label: 'Review',
                        template: 'Review {{args}}'
                    }
                ],
                {
                    sourceType: 'xpert',
                    workspaceId: 'workspace-1',
                    label: 'Assistant'
                }
            )
        ).toEqual([
            expect.objectContaining({
                name: 'review',
                action: {
                    type: 'submit_prompt',
                    template: 'Review {{args}}'
                },
                source: {
                    type: 'xpert',
                    xpertId: 'xpert-1',
                    label: 'Assistant'
                }
            })
        ])
    })

    it('normalizes middleware runtime commands and injects the owning middleware capability', () => {
        const service = new RuntimeCommandService()

        expect(
            service.normalizeMiddlewareRuntimeSlashCommands(
                [
                    {
                        name: 'goal',
                        label: 'Goal',
                        description: 'Run a goal loop',
                        argsHint: '<objective>',
                        action: {
                            type: 'insert_invocation',
                            template: 'Goal: {{args}}'
                        }
                    },
                    {
                        name: 'compact',
                        label: {
                            en_US: 'Compress',
                            zh_Hans: '压缩'
                        },
                        description: {
                            en_US: 'Compress this thread context',
                            zh_Hans: '压缩此线程的上下文'
                        },
                        category: 'session',
                        kind: 'command',
                        aliases: ['compress'],
                        action: {
                            type: 'submit_prompt',
                            template: '/compact'
                        }
                    },
                    {
                        name: 'invoke',
                        action: {
                            type: 'client_action',
                            action: {
                                type: 'middleware_only'
                            }
                        }
                    }
                ],
                {
                    provider: 'goal-loop-provider',
                    nodeKey: 'middleware-goal',
                    label: 'Goal Loop'
                }
            )
        ).toEqual([
            expect.objectContaining({
                name: 'goal',
                label: 'Goal',
                description: 'Run a goal loop',
                category: 'prompt_workflow',
                argsHint: '<objective>',
                kind: 'prompt_workflow',
                workflow: {
                    type: 'prompt_workflow',
                    name: 'goal',
                    label: 'Goal',
                    description: 'Run a goal loop'
                },
                action: {
                    type: 'insert_invocation',
                    template: '/goal ',
                    runtimeCapabilities: {
                        mode: 'allowlist',
                        skills: {
                            ids: []
                        },
                        plugins: {
                            nodeKeys: ['middleware-goal']
                        },
                        subAgents: {
                            nodeKeys: []
                        }
                    }
                },
                source: {
                    type: 'middleware',
                    provider: 'goal-loop-provider',
                    nodeKey: 'middleware-goal',
                    label: 'Goal Loop'
                }
            }),
            expect.objectContaining({
                name: 'compact',
                label: {
                    en_US: 'Compress',
                    zh_Hans: '压缩'
                },
                description: {
                    en_US: 'Compress this thread context',
                    zh_Hans: '压缩此线程的上下文'
                },
                category: 'session',
                aliases: ['compress'],
                action: {
                    type: 'submit_prompt',
                    template: '/compact',
                    runtimeCapabilities: {
                        mode: 'allowlist',
                        skills: {
                            ids: []
                        },
                        plugins: {
                            nodeKeys: ['middleware-goal']
                        },
                        subAgents: {
                            nodeKeys: []
                        }
                    }
                },
                source: {
                    type: 'middleware',
                    provider: 'goal-loop-provider',
                    nodeKey: 'middleware-goal',
                    label: 'Goal Loop'
                }
            }),
            expect.objectContaining({
                name: 'invoke',
                label: 'invoke',
                action: {
                    type: 'client_action',
                    action: {
                        type: 'middleware_only'
                    },
                    runtimeCapabilities: {
                        mode: 'allowlist',
                        skills: {
                            ids: []
                        },
                        plugins: {
                            nodeKeys: ['middleware-goal']
                        },
                        subAgents: {
                            nodeKeys: []
                        }
                    }
                },
                source: {
                    type: 'middleware',
                    provider: 'goal-loop-provider',
                    nodeKey: 'middleware-goal',
                    label: 'Goal Loop'
                }
            })
        ])
    })

    it('preserves middleware runtime command i18n objects for ChatKit localization', () => {
        const service = new RuntimeCommandService()

        expect(
            service.normalizeMiddlewareRuntimeSlashCommands(
                [
                    {
                        name: 'compact',
                        label: {
                            en_US: 'Compress',
                            zh_Hans: '压缩'
                        },
                        description: {
                            en_US: 'Compress this thread context',
                            zh_Hans: '压缩此线程的上下文'
                        },
                        action: {
                            type: 'submit_prompt',
                            template: '/compact'
                        }
                    }
                ],
                {
                    provider: 'ContextCompressionMiddleware',
                    nodeKey: 'middleware-compression',
                    label: 'Context Compression'
                }
            )
        ).toEqual([
            expect.objectContaining({
                name: 'compact',
                label: {
                    en_US: 'Compress',
                    zh_Hans: '压缩'
                },
                description: {
                    en_US: 'Compress this thread context',
                    zh_Hans: '压缩此线程的上下文'
                },
                workflow: expect.objectContaining({
                    label: {
                        en_US: 'Compress',
                        zh_Hans: '压缩'
                    },
                    description: {
                        en_US: 'Compress this thread context',
                        zh_Hans: '压缩此线程的上下文'
                    }
                })
            })
        ])
    })

    it('merges runtime commands by middleware, xpert, preferred skill, workspace, then skill priority', () => {
        const service = new RuntimeCommandService()

        expect(
            service.mergeRuntimeSlashCommands([
                [
                    runtimeCommand('review', {
                        type: 'middleware',
                        provider: 'provider-review',
                        nodeKey: 'middleware-review'
                    }),
                    runtimeCommand('goal', {
                        type: 'middleware',
                        provider: 'provider-goal',
                        nodeKey: 'middleware-goal'
                    })
                ],
                [runtimeCommand('review', { type: 'xpert' })],
                [
                    runtimeCommand('explain', {
                        type: 'skill',
                        skillId: 'skill-review',
                        workspaceId: 'workspace-1',
                        label: 'Review Skill'
                    })
                ],
                [
                    runtimeCommand('review', { type: 'workspace_prompt_workflow' }),
                    runtimeCommand('explain', { type: 'workspace_prompt_workflow' })
                ],
                [
                    runtimeCommand('plan', {
                        type: 'skill',
                        skillId: 'skill-plan',
                        workspaceId: 'workspace-1',
                        label: 'Plan Skill'
                    }),
                    runtimeCommand('goal', {
                        type: 'skill',
                        skillId: 'skill-goal',
                        workspaceId: 'workspace-1',
                        label: 'Goal Skill'
                    }),
                    runtimeCommand('explain', {
                        type: 'skill',
                        skillId: 'skill-explain',
                        workspaceId: 'workspace-1',
                        label: 'Explain Skill'
                    }),
                    runtimeCommand('test', {
                        type: 'skill',
                        skillId: 'skill-test',
                        workspaceId: 'workspace-1',
                        label: 'Test Skill'
                    })
                ]
            ])
        ).toEqual([
            runtimeCommand('review', { type: 'middleware', provider: 'provider-review', nodeKey: 'middleware-review' }),
            runtimeCommand('goal', { type: 'middleware', provider: 'provider-goal', nodeKey: 'middleware-goal' }),
            runtimeCommand('explain', {
                type: 'skill',
                skillId: 'skill-review',
                workspaceId: 'workspace-1',
                label: 'Review Skill'
            }),
            runtimeCommand('test', {
                type: 'skill',
                skillId: 'skill-test',
                workspaceId: 'workspace-1',
                label: 'Test Skill'
            })
        ])
    })

    it('keeps built-in command names reserved for non-middleware commands', () => {
        const service = new RuntimeCommandService()

        expect(
            service.mergeRuntimeSlashCommands([
                [
                    runtimeCommand('goal', {
                        type: 'skill',
                        skillId: 'skill-goal',
                        workspaceId: 'workspace-1',
                        label: 'Goal Skill'
                    })
                ],
                [runtimeCommand('goal', { type: 'workspace_prompt_workflow' })],
                [
                    runtimeCommand('goal', {
                        type: 'middleware',
                        provider: 'other-provider',
                        nodeKey: 'middleware-other'
                    })
                ]
            ])
        ).toEqual([
            runtimeCommand('goal', { type: 'middleware', provider: 'other-provider', nodeKey: 'middleware-other' })
        ])
    })
})
