import { BadRequestException } from '@nestjs/common'
import { ProjectCoreStatusEnum, XpertTypeEnum } from '@xpert-ai/contracts'
import { Repository } from 'typeorm'
jest.mock('../xpert/published-xpert-access.service', () => ({
	PublishedXpertAccessService: class PublishedXpertAccessService {}
}))
import { ProjectCore } from './project-core.entity'
import { ProjectCoreService } from './project-core.service'

describe('ProjectCoreService', () => {
	let service: ProjectCoreService
	let repository: {
		create: jest.Mock
		save: jest.Mock
		update: jest.Mock
	}
	let publishedXpertAccessService: {
		getAccessiblePublishedXpert: jest.Mock
	}

	beforeEach(() => {
		repository = {
			create: jest.fn((value) => value),
			save: jest.fn(async (value) => ({ id: 'project-1', ...value })),
			update: jest.fn(async () => ({ affected: 1 }))
		}
		publishedXpertAccessService = {
			getAccessiblePublishedXpert: jest.fn(async (id: string) => ({
				id,
				type: XpertTypeEnum.Agent,
				latest: true
			}))
		}

		service = new ProjectCoreService(
			repository as unknown as Repository<ProjectCore>,
			publishedXpertAccessService as never
		)
	})

	it('creates a project with normalized values and active status by default', async () => {
		const result = await service.create({
			name: '  Agentic Project  ',
			goal: '  Build a new workflow  ',
			description: '  Shared execution space  ',
			mainAssistantId: '  assistant-1  '
		})

		expect(result).toEqual(
			expect.objectContaining({
				id: 'project-1',
				name: 'Agentic Project',
				goal: 'Build a new workflow',
				description: 'Shared execution space',
				mainAssistantId: 'assistant-1',
				status: ProjectCoreStatusEnum.Active
			})
		)
		expect(repository.create).toHaveBeenCalledWith(
			expect.objectContaining({
				name: 'Agentic Project',
				goal: 'Build a new workflow',
				description: 'Shared execution space',
				mainAssistantId: 'assistant-1',
				status: ProjectCoreStatusEnum.Active
			})
		)
	})

	it('omits blank descriptions during creation', async () => {
		await service.create({
			name: 'Agentic Project',
			goal: 'Build a new workflow',
			mainAssistantId: 'assistant-1',
			description: '   '
		})

		expect(repository.create).toHaveBeenCalledWith(
			expect.not.objectContaining({
				description: expect.anything()
			})
		)
	})

	it('rejects missing or blank names', async () => {
		await expect(
			service.create({
				name: '   ',
				goal: 'Build a new workflow',
				mainAssistantId: 'assistant-1'
			})
		).rejects.toBeInstanceOf(BadRequestException)
	})

	it('rejects missing or blank goals', async () => {
		await expect(
			service.create({
				name: 'Agentic Project',
				goal: '   ',
				mainAssistantId: 'assistant-1'
			})
		).rejects.toBeInstanceOf(BadRequestException)
	})

	it('rejects missing or blank main assistant ids', async () => {
		await expect(
			service.create({
				name: 'Agentic Project',
				goal: 'Build a new workflow',
				mainAssistantId: '   '
			})
		).rejects.toBeInstanceOf(BadRequestException)
	})

	it('rejects archived status on create', async () => {
		await expect(
			service.create({
				name: 'Agentic Project',
				goal: 'Build a new workflow',
				mainAssistantId: 'assistant-1',
				status: ProjectCoreStatusEnum.Archived
			})
		).rejects.toBeInstanceOf(BadRequestException)
	})

	it('rejects non-agent or non-latest assistants', async () => {
		publishedXpertAccessService.getAccessiblePublishedXpert.mockResolvedValueOnce({
			id: 'assistant-2',
			type: XpertTypeEnum.Knowledge,
			latest: false
		})

		await expect(
			service.create({
				name: 'Agentic Project',
				goal: 'Build a new workflow',
				mainAssistantId: 'assistant-2'
			})
		).rejects.toBeInstanceOf(BadRequestException)
	})

	it('normalizes project updates and validates a replaced main assistant', async () => {
		jest.spyOn(service, 'findOne').mockResolvedValueOnce({
			id: 'project-1',
			name: 'Updated Project',
			goal: 'Updated goal',
			description: null,
			mainAssistantId: 'assistant-2',
			status: ProjectCoreStatusEnum.Active
		} as ProjectCore)

		const result = await service.update('project-1', {
			name: '  Updated Project  ',
			goal: '  Updated goal  ',
			description: '   ',
			mainAssistantId: '  assistant-2  '
		})

		expect(repository.update).toHaveBeenCalledWith(
			'project-1',
			expect.objectContaining({
				id: 'project-1',
				name: 'Updated Project',
				goal: 'Updated goal',
				description: null,
				mainAssistantId: 'assistant-2'
			})
		)
		expect(result).toEqual(
			expect.objectContaining({
				mainAssistantId: 'assistant-2'
			})
		)
	})

	it('rejects clearing mainAssistantId during update', async () => {
		await expect(
			service.update('project-1', {
				mainAssistantId: null
			})
		).rejects.toBeInstanceOf(BadRequestException)
	})
})
