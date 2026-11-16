import { AIMessage, HumanMessage } from '@langchain/core/messages'
import { XpertMemoryUserInput } from './xpert-memory-user-input'

describe('plain user input eligibility', () => {
    const inputs = new XpertMemoryUserInput(null)
    const text = '仓库交接清单几点归档？'
    const human = new HumanMessage(text)
    const state = { inputIdentity: { id: 'turn' }, human: { input: text } }
    it('requires the current original human message', () => {
        expect(inputs.plainText('turn', [human], state)).toBe(text)
        expect(inputs.plainText('older', [human], state)).toBeUndefined()
        expect(inputs.plainText('turn', [new HumanMessage('rewritten')], state)).toBeUndefined()
        expect(inputs.plainText('turn', [new AIMessage(text)], state)).toBeUndefined()
        expect(
            inputs.plainText('turn', [new HumanMessage({ content: [{ type: 'text', text }] })], state)
        ).toBeUndefined()
    })
    it.each([
        { files: [{}] },
        { references: [{}] },
        { resourceSkills: [{}] },
        { commandSource: {} },
        { planMode: true }
    ])('excludes turns with additional context %j', (extra) => {
        expect(inputs.plainText('turn', [human], { ...state, human: { input: text, ...extra } })).toBeUndefined()
    })
})
