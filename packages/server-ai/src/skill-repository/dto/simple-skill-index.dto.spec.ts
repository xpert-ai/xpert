import { instanceToPlain } from 'class-transformer'
import { SimpleSkillIndexDto } from './simple-skill-index'

describe('SimpleSkillIndexDto', () => {
	it('exposes the skill version in serialized index responses', () => {
		const dto = new SimpleSkillIndexDto({
			id: 'index-1',
			repositoryId: 'repo-1',
			organizationId: 'org-1',
			tenantId: 'tenant-1',
			skillPath: 'clawhub/weather',
			skillId: 'weather',
			name: 'Weather',
			version: '1.2.3',
			createdAt: new Date('2026-04-04T00:00:00.000Z'),
			updatedAt: new Date('2026-04-04T01:00:00.000Z')
		})

		expect(instanceToPlain(dto)).toMatchObject({
			id: 'index-1',
			skillId: 'weather',
			version: '1.2.3'
		})
	})
})
