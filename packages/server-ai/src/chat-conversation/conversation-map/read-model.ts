import type { GroupMapPage } from '../../chat-group/group-map.schema'
import type { MapEdge, MapNode, MapNodeCapability, MapPage, MapSourcePage } from './schema'

/** Normalize an already-authorized reader result. This adapter never broadens its data audience. */
export function assistantMapPage(source: MapSourcePage): MapPage {
    const { nextOffset, nextSearchOffset, ...page } = source
    const nodes: MapNode[] = source.nodes.map((node) => {
        const capabilities: MapNodeCapability[] = []
        const anchor =
            node.conversationId && node.threadId
                ? {
                      target: 'assistant.conversation' as const,
                      conversationId: node.conversationId,
                      threadId: node.threadId,
                      messageId: node.messageId
                  }
                : undefined
        if (anchor) {
            capabilities.push('locate', 'copy')
            if (node.kind === 'conversation' || node.kind === 'thread' || node.kind === 'segment')
                capabilities.push('rename')
            if (node.kind === 'thread' || node.kind === 'segment') capabilities.push('side-chat')
            if (node.branchAvailable) capabilities.push('branch')
            if (node.branchMessageId) capabilities.push('inspect')
        }
        // A segment chooses among already-authorized branches in the renderer.
        if (node.kind === 'segment' && node.conversationId && node.segmentThreads?.length && !anchor)
            capabilities.push('locate', 'copy', 'rename', 'side-chat')
        return { ...node, capabilities, anchor }
    })
    const edges: MapEdge[] = nodes.flatMap((node) => {
        const edges: MapEdge[] = []
        if (node.parentId) edges.push(edge('contains', node.parentId, node.id))
        if (node.parentThreadId) edges.push(edge('branch', `thread:${node.parentThreadId}`, node.id))
        if (node.sourceConversationId) edges.push(edge('source', `conversation:${node.sourceConversationId}`, node.id))
        return edges
    })
    return {
        ...page,
        nodes,
        edges,
        scope: {
            kind: 'assistant',
            id: `assistant:${page.assistantId}:${page.projectId ?? 'unassigned'}`,
            title: page.projectTitle
        },
        participants: [],
        capabilities: ['select-project', 'history', 'segments', 'execution-trail'],
        pageInfo: {
            next: nextOffset === null ? null : { type: 'offset', offset: nextOffset, searchOffset: nextSearchOffset }
        }
    }
}

/** Public group messages become ordinary map nodes; no second group payload crosses the View boundary. */
export function groupMapPage(
    group: GroupMapPage,
    project: { id: string | null; title: string },
    assistantId: string
): MapPage {
    const conversationId = `conversation:${group.groupId}`
    const nodes: MapNode[] = [
        {
            id: conversationId,
            kind: 'conversation',
            title: group.title,
            parentId: `project:${project.id ?? 'unassigned'}`,
            preview: '',
            expandable: true,
            conversationId: group.groupId,
            threadId: group.threadId,
            messageCount: 0,
            capabilities: []
        }
    ]
    const edges: MapEdge[] = [edge('contains', nodes[0].parentId!, conversationId)]
    for (const message of group.messages) {
        const id = `message:${message.id}`
        nodes.push({
            id,
            kind: 'message',
            title: group.members.find((member) => member.id === message.senderId)?.name ?? message.senderId,
            parentId: conversationId,
            preview: message.preview,
            expandable: false,
            conversationId: group.groupId,
            threadId: group.threadId,
            messageId: message.id,
            updatedAt: message.createdAt,
            capabilities: ['locate'],
            anchor: {
                target: 'group.message',
                conversationId: group.groupId,
                threadId: group.threadId,
                messageId: message.id
            },
            message: {
                sequence: message.sequence,
                senderId: message.senderId,
                recipientIds: message.recipientIds,
                intent: message.intent,
                replyStage: message.replyStage,
                contentKinds: message.contentKinds
            }
        })
        edges.push(edge('contains', conversationId, id))
        if (message.parentId && message.relation) edges.push(edge(message.relation, `message:${message.parentId}`, id))
    }
    return {
        scope: {
            kind: 'group',
            id: group.groupId,
            title: group.title,
            conversationId: group.groupId,
            threadId: group.threadId
        },
        nodes,
        edges,
        participants: group.members,
        capabilities: ['participants', 'live'],
        pageInfo: {
            next: group.nextBefore === null ? null : { type: 'before', sequence: group.nextBefore },
            revision: group.revision
        },
        total: group.messages.length,
        currentConversationId: group.groupId,
        assistantId,
        projectId: project.id,
        projectTitle: project.title
    }
}

function edge(kind: MapEdge['kind'], source: string, target: string): MapEdge {
    return { id: `${kind}:${source}>${target}`, source, target, kind }
}
