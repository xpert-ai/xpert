jest.mock('./skill-repository-index.service', () => ({
	SkillRepositoryIndexService: class SkillRepositoryIndexService {}
}))

jest.mock('@xpert-ai/server-core', () => ({
	CrudController: class CrudController {
		constructor() {}
	},
	ParseJsonPipe: class ParseJsonPipe {},
	TransformInterceptor: class TransformInterceptor {},
	UUIDValidationPipe: class UUIDValidationPipe {}
}))

import { SkillRepositoryIndexController } from './skill-repository-index.controller'

describe('SkillRepositoryIndexController', () => {
	let controller: SkillRepositoryIndexController
	let service: {
		findMarketplace: jest.Mock
		sync: jest.Mock
	}

	beforeEach(() => {
		service = {
			findMarketplace: jest.fn(),
			sync: jest.fn()
		}

		controller = new SkillRepositoryIndexController(service as never)
	})

	it('normalizes $take and $skip string params before forwarding to the service', async () => {
		service.findMarketplace.mockResolvedValue({
			items: [createSkillIndex()],
			total: 1
		})

		const filter = {
			where: { repositoryId: 'repo-1' },
			order: { updatedAt: 'DESC' as const },
			take: 20,
			skip: 0,
			withDeleted: false
		}

		await invokeFindAll(controller, filter, '20', '0', 'claude')

		expect(service.findMarketplace).toHaveBeenCalledWith(
			expect.objectContaining({
				where: { repositoryId: 'repo-1' },
				order: { updatedAt: 'DESC' },
				take: 20,
				skip: 0
			}),
			'claude'
		)
	})

	it('falls back to numeric values from data when $take or $skip are invalid strings', async () => {
		service.findMarketplace.mockResolvedValue({
			items: [createSkillIndex()],
			total: 1
		})

		const filter = {
			where: { repositoryId: 'repo-1' },
			take: 20,
			skip: 40,
			order: {},
			withDeleted: false
		}

		await invokeFindAll(controller, filter, 'abc', '', undefined)

		expect(service.findMarketplace).toHaveBeenCalledWith(
			expect.objectContaining({
				where: { repositoryId: 'repo-1' },
				take: 20,
				skip: 40
			}),
			undefined
		)
	})
})

function createSkillIndex() {
	return {
		id: 'index-1',
		repositoryId: 'repo-1',
		organizationId: 'org-1',
		tenantId: 'tenant-1',
		skillPath: 'skills/example',
		skillId: 'skills/example',
		name: 'Example skill',
		createdAt: new Date('2026-04-08T00:00:00.000Z'),
		updatedAt: new Date('2026-04-08T00:00:00.000Z')
	}
}

function invokeFindAll(
	controller: SkillRepositoryIndexController,
	filter: Parameters<SkillRepositoryIndexController['findAll']>[0],
	take: string,
	skip: string,
	search?: string
) {
	return Reflect.apply(controller.findAll, controller, [filter, undefined, undefined, undefined, take, skip, undefined, search])
}
