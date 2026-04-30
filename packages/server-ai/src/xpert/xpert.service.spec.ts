jest.mock('../xpert-workspace', () => ({
	MyXpertWorkspaceQuery: class MyXpertWorkspaceQuery {},
	XpertWorkspaceAccessService: class XpertWorkspaceAccessService {},
	XpertWorkspaceBaseService: class XpertWorkspaceBaseService {
		constructor(
			protected readonly repository: {
				create: (entity: unknown) => unknown
				findOne: (id: unknown) => unknown
				save: (entity: unknown) => unknown
			}
		) {}

		async create(entity: unknown) {
			return await this.repository.save(this.repository.create(entity))
		}

		async findOne(id: unknown) {
			return await this.repository.findOne(id)
		}

		async save(entity: unknown) {
			return await this.repository.save(entity)
		}
	}
}))

jest.mock('./types', () => ({
	EventNameXpertValidate: 'xpert.validate',
	XpertDraftValidateEvent: class XpertDraftValidateEvent {
		constructor(readonly draft: unknown) {}
	}
}))

import { RequestContext } from '@xpert-ai/server-core'
import { XpertPublishCommand } from './commands'
import { XpertService } from './xpert.service'
import type { Xpert } from './xpert.entity'

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
		const storeService = {
			findAll: jest.fn()
		}
		const workspaceAccessService = {}
		const userGroupService = {
			findAll: jest.fn(),
			findOne: jest.fn()
		}
		const commandBus = { execute: jest.fn().mockResolvedValue(undefined) }
		const queryBus = { execute: jest.fn() }
		const eventEmitter = { emitAsync: jest.fn().mockResolvedValue([]) }
		const triggerRegistry = { get: jest.fn(), list: jest.fn().mockReturnValue([]) }
		const sandboxService = { listProviders: jest.fn().mockReturnValue([]) }

		const service = new XpertService(
			repository as unknown as ConstructorParameters<typeof XpertService>[0],
			workspaceAccessService as unknown as ConstructorParameters<typeof XpertService>[1],
			storeService as unknown as ConstructorParameters<typeof XpertService>[2],
			userGroupService as unknown as ConstructorParameters<typeof XpertService>[3],
			commandBus as unknown as ConstructorParameters<typeof XpertService>[4],
			queryBus as unknown as ConstructorParameters<typeof XpertService>[5],
			eventEmitter as unknown as ConstructorParameters<typeof XpertService>[6],
			triggerRegistry as unknown as ConstructorParameters<typeof XpertService>[7],
			sandboxService as unknown as ConstructorParameters<typeof XpertService>[8],
			{ resolve: jest.fn() } as unknown as ConstructorParameters<typeof XpertService>[9]
		)

		return {
			service,
			commandBus,
			repository,
			eventEmitter,
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

	it('does not materialize graph fields when a draft patch only updates team', async () => {
		const { repository, service } = createService()
		const currentUserIdSpy = jest.spyOn(RequestContext, 'currentUserId').mockReturnValue('user-1')
		const xpert = {
			id: 'xpert-1',
			graph: {
				nodes: [
					{
						key: 'Agent_Primary',
						type: 'agent',
						entity: {
							key: 'Agent_Primary',
							name: 'Primary'
						},
						position: {
							x: 0,
							y: 0,
							width: 100,
							height: 100
						}
					}
				],
				connections: []
			}
		} as Xpert
		jest.spyOn(service, 'findOne').mockResolvedValue(xpert)
		repository.save.mockImplementation(async (entity) => entity)

		await service.updateDraft('xpert-1', {
			team: {
				name: 'Updated Basic Info'
			}
		})

		expect(repository.save).toHaveBeenCalledWith(
			expect.objectContaining({
				draft: expect.objectContaining({
					team: expect.objectContaining({
						name: 'Updated Basic Info',
						updatedById: 'user-1'
					})
				})
			})
		)
		expect(xpert.draft).not.toHaveProperty('nodes')
		expect(xpert.draft).not.toHaveProperty('connections')
		currentUserIdSpy.mockRestore()
	})
})
