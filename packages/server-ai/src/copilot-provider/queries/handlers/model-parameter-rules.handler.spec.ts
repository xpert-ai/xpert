jest.mock('../../../ai-model', () => ({
	AIProvidersService: class AIProvidersService {}
}))

jest.mock('../../copilot-provider.service', () => ({
	CopilotProviderService: class CopilotProviderService {}
}))

jest.mock('../../models/copilot-provider-model.service', () => ({
	CopilotProviderModelService: class CopilotProviderModelService {}
}))

import { AiModelTypeEnum } from '@metad/contracts'
import { NotFoundException } from '@nestjs/common'
import { CopilotProviderModelParameterRulesHandler } from './model-parameter-rules.handler'
import { CopilotProviderModelParameterRulesQuery } from '../model-parameter-rules.query'

describe('CopilotProviderModelParameterRulesHandler', () => {
	let service: { findOneInOrganizationOrTenant: jest.Mock }
	let modelService: { findOneOrFailByWhereOptions: jest.Mock }
	let providersService: { getProvider: jest.Mock }
	let handler: CopilotProviderModelParameterRulesHandler

	beforeEach(() => {
		service = {
			findOneInOrganizationOrTenant: jest.fn()
		}
		modelService = {
			findOneOrFailByWhereOptions: jest.fn()
		}
		providersService = {
			getProvider: jest.fn()
		}

		handler = new CopilotProviderModelParameterRulesHandler(
			service as any,
			modelService as any,
			providersService as any,
			{} as any
		)
	})

	it('throws a Http error when the copilot provider is missing', async () => {
		service.findOneInOrganizationOrTenant.mockResolvedValue(null)

		await expect(
			handler.execute(
				new CopilotProviderModelParameterRulesQuery(
					'provider-id',
					AiModelTypeEnum.LLM,
					'doubao-seed-2-0-pro-260215'
				)
			)
		).rejects.toBeInstanceOf(NotFoundException)

		expect(providersService.getProvider).not.toHaveBeenCalled()
	})

	it('throws a Http error when the backing provider strategy is unavailable', async () => {
		service.findOneInOrganizationOrTenant.mockResolvedValue({ providerName: 'volcengine' })
		modelService.findOneOrFailByWhereOptions.mockResolvedValue({ success: false, error: new Error('missing') })
		providersService.getProvider.mockImplementation(() => {
			throw new NotFoundException('AI Model Provider strategy not found for provider: volcengine')
		})

		await expect(
			handler.execute(
				new CopilotProviderModelParameterRulesQuery(
					'provider-id',
					AiModelTypeEnum.LLM,
					'doubao-seed-2-0-pro-260215'
				)
			)
		).rejects.toBeInstanceOf(NotFoundException)
	})

	it('returns parameter rules from the resolved model manager', async () => {
		const rules = [{ name: 'temperature' }]
		const getParameterRules = jest.fn().mockReturnValue(rules)

		service.findOneInOrganizationOrTenant.mockResolvedValue({ providerName: 'volcengine' })
		modelService.findOneOrFailByWhereOptions.mockResolvedValue({
			success: true,
			record: {
				modelProperties: { max_tokens: 4096 }
			}
		})
		providersService.getProvider.mockReturnValue({
			getModelManager: jest.fn().mockReturnValue({
				getParameterRules
			})
		})

		await expect(
			handler.execute(
				new CopilotProviderModelParameterRulesQuery(
					'provider-id',
					AiModelTypeEnum.LLM,
					'doubao-seed-2-0-pro-260215'
				)
			)
		).resolves.toEqual(rules)

		expect(getParameterRules).toHaveBeenCalledWith('doubao-seed-2-0-pro-260215', { max_tokens: 4096 })
	})
})
