import { filterDisabledTools, isUserPreferredToolEnabled } from './tool-preference'

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
})
