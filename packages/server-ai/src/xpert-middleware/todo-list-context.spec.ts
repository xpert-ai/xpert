import { AIMessage, HumanMessage, ToolMessage } from '@langchain/core/messages'
import { currentTodoContext } from './todo-list-context'

const pair = (id: string) => [
    new AIMessage({
        content: '',
        tool_calls: [{ id, name: 'write_todos', args: { todos: [{ content: id, status: 'pending' }] } }]
    }),
    new ToolMessage({ content: 'saved', tool_call_id: id })
]
it('keeps the latest complete scratch list and all user requests without mutating history', () => {
    const old = pair('old'),
        latest = pair('latest'),
        user = new HumanMessage('Keep independent review')
    const history = [...old, user, ...latest],
        before = JSON.stringify(history)
    expect(currentTodoContext(history)).toEqual([user, ...latest])
    expect(JSON.stringify(history)).toBe(before)
})
it('never drops pending/error/signed/parallel calls or natural language findings', () => {
    const old = pair('old'),
        latest = pair('latest')
    for (const history of [
        [...old, latest[0]],
        [
            ...old,
            new AIMessage({ content: '', tool_calls: [{ id: 'new', name: 'write_todos', args: { todos: [] } }] }),
            new ToolMessage({ content: 'error', tool_call_id: 'new', status: 'error' })
        ],
        [
            new AIMessage({
                content: 'negative finding',
                tool_calls: [{ id: 'old', name: 'write_todos', args: { todos: [] } }]
            }),
            old[1],
            ...latest
        ],
        [
            new AIMessage({
                content: '',
                additional_kwargs: { signature: 'signed' },
                tool_calls: [{ id: 'old', name: 'write_todos', args: { todos: [] } }]
            }),
            old[1],
            ...latest
        ]
    ]) {
        expect(currentTodoContext(history)).toEqual(history)
    }
})
