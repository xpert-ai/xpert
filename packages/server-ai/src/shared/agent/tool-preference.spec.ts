import {
    filterDisabledSkillIds,
    filterDisabledTools,
    isUserPreferredSkillEnabled,
    isUserPreferredToolEnabled
} from './tool-preference'

describe('tool preference helpers', () => {
    it('keeps tools enabled by default when no preference exists', () => {
        expect(isUserPreferredToolEnabled('toolset', 'toolset-1', 'search', null)).toBe(true)
    })

    it('disables only matching toolset tools for the same node key', () => {
        const tools = [{ name: 'search' }, { name: 'calculator' }]

        expect(
            filterDisabledTools(
                tools,
                'toolset',
                'toolset-1',
                {
                    version: 1,
                    toolsets: {
                        'toolset-1': {
                            toolsetName: 'Toolset 1',
                            disabledTools: ['search']
                        },
                        'toolset-2': {
                            toolsetName: 'Toolset 2',
                            disabledTools: ['calculator']
                        }
                    }
                }
            )
        ).toEqual([{ name: 'calculator' }])
    })

    it('treats empty disabledTools as fully enabled', () => {
        const tools = [{ name: 'search' }, { name: 'calculator' }]

        expect(
            filterDisabledTools(
                tools,
                'middleware',
                'middleware-1',
                {
                    version: 1,
                    middlewares: {
                        'middleware-1': {
                            provider: 'provider-a',
                            disabledTools: []
                        }
                    }
                }
            )
        ).toEqual(tools)
    })

    it('does not let unrelated node preferences affect another instance', () => {
        expect(
            isUserPreferredToolEnabled(
                'middleware',
                'middleware-1',
                'search',
                {
                    version: 1,
                    middlewares: {
                        'middleware-2': {
                            provider: 'provider-a',
                            disabledTools: ['search']
                        }
                    }
                }
            )
        ).toBe(true)
    })

    it('disables only matching workspace skills', () => {
        expect(
            filterDisabledSkillIds(
                ['skill-a', 'skill-b'],
                'workspace-1',
                {
                    version: 1,
                    skills: {
                        'workspace-1': {
                            workspaceId: 'workspace-1',
                            disabledSkillIds: ['skill-b']
                        },
                        'workspace-2': {
                            workspaceId: 'workspace-2',
                            disabledSkillIds: ['skill-a']
                        }
                    }
                }
            )
        ).toEqual(['skill-a'])
    })

    it('keeps skills enabled when the disabled list belongs to another workspace', () => {
        expect(
            isUserPreferredSkillEnabled(
                'workspace-1',
                'skill-a',
                {
                    version: 1,
                    skills: {
                        'workspace-2': {
                            workspaceId: 'workspace-2',
                            disabledSkillIds: ['skill-a']
                        }
                    }
                }
            )
        ).toBe(true)
    })
})
