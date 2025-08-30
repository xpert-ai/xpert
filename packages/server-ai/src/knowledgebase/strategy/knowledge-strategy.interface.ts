import { IIntegration } from '@metad/contracts'
import { Document } from 'langchain/document'

export type TKnowledgeStrategyParams = {
	query: string;
	k: number;
	filter: Record<string, any>
	options: {
		knowledgebaseId: string
	}
}

export interface KnowledgeStrategy {
	execute(integration: IIntegration, payload: TKnowledgeStrategyParams): Promise<{ chunks: [Document, number][] }>
}
