import { XpertTypeEnum } from '@xpert-ai/contracts'
jest.mock('../xpert/published-xpert-access.service', () => ({
	PublishedXpertAccessService: class PublishedXpertAccessService {}
}))
import { PublishedXpertAccessService } from '../xpert/published-xpert-access.service'
import { TeamDefinitionService } from './team-definition.service'

describe('TeamDefinitionService', () => {
	let service: TeamDefinitionService
	let publishedXpertAccessService: {
		findAccessiblePublishedXperts: jest.Mock
		getAccessiblePublishedXpert: jest.Mock
	}

	beforeEach(() => {
		publishedXpertAccessService = {
			findAccessiblePublishedXperts: jest.fn().mockResolvedValue([
				{
					id: 'team-1',
					name: 'Delivery Team',
					description: 'Ships product changes',
					avatar: null,
					tenantId: 'tenant-1',
					organizationId: 'org-1',
					createdAt: new Date('2026-04-20T00:00:00.000Z'),
					updatedAt: new Date('2026-04-21T00:00:00.000Z'),
					deletedAt: null,
					createdById: 'user-1',
					updatedById: 'user-1',
					type: XpertTypeEnum.Agent,
					latest: true,
					agents: [{ id: 'agent-1' }, { id: 'agent-2' }]
				}
			]),
			getAccessiblePublishedXpert: jest.fn().mockResolvedValue({
				id: 'team-1',
				name: 'Delivery Team',
				description: 'Ships product changes',
				avatar: null,
				tenantId: 'tenant-1',
				organizationId: 'org-1',
				createdAt: new Date('2026-04-20T00:00:00.000Z'),
				updatedAt: new Date('2026-04-21T00:00:00.000Z'),
				deletedAt: null,
				createdById: 'user-1',
				updatedById: 'user-1',
				type: XpertTypeEnum.Agent,
				latest: true,
				agents: [{ id: 'agent-1' }]
			})
		}

		service = new TeamDefinitionService(publishedXpertAccessService as unknown as PublishedXpertAccessService)
	})

	it('projects accessible published agent xperts into team definitions', async () => {
		const teams = await service.findAll()

		expect(teams).toEqual([
			expect.objectContaining({
				id: 'team-1',
				name: 'Delivery Team',
				source: 'xpert',
				memberCount: 3,
				leadAssistantId: 'team-1'
			})
		])
	})

	it('projects a single published xpert team definition', async () => {
		const team = await service.findOne('team-1')

		expect(team).toEqual(
			expect.objectContaining({
				id: 'team-1',
				memberCount: 2
			})
		)
	})
})
