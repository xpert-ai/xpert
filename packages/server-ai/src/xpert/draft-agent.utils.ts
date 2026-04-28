import type { IXpertAgent, TXpertTeamDraft, TXpertTeamNode } from '@xpert-ai/contracts'
import { isKeyEqual } from '../shared'

export type TXpertResolvedDraftAgentNode =
	| TXpertTeamNode<'agent'>
	| {
			key: string
			type: 'agent'
			entity: IXpertAgent
			position: null
	  }

function isOptionalKeyEqual(value: string | undefined, target: string) {
	return Boolean(value && isKeyEqual(value, target))
}

export function resolveDraftAgentNode(
	draft: TXpertTeamDraft,
	nodes: TXpertTeamNode[] | null | undefined,
	keyOrName?: string
): TXpertResolvedDraftAgentNode | null {
	const primaryAgent = draft.team?.agent
	const targetKeyOrName = keyOrName ?? primaryAgent?.key
	if (!targetKeyOrName) {
		return null
	}

	const agentNode = nodes?.find(
		(node): node is TXpertTeamNode<'agent'> =>
			node.type === 'agent' &&
			(isKeyEqual(node.key, targetKeyOrName) || isOptionalKeyEqual(node.entity.name, targetKeyOrName))
	)

	if (agentNode) {
		return agentNode
	}

	if (
		primaryAgent?.options?.hidden &&
		(isKeyEqual(primaryAgent.key, targetKeyOrName) || isOptionalKeyEqual(primaryAgent.name, targetKeyOrName))
	) {
		return {
			key: primaryAgent.key,
			type: 'agent',
			entity: primaryAgent,
			position: null
		}
	}

	return null
}
