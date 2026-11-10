import { assistantMapPage, groupMapPage } from './read-model'
import { mapPageSchema, type MapSourcePage } from './schema'
import type { GroupMapPage } from '../../chat-group/group-map.schema'

const group: GroupMapPage = {
    groupId: 'group',
    threadId: 'public',
    title: 'Meeting',
    revision: 8,
    nextBefore: 21,
    members: [{ id: 'member', name: 'Supply chain', kind: 'assistant', active: true }],
    messages: [
        {
            id: 'reply',
            sequence: 22,
            senderId: 'member',
            recipientIds: ['owner'],
            intent: 'reply',
            replyStage: 'progress',
            parentId: 'request',
            relation: 'reply',
            preview: 'Partial result',
            contentKinds: ['result'],
            createdAt: '2026-11-10T01:00:00.000Z'
        }
    ]
}
it('projects public messages into the canonical contract without a second group payload', () => {
    const page = groupMapPage(group, { id: 'p', title: 'Project' }, 'assistant')
    expect(mapPageSchema.parse(page)).toEqual(page)
    expect(page).not.toHaveProperty('group')
    expect(page).not.toHaveProperty('nextBefore')
    expect(page.pageInfo).toEqual({ next: { type: 'before', sequence: 21 }, revision: 8 })
    expect(page.nodes[1]).toMatchObject({
        kind: 'message',
        title: 'Supply chain',
        capabilities: ['locate'],
        anchor: { target: 'group.message', conversationId: 'group', threadId: 'public', messageId: 'reply' },
        message: { intent: 'reply', replyStage: 'progress', contentKinds: ['result'] }
    })
    expect(page.capabilities).not.toContain('execution-trail')
})
it('preserves containment independently of replies to parents outside the current page', () => {
    const page = groupMapPage(group, { id: null, title: 'None' }, 'assistant')
    expect(page.edges).toEqual(
        expect.arrayContaining([
            expect.objectContaining({ source: 'conversation:group', target: 'message:reply', kind: 'contains' }),
            expect.objectContaining({ source: 'message:request', target: 'message:reply', kind: 'reply' })
        ])
    )
    expect(page.nodes[1].parentId).toBe('conversation:group')
})
it('does not manufacture replies or completion from ordinary messages and cards', () => {
    const page = groupMapPage(
        {
            ...group,
            messages: [
                { ...group.messages[0], intent: 'message', replyStage: undefined, parentId: null, relation: null }
            ]
        },
        { id: null, title: '' },
        'assistant'
    )
    expect(page.edges.every((edge) => edge.kind === 'contains')).toBe(true)
    expect(page.nodes[1].message?.replyStage).toBeUndefined()
})
const single: MapSourcePage = {
    nodes: [
        {
            id: 'thread:b',
            kind: 'thread',
            title: 'Side',
            parentId: 'conversation:a',
            parentThreadId: 'main',
            conversationId: 'a',
            threadId: 'b',
            preview: '',
            expandable: true
        },
        {
            id: 'turn:b:m',
            kind: 'turn',
            title: 'Reply',
            parentId: 'thread:b',
            conversationId: 'a',
            threadId: 'b',
            messageId: 'm',
            preview: '',
            expandable: false,
            branchAvailable: true,
            branchMessageId: 'm'
        }
    ],
    nextOffset: 20,
    nextSearchOffset: 3,
    total: 50,
    assistantId: 'assistant',
    projectId: 'p',
    projectTitle: 'Project'
}
it('normalizes single chat to the same schema while preserving branch actions and independent edge semantics', () => {
    const page = assistantMapPage(single)
    expect(mapPageSchema.parse(page)).toEqual(page)
    expect(page).not.toHaveProperty('nextOffset')
    expect(page.pageInfo.next).toEqual({ type: 'offset', offset: 20, searchOffset: 3 })
    expect(page.edges.map((edge) => edge.kind)).toEqual(['contains', 'branch', 'contains'])
    expect(page.nodes[0].capabilities).toEqual(['locate', 'copy', 'rename', 'side-chat'])
    expect(page.nodes[1].capabilities).toEqual(['locate', 'copy', 'branch', 'inspect'])
    expect(page.nodes[1].anchor?.target).toBe('assistant.conversation')
})
it('retains actions for compressed single-chat segments without enabling them on group nodes', () => {
    const page = assistantMapPage({
        ...single,
        nodes: [
            {
                ...single.nodes[0],
                kind: 'segment',
                threadId: undefined,
                segmentThreads: [{ threadId: 'b', title: 'B', current: true, status: 'idle' }]
            }
        ]
    })
    expect(page.nodes[0].capabilities).toEqual(['locate', 'copy', 'rename', 'side-chat'])
    expect(groupMapPage(group, { id: null, title: '' }, 'assistant').nodes[1].capabilities).toEqual(['locate'])
})
