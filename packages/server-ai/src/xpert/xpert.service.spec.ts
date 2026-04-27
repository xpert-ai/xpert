jest.mock('../copilot', () => ({
	CopilotGetOneQuery: class CopilotGetOneQuery {},
	CopilotOneByRoleQuery: class CopilotOneByRoleQuery {}
}))

jest.mock('../copilot-model', () => ({
	CopilotModelGetEmbeddingsQuery: class CopilotModelGetEmbeddingsQuery {}
}))

import { AiModelTypeEnum, XpertTypeEnum } from '@xpert-ai/contracts'
import type { VolumeClient } from '../shared/volume'
import type { XpertWorkspaceAccessService } from '../xpert-workspace'
import { XpertPublishCommand } from './commands'
import { XpertService } from './xpert.service'

describe('XpertService command facade', () => {
	function createService() {
		const repository = {
			create: jest.fn((entity) => entity),
			findOne: jest.fn(),
			save: jest.fn(),
			find: jest.fn(),
			findOneBy: jest.fn(),
			count: jest.fn(),
			createQueryBuilder: jest.fn().mockReturnValue({
				innerJoin: jest.fn().mockReturnThis(),
				where: jest.fn().mockReturnThis(),
				select: jest.fn().mockReturnThis(),
				getMany: jest.fn().mockResolvedValue([]),
				leftJoinAndSelect: jest.fn().mockReturnThis(),
				addOrderBy: jest.fn().mockReturnThis(),
				take: jest.fn().mockReturnThis()
			})
		}
		const workspaceAccessService = {} as unknown as XpertWorkspaceAccessService
		const storeService = {
			findAll: jest.fn()
		}
		const userService = {
			findAll: jest.fn(),
			findOne: jest.fn()
		}
		const commandBus = { execute: jest.fn().mockResolvedValue(undefined) }
		const queryBus = { execute: jest.fn() }
		const eventEmitter = { emitAsync: jest.fn().mockResolvedValue([]) }
		const triggerRegistry = { get: jest.fn(), list: jest.fn().mockReturnValue([]) }
		const sandboxService = { listProviders: jest.fn().mockReturnValue([]) }
		const volumeClient = {
			resolve: jest.fn<ReturnType<VolumeClient['resolve']>, Parameters<VolumeClient['resolve']>>(),
			resolveRoot: jest.fn<ReturnType<VolumeClient['resolveRoot']>, Parameters<VolumeClient['resolveRoot']>>()
		} satisfies VolumeClient

		const service = new XpertService(
			repository as any,
			workspaceAccessService,
			storeService as any,
			userService as any,
			commandBus as any,
			queryBus as any,
			eventEmitter as any,
			triggerRegistry as any,
			sandboxService as any,
			volumeClient
		)

		return {
			service,
			commandBus,
			repository,
			triggerRegistry
		}
	}

	it('publish forwards to XpertPublishCommand', async () => {
		const { service, commandBus } = createService()

		await service.publish('xpert-1', true, 'env-1', 'release note')

		expect(commandBus.execute).toHaveBeenCalledTimes(1)
		const [command] = commandBus.execute.mock.calls[0]
		expect(command).toBeInstanceOf(XpertPublishCommand)
		expect(command).toEqual(
			expect.objectContaining({
				id: 'xpert-1',
				newVersion: true,
				environmentId: 'env-1',
				notes: 'release note'
			})
		)
	})

	it('getTriggerProviders returns providers meta from trigger registry', async () => {
		const { service, triggerRegistry } = createService()
		triggerRegistry.list.mockReturnValue([
			{
				meta: {
					name: 'lark'
				}
			},
			{
				meta: {
					name: 'schedule'
				}
			}
		])

		const providers = await service.getTriggerProviders()

		expect(providers).toEqual([
			{
				name: 'lark'
			},
			{
				name: 'schedule'
			}
		])
	})

	it('normalizes agentConfig recursionLimit on create', async () => {
		const { repository, service } = createService()
		repository.save.mockImplementation(async (entity) => entity)

		const created = await service.create({
			name: 'agent-defaults',
			agentConfig: {
				maxConcurrency: 4
			}
		} as any)

		expect(repository.create).toHaveBeenCalledWith(
			expect.objectContaining({
				name: 'agent-defaults',
				agentConfig: {
					maxConcurrency: 4,
					recursionLimit: 1000
				}
			})
		)
		expect(created).toEqual(
			expect.objectContaining({
				agentConfig: {
					maxConcurrency: 4,
					recursionLimit: 1000
				}
			})
		)
	})

	it('normalizes agentConfig recursionLimit on save', async () => {
		const { repository, service } = createService()
		repository.save.mockImplementation(async (entity) => entity)

		await service.save({
			id: 'xpert-1',
			agentConfig: {
				maxConcurrency: 2
			}
		} as any)

		expect(repository.save).toHaveBeenCalledWith(
			expect.objectContaining({
				id: 'xpert-1',
				agentConfig: {
					maxConcurrency: 2,
					recursionLimit: 1000
				}
			})
		)
	})

	it('preserves published graph when updating only draft basic information', async () => {
		const { repository, service } = createService()
		const xpert = {
			id: 'xpert-1',
			name: 'sales-agent',
			slug: 'sales-agent',
			type: XpertTypeEnum.Agent,
			graph: {
				nodes: [
					{
						key: 'Agent_1',
						type: 'agent' as const,
						position: { x: 0, y: 0 },
						entity: { key: 'Agent_1', name: 'Sales Agent' }
					}
				],
				connections: [
					{
						key: 'Agent_1/Workflow_1',
						from: 'Agent_1',
						to: 'Workflow_1',
						type: 'edge' as const
					}
				]
			}
		}
		jest.spyOn(service, 'findOne').mockResolvedValue(xpert)
		repository.save.mockImplementation(async (entity) => entity)

		const draft = await service.updateDraft('xpert-1', {
			team: {
				id: 'xpert-1',
				title: 'Updated title'
			}
		})

		expect(draft.nodes).toEqual(xpert.graph.nodes)
		expect(draft.connections).toEqual(xpert.graph.connections)
		expect(draft.team).toEqual(
			expect.objectContaining({
				id: 'xpert-1',
				title: 'Updated title'
			})
		)
	})

	it('syncs stale primary agent model from the draft node before saving', async () => {
		const { repository, service } = createService()
		const qvqModel = {
			copilotId: 'copilot-qvq',
			modelType: AiModelTypeEnum.LLM,
			model: 'qvq-max'
		}
		const deepSeekModel = {
			copilotId: 'copilot-deepseek',
			modelType: AiModelTypeEnum.LLM,
			model: 'deepseek-r1'
		}
		const xpert = {
			id: 'xpert-1',
			name: 'research',
			slug: 'research',
			type: XpertTypeEnum.Agent
		}
		jest.spyOn(service, 'findOne').mockResolvedValue(xpert)
		repository.save.mockImplementation(async (entity) => entity)

		const draft = await service.saveDraft('xpert-1', {
			team: {
				id: 'xpert-1',
				copilotModel: deepSeekModel,
				agent: {
					key: 'RESEARCH-MANAGER',
					name: 'Research Manager',
					copilotModel: qvqModel
				}
			},
			nodes: [
				{
					key: 'RESEARCH-MANAGER',
					type: 'agent' as const,
					position: { x: 0, y: 0 },
					entity: {
						key: 'RESEARCH-MANAGER',
						name: 'Research Manager'
					}
				}
			],
			connections: []
		})

		expect(draft.team.agent?.copilotModel).toBeUndefined()
		expect(draft.team.copilotModel).toEqual(deepSeekModel)
	})
})
