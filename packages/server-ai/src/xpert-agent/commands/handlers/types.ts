import { IXpertAgent, TXpertGraph } from '@metad/contracts'

export function parseXmlString(content: string) {
	return content?.replace(/&lt;/g, '<').replace(/&gt;/g, '>')
}

export function allAgentsKey(graph: TXpertGraph): IXpertAgent[] {
	return graph.nodes.filter((n) => n.type === 'agent').map((_) => _.entity as IXpertAgent)
}
