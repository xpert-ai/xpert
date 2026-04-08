import { channelName, TXpertGraph } from '@metad/contracts'
import { resolveKnowledgeBaseInputDocuments } from './input-documents'

describe('resolveKnowledgeBaseInputDocuments', () => {
	it('falls back to upstream connected documents when configured inputs resolve empty', () => {
		const graph: TXpertGraph = {
			nodes: [],
			connections: [
				{
					type: 'edge',
					key: 'Understanding_Node/KnowledgeBase_Node',
					from: 'Understanding_Node',
					to: 'KnowledgeBase_Node'
				}
			]
		}

		const state = {
			[channelName('Understanding_Node')]: {
				documents: [{ id: 'doc-1', name: 'IMG.png' }]
			}
		}

		expect(
			resolveKnowledgeBaseInputDocuments(state, graph, 'KnowledgeBase_Node', [
				'understanding_old_channel.documents'
			])
		).toEqual([{ id: 'doc-1', name: 'IMG.png' }])
	})

	it('prefers explicitly configured inputs when they resolve successfully', () => {
		const graph: TXpertGraph = {
			nodes: [],
			connections: [
				{
					type: 'edge',
					key: 'Understanding_Node/KnowledgeBase_Node',
					from: 'Understanding_Node',
					to: 'KnowledgeBase_Node'
				}
			]
		}

		const state = {
			manual_input: [{ id: 'doc-configured', name: 'Configured.png' }],
			[channelName('Understanding_Node')]: {
				documents: [{ id: 'doc-upstream', name: 'Upstream.png' }]
			}
		}

		expect(resolveKnowledgeBaseInputDocuments(state, graph, 'KnowledgeBase_Node', ['manual_input'])).toEqual([
			{ id: 'doc-configured', name: 'Configured.png' }
		])
	})
})
