import { STATE_VARIABLE_HUMAN } from '@xpert-ai/contracts'
import { taskConnectorIds, withTaskConnectors } from './automation-state'
it('normalizes connector ids and preserves unrelated runtime restrictions', () => {
    const state = {
        topic: 'Review',
        [STATE_VARIABLE_HUMAN]: {
            locale: 'zh',
            runtimeCapabilities: {
                mode: 'allowlist',
                plugins: { nodeKeys: ['p'] },
                skills: { ids: ['s'] },
                subAgents: { keys: ['a'] }
            }
        }
    }
    const result = withTaskConnectors(state, [' binding ', 'binding'])
    expect(taskConnectorIds(result)).toEqual(['binding'])
    expect(result).toMatchObject(state)
})
it('removes a connector-only override when the final selection is cleared', () => {
    const state = { [STATE_VARIABLE_HUMAN]: { locale: 'zh' } }
    const selected = withTaskConnectors(state, ['binding'])
    expect(selected).toMatchObject({ [STATE_VARIABLE_HUMAN]: { runtimeCapabilities: { inheritUnselected: true } } })
    expect(withTaskConnectors(selected, [])).toEqual(state)
    expect(withTaskConnectors({}, [])).toEqual({})
})
it('preserves an explicit empty allowlist rather than broadening access', () => {
    const result = withTaskConnectors(
        { [STATE_VARIABLE_HUMAN]: { runtimeCapabilities: { mode: 'allowlist', skills: { ids: [] } } } },
        []
    )
    expect(result).toMatchObject({
        [STATE_VARIABLE_HUMAN]: { runtimeCapabilities: { mode: 'allowlist', connectors: { bindingIds: [] } } }
    })
})
