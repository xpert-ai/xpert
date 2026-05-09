import { mergeRuntimeCapabilitiesSelection, normalizeRuntimeCapabilitiesSelection } from './runtime-capabilities'

describe('runtime capabilities selection', () => {
    it('normalizes missing sub-agents as an empty allow-list', () => {
        expect(
            normalizeRuntimeCapabilitiesSelection({
                mode: 'allowlist',
                skills: { ids: [' skill-1 '] },
                plugins: { nodeKeys: [' middleware-1 '] }
            })
        ).toEqual({
            mode: 'allowlist',
            skills: { ids: ['skill-1'] },
            plugins: { nodeKeys: ['middleware-1'] },
            subAgents: { nodeKeys: [] }
        })
    })

    it('deduplicates and trims sub-agent node keys', () => {
        expect(
            normalizeRuntimeCapabilitiesSelection({
                mode: 'allowlist',
                skills: { ids: [] },
                plugins: { nodeKeys: [] },
                subAgents: { nodeKeys: [' sub-agent ', 'sub-agent', '', null] }
            })
        ).toMatchObject({
            subAgents: { nodeKeys: ['sub-agent'] }
        })
    })

    it('normalizes recommended selections and merges them into the allow-list', () => {
        expect(
            normalizeRuntimeCapabilitiesSelection({
                mode: 'allowlist',
                skills: { workspaceId: 'workspace-1', ids: [' skill-available '] },
                plugins: { nodeKeys: ['middleware-available'] },
                subAgents: { nodeKeys: [] },
                recommended: {
                    skills: { ids: ['skill-recommended', 'skill-recommended'] },
                    plugins: { nodeKeys: [' middleware-recommended '] },
                    subAgents: { nodeKeys: ['researcher'] }
                }
            })
        ).toEqual({
            mode: 'allowlist',
            skills: {
                workspaceId: 'workspace-1',
                ids: ['skill-available', 'skill-recommended']
            },
            plugins: {
                nodeKeys: ['middleware-available', 'middleware-recommended']
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
    })

    it('preserves recommended metadata while merging selections', () => {
        expect(
            mergeRuntimeCapabilitiesSelection(
                normalizeRuntimeCapabilitiesSelection({
                    mode: 'allowlist',
                    skills: { workspaceId: 'workspace-1', ids: ['skill-available'] },
                    plugins: { nodeKeys: [] },
                    subAgents: { nodeKeys: [] }
                }),
                normalizeRuntimeCapabilitiesSelection({
                    mode: 'allowlist',
                    skills: { workspaceId: 'workspace-1', ids: [] },
                    plugins: { nodeKeys: [] },
                    subAgents: { nodeKeys: [] },
                    recommended: {
                        skills: { ids: ['skill-recommended'] },
                        plugins: { nodeKeys: ['middleware-recommended'] },
                        subAgents: { nodeKeys: [] }
                    }
                })
            )
        ).toEqual({
            mode: 'allowlist',
            skills: {
                workspaceId: 'workspace-1',
                ids: ['skill-available', 'skill-recommended']
            },
            plugins: {
                nodeKeys: ['middleware-recommended']
            },
            subAgents: {
                nodeKeys: []
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
                    nodeKeys: []
                }
            }
        })
    })
})
