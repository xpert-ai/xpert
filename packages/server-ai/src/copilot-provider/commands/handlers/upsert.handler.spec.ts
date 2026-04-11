jest.mock('../../../ai-model', () => ({
	AIProvidersService: class AIProvidersService {},
	AiProviderCredentialsValidateCommand: class AiProviderCredentialsValidateCommand {
		constructor(
			public readonly provider: string,
			public readonly credentials: Record<string, any>
		) {}
	}
}))

jest.mock('../../copilot-provider.service', () => ({
	CopilotProviderService: class CopilotProviderService {}
}))

import { NotFoundException } from '@nestjs/common'
import { CopilotProviderUpsertCommand } from '../upsert.command'
import { CopilotProviderUpsertHandler } from './upsert.handler'

describe('CopilotProviderUpsertHandler', () => {
	let commandBus: { execute: jest.Mock }
	let providersService: { getProvider: jest.Mock }
	let service: { create: jest.Mock; update: jest.Mock; findOne: jest.Mock }
	let handler: CopilotProviderUpsertHandler

	beforeEach(() => {
		commandBus = {
			execute: jest.fn()
		}
		providersService = {
			getProvider: jest.fn()
		}
		service = {
			create: jest.fn(),
			update: jest.fn(),
			findOne: jest.fn()
		}

		handler = new CopilotProviderUpsertHandler(commandBus as any, providersService as any, service as any)
	})

	it('validates provider availability before creating a provider record', async () => {
		const entity = {
			providerName: 'volcengine'
		}
		const created = { id: 'provider-id', ...entity }

		providersService.getProvider.mockReturnValue({ provider: 'volcengine' })
		service.create.mockResolvedValue(created)

		await expect(handler.execute(new CopilotProviderUpsertCommand(entity))).resolves.toEqual(created)

		expect(providersService.getProvider).toHaveBeenCalledWith('volcengine', true)
		expect(service.create).toHaveBeenCalledWith(entity)
		expect(commandBus.execute).not.toHaveBeenCalled()
	})

	it('stops persistence when the provider strategy cannot be resolved', async () => {
		providersService.getProvider.mockImplementation(() => {
			throw new NotFoundException('AI Model Provider strategy not found for provider: missing-provider')
		})

		await expect(
			handler.execute(
				new CopilotProviderUpsertCommand({
					providerName: 'missing-provider'
				})
			)
		).rejects.toBeInstanceOf(NotFoundException)

		expect(service.create).not.toHaveBeenCalled()
		expect(service.update).not.toHaveBeenCalled()
	})
})
