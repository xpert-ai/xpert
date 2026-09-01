import type { SelectQueryBuilder } from 'typeorm'
import { applyWhereToQueryBuilder, transformWhere } from './transform-where'

describe('transformWhere', () => {
	it('turns explicit null filters into SQL IS NULL predicates', () => {
		const where = transformWhere({ projectId: null })
		const projectId = where?.projectId

		expect(Reflect.get(projectId, '_type')).toBe('isNull')
	})

	it('uses IS NULL when applying an explicit null filter to a query builder', () => {
		const queryBuilder = {
			andWhere: jest.fn().mockReturnThis()
		}

		applyWhereToQueryBuilder(
			queryBuilder as unknown as SelectQueryBuilder<{ projectId: string | null }>,
			'conversation',
			{ projectId: null }
		)

		expect(queryBuilder.andWhere).toHaveBeenCalledWith('conversation.projectId IS NULL')
	})
})
