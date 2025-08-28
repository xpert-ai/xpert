import { Embeddings } from '@langchain/core/embeddings'
import { AiProviderRole, ICopilot, TLongTermMemory, TXpertTeamDraft } from '@metad/contracts'
import { HttpException, HttpStatus } from '@nestjs/common'
import { QueryBus } from '@nestjs/cqrs'
import { CopilotGetOneQuery, CopilotOneByRoleQuery } from '../copilot'
import { CopilotModelGetEmbeddingsQuery } from '../copilot-model'
import { CopilotNotFoundException } from '../core/errors'

export const EventNameXpertValidate = 'xpert.validate'

export class XpertDraftValidateEvent {
  constructor(
    public readonly draft: TXpertTeamDraft,
  ) {}
}


export class XpertNameInvalidException extends HttpException {
	constructor(message: string) {
		super(message, HttpStatus.BAD_REQUEST)
	}
}

/**
 * Create embeddings for long-term memory
 * @returns Embeddings
 */
export async function createMemoryEmbeddings(
	memory: TLongTermMemory,
	queryBus: QueryBus,
	params: { tenantId: string; organizationId: string }
) {
	const { tenantId, organizationId } = params
	let copilot: ICopilot = null
	if (memory.copilotModel?.copilotId) {
		copilot = await queryBus.execute(
			new CopilotGetOneQuery(tenantId, memory.copilotModel.copilotId, ['copilotModel', 'modelProvider'])
		)
	} else {
		copilot = await queryBus.execute(
			new CopilotOneByRoleQuery(tenantId, organizationId, AiProviderRole.Embedding, [
				'copilotModel',
				'modelProvider'
			])
		)
	}

	if (!copilot?.enabled) {
		throw new CopilotNotFoundException(`Not found the embeddinga role copilot`)
	}

	let embeddings: Embeddings = null
	const copilotModel = memory.copilotModel ?? copilot.copilotModel
	if (copilotModel && copilot?.modelProvider) {
		embeddings = await queryBus.execute<CopilotModelGetEmbeddingsQuery, Embeddings>(
			new CopilotModelGetEmbeddingsQuery(copilot, copilotModel, {
				tokenCallback: (token) => {
					// execution.embedTokens += token ?? 0
				}
			})
		)
	}

	return embeddings
}
