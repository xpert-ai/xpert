import { TXpertGraph, TXpertTeamConnection, TXpertTeamNode, WorkflowNodeTypeEnum } from '@xpert-ai/contracts'
import { getWorkflowNextNodes } from './create-workflow.handler'

function createWorkflowNode(
    key: string,
    type: WorkflowNodeTypeEnum = WorkflowNodeTypeEnum.ANSWER,
    parentId?: string
): TXpertTeamNode<'workflow'> {
    return {
        type: 'workflow',
        key,
        parentId,
        position: { x: 0, y: 0 },
        entity: {
            id: key,
            key,
            type
        }
    }
}

function createEdge(from: string, to: string): TXpertTeamConnection {
    return {
        type: 'edge',
        key: `${from}/${to}`,
        from,
        to
    }
}

describe('getWorkflowNextNodes', () => {
    it('does not treat iterator container child edges as external next nodes', () => {
        const iterator = createWorkflowNode('Iterator_1', WorkflowNodeTypeEnum.ITERATOR)
        const iteratorChild = createWorkflowNode('ChildAgent_1', WorkflowNodeTypeEnum.MIDDLEWARE, iterator.key)
        const unrelatedPrefixNode = createWorkflowNode('Iterator_10', WorkflowNodeTypeEnum.ANSWER)
        const outsideAnswer = createWorkflowNode('Answer_1', WorkflowNodeTypeEnum.ANSWER)
        const graph: TXpertGraph = {
            nodes: [iterator, iteratorChild, unrelatedPrefixNode, outsideAnswer],
            connections: [
                createEdge(`${iterator.key}/start`, iteratorChild.key),
                createEdge(unrelatedPrefixNode.key, outsideAnswer.key)
            ]
        }

        expect(getWorkflowNextNodes(graph, iterator)).toEqual([])
    })

    it('keeps direct, branch, and fail handles that point outside the current workflow node', () => {
        const router = createWorkflowNode('Router_1', WorkflowNodeTypeEnum.IF_ELSE)
        const directTarget = createWorkflowNode('DirectTarget_1')
        const caseTarget = createWorkflowNode('CaseTarget_1')
        const elseTarget = createWorkflowNode('ElseTarget_1')
        const failTarget = createWorkflowNode('FailTarget_1')
        const graph: TXpertGraph = {
            nodes: [router, directTarget, caseTarget, elseTarget, failTarget],
            connections: [
                createEdge(router.key, directTarget.key),
                createEdge(`${router.key}/case-1`, caseTarget.key),
                createEdge(`${router.key}/else`, elseTarget.key),
                createEdge(`${router.key}/fail`, failTarget.key)
            ]
        }

        expect(getWorkflowNextNodes(graph, router).map((node) => node.key)).toEqual([
            directTarget.key,
            caseTarget.key,
            elseTarget.key,
            failTarget.key
        ])
    })
})
