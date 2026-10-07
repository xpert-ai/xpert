import { AIMessage, ToolMessage } from '@langchain/core/messages'
import { executionOutcome, parseExecutionOutcome } from './execution-outcome'

const outcome = { status: 'accepted', subjectId: 'task', accepted: true }
const receipt = (executionId: string, value = outcome) =>
    new ToolMessage({
        content: 'receipt',
        tool_call_id: 'call',
        artifact: { type: 'agent_execution_outcome', executionId, outcome: value }
    })

describe('business outcome protocol', () => {
    it('uses the latest receipt for this invocation, excluding inherited and nested assistant results', () => {
        expect(
            executionOutcome(
                [
                    receipt('parent'),
                    receipt('child', { ...outcome, status: 'incomplete', accepted: false }),
                    receipt('child'),
                    receipt('nested'),
                    new AIMessage('Failed, please retry')
                ],
                'child'
            )
        ).toEqual(outcome)
        expect(executionOutcome([receipt('previous'), new AIMessage(JSON.stringify(outcome))], 'new')).toBeUndefined()
    })
    it('ignores malformed, contradictory and untyped artifacts', () => {
        for (const value of [null, {}, { ...outcome, status: 'not_claimed' }, { ...outcome, status: 'made-up' }]) {
            expect(parseExecutionOutcome(value)).toBeUndefined()
        }
        expect(
            executionOutcome([new ToolMessage({ content: 'done', tool_call_id: 'x', artifact: outcome })], 'child')
        ).toBeUndefined()
    })
})
