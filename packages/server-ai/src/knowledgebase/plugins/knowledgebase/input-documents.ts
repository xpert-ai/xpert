import { channelName, IKnowledgeDocument, TXpertGraph } from '@metad/contracts'
import { get } from 'lodash'

export function resolveKnowledgeBaseInputDocuments(
	stateEnv: object,
	graph: TXpertGraph,
	nodeKey: string,
	inputs: string[] | undefined
): Partial<IKnowledgeDocument>[] {
	const configuredDocuments = (inputs ?? []).flatMap((input) => {
		const value = get(stateEnv, input) as Partial<IKnowledgeDocument>[] | undefined
		return Array.isArray(value) ? value : []
	})

	if (configuredDocuments.length) {
		return deduplicateDocuments(configuredDocuments)
	}

	const upstreamDocuments = graph.connections.flatMap((connection) => {
		if (connection.to !== nodeKey) {
			return []
		}

		const sourceNodeKey = connection.from.split('/')[0]
		const value = get(stateEnv, `${channelName(sourceNodeKey)}.documents`) as Partial<IKnowledgeDocument>[] | undefined
		return Array.isArray(value) ? value : []
	})

	return deduplicateDocuments(upstreamDocuments)
}

function deduplicateDocuments(documents: Partial<IKnowledgeDocument>[]) {
	const seen = new Set<string>()
	return documents.filter((document) => {
		if (!document.id || seen.has(document.id)) {
			return false
		}

		seen.add(document.id)
		return true
	})
}
