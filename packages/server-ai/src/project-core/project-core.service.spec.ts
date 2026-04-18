import { BadRequestException } from '@nestjs/common'
import { ProjectCoreStatusEnum } from '@xpert-ai/contracts'
import { Repository } from 'typeorm'
import { ProjectCore } from './project-core.entity'
import { ProjectCoreService } from './project-core.service'

describe('ProjectCoreService', () => {
	let service: ProjectCoreService
	let repository: {
		create: jest.Mock
		save: jest.Mock
	}

	beforeEach(() => {
		repository = {
			create: jest.fn((value) => value),
			save: jest.fn(async (value) => ({ id: 'project-1', ...value }))
		}

		service = new ProjectCoreService(repository as unknown as Repository<ProjectCore>)
	})

	it('creates a project with normalized values and active status by default', async () => {
		const result = await service.create({
			name: '  Agentic Project  ',
			goal: '  Build a new workflow  ',
			description: '  Shared execution space  '
		})

		expect(result).toEqual(
			expect.objectContaining({
				id: 'project-1',
				name: 'Agentic Project',
				goal: 'Build a new workflow',
				description: 'Shared execution space',
				status: ProjectCoreStatusEnum.Active
			})
		)
		expect(repository.create).toHaveBeenCalledWith(
			expect.objectContaining({
				name: 'Agentic Project',
				goal: 'Build a new workflow',
				description: 'Shared execution space',
				status: ProjectCoreStatusEnum.Active
			})
		)
	})

	it('omits blank descriptions during creation', async () => {
		await service.create({
			name: 'Agentic Project',
			goal: 'Build a new workflow',
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
				goal: 'Build a new workflow'
			})
		).rejects.toBeInstanceOf(BadRequestException)
	})

	it('rejects missing or blank goals', async () => {
		await expect(
			service.create({
				name: 'Agentic Project',
				goal: '   '
			})
		).rejects.toBeInstanceOf(BadRequestException)
	})

	it('rejects archived status on create', async () => {
		await expect(
			service.create({
				name: 'Agentic Project',
				goal: 'Build a new workflow',
				status: ProjectCoreStatusEnum.Archived
			})
		).rejects.toBeInstanceOf(BadRequestException)
	})
})
