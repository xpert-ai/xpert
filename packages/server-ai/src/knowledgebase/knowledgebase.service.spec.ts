jest.mock('@nestjs/typeorm', () => ({
	InjectRepository: () => () => undefined
}))

jest.mock('../xpert-workspace', () => ({
	XpertWorkspaceBaseService: class XpertWorkspaceBaseService<T> {
		protected repository: any

		constructor(repository: any) {
			this.repository = repository
		}

		async findOne() {
			return null
		}
	}
}))

import { AiModelTypeEnum } from '@metad/contracts'
import { BadRequestException } from '@nestjs/common'
import { CopilotModelGetChatModelQuery } from '../copilot-model/queries'
import { KnowledgebaseService } from './knowledgebase.service'

describe('KnowledgebaseService.getVisionModel', () => {
	function createService() {
		const service = new KnowledgebaseService({} as any, {} as any, {} as any)
		const queryBus = {
			execute: jest.fn().mockResolvedValue('vision-chat-model')
		}

		;(service as any).queryBus = queryBus

		return {
			service,
			queryBus
		}
	}

	it('accepts a vision model reference that only carries copilotId and model', async () => {
		const { service, queryBus } = createService()

		const result = await service.getVisionModel('kb-1', {
			copilotId: 'copilot-1',
			model: 'gpt-4.1',
			modelType: AiModelTypeEnum.LLM
		})

		expect(result).toBe('vision-chat-model')
		expect(queryBus.execute).toHaveBeenCalledTimes(1)
		const [query] = queryBus.execute.mock.calls[0]
		expect(query).toBeInstanceOf(CopilotModelGetChatModelQuery)
		expect(query.copilot).toBeUndefined()
		expect(query.copilotModel).toEqual(
			expect.objectContaining({
				copilotId: 'copilot-1',
				model: 'gpt-4.1',
				modelType: AiModelTypeEnum.LLM
			})
		)
	})

	it('falls back to the persisted knowledgebase vision model when the node does not pass one', async () => {
		const { service, queryBus } = createService()
		const findOneSpy = jest.spyOn(service, 'findOne').mockResolvedValue({
			visionModel: {
				copilot: { id: 'copilot-2' },
				copilotId: 'copilot-2',
				model: 'gpt-4o',
				modelType: AiModelTypeEnum.LLM
			}
		} as any)

		const result = await service.getVisionModel('kb-2', null)

		expect(result).toBe('vision-chat-model')
		expect(findOneSpy).toHaveBeenCalledWith('kb-2', {
			relations: ['visionModel', 'visionModel.copilot']
		})
		const [query] = queryBus.execute.mock.calls[0]
		expect(query).toBeInstanceOf(CopilotModelGetChatModelQuery)
		expect(query.copilotModel).toEqual(
			expect.objectContaining({
				copilotId: 'copilot-2',
				model: 'gpt-4o'
			})
		)
	})

	it('throws a validation error when no usable vision model reference exists', async () => {
		const { service } = createService()
		jest.spyOn(service, 'findOne').mockResolvedValue({
			visionModel: null
		} as any)

		await expect(
			service.getVisionModel('kb-3', {
				copilotId: 'copilot-3',
				model: null
			} as any)
		).rejects.toBeInstanceOf(BadRequestException)
	})
})
