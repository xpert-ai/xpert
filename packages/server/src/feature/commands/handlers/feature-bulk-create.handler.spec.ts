import type { Repository } from 'typeorm'
import type { FeatureOrganization } from '../../feature-organization.entity'
import type { Feature } from '../../feature.entity'
import { FeatureBulkCreateCommand } from '../feature-bulk-create.command'
import { FeatureBulkCreateHandler } from './feature-bulk-create.handler'

jest.mock('../../default-features', () => ({
	DEFAULT_FEATURES: [
		{
			name: 'Parent Feature',
			code: 'FEATURE_PARENT',
			isEnabled: true,
			children: [
				{
					name: 'Child Feature',
					code: 'FEATURE_CHILD',
					isEnabled: true
				}
			]
		},
		{
			name: 'Xpert',
			code: 'GROUP_XPERT',
			isEnabled: false,
			children: [
				{
					name: 'Digital Expert',
					code: 'FEATURE_XPERT',
					isEnabled: true
				}
			]
		}
	]
}))

jest.mock('../../feature.seed', () => ({
	createFeature: jest.fn((item: object) => ({ ...item }))
}))

jest.mock('../../feature-organization.entity', () => ({
	FeatureOrganization: class FeatureOrganization {}
}))

jest.mock('../../feature.entity', () => ({
	Feature: class Feature {}
}))

const createDeferred = <T>() => {
	let resolve: (value: T) => void
	const promise = new Promise<T>((innerResolve) => {
		resolve = innerResolve
	})

	return {
		promise,
		resolve: (value: T) => resolve(value)
	}
}

describe('FeatureBulkCreateHandler', () => {
		it('waits for default feature creation before resolving', async () => {
			const firstLookup = createDeferred<Feature | null>()
			let lookupCount = 0
			const featureRepository = {
				find: jest.fn(() => {
					lookupCount += 1
					return lookupCount === 1 ? firstLookup.promise.then((feature) => feature ? [feature] : []) : Promise.resolve([])
				}),
				save: jest.fn(async <T>(entity: T) => entity),
				delete: jest.fn()
			}
		const featureOrganizationRepository = {}
		const handler = new FeatureBulkCreateHandler(
			featureOrganizationRepository as unknown as Repository<FeatureOrganization>,
			featureRepository as unknown as Repository<Feature>
		)

		const execution = handler.execute(new FeatureBulkCreateCommand())
		let resolved = false
		void execution.then(() => {
			resolved = true
		})

		await Promise.resolve()

		expect(resolved).toBe(false)

		firstLookup.resolve(null)
		await execution

		expect(featureRepository.save).toHaveBeenCalledWith(
			expect.objectContaining({
				code: 'FEATURE_PARENT'
			})
		)
			expect(featureRepository.save).toHaveBeenCalledWith(
				expect.objectContaining({
					code: 'FEATURE_CHILD',
					parent: expect.objectContaining({
						code: 'FEATURE_PARENT'
					})
				})
			)
		})

	it('rejects when saving a default feature fails', async () => {
			const saveError = new Error('feature save failed')
			const featureRepository = {
				find: jest.fn().mockResolvedValue([]),
				save: jest.fn().mockRejectedValue(saveError),
				delete: jest.fn()
			}
		const featureOrganizationRepository = {}
		const handler = new FeatureBulkCreateHandler(
			featureOrganizationRepository as unknown as Repository<FeatureOrganization>,
			featureRepository as unknown as Repository<Feature>
		)

		await expect(handler.execute(new FeatureBulkCreateCommand())).rejects.toBe(saveError)
		expect(featureRepository.save).toHaveBeenCalledWith(
			expect.objectContaining({
				code: 'FEATURE_PARENT'
			})
		)
	})

	it('reparents existing child features from default definitions', async () => {
		const parentFeature = {
			id: 'feature-parent',
			code: 'FEATURE_PARENT'
		}
		const childFeature = {
			id: 'feature-child',
			code: 'FEATURE_CHILD',
			parentId: null
			}
			const featureRepository = {
				find: jest.fn(async ({ where }: { where: { code: string } }) => {
					if (where.code === 'FEATURE_PARENT') {
						return [parentFeature]
					}
					if (where.code === 'FEATURE_CHILD') {
						return [childFeature]
					}
					return []
				}),
				save: jest.fn(async <T>(entity: T) => entity),
				delete: jest.fn()
			}
		const featureOrganizationRepository = {}
		const handler = new FeatureBulkCreateHandler(
			featureOrganizationRepository as unknown as Repository<FeatureOrganization>,
			featureRepository as unknown as Repository<Feature>
		)

		await handler.execute(new FeatureBulkCreateCommand())

			expect(featureRepository.save).toHaveBeenCalledWith(
				expect.objectContaining({
					id: childFeature.id,
					code: childFeature.code,
					parent: expect.objectContaining(parentFeature),
					parentId: parentFeature.id
				})
			)
		})

	it('removes legacy duplicate feature rows when syncing child feature definitions', async () => {
		const parentFeature = {
			id: 'feature-group-xpert',
			code: 'GROUP_XPERT'
		}
		const legacyTopLevelFeature = {
			id: 'feature-legacy-xpert',
			code: 'FEATURE_XPERT',
			parentId: null
		}
		const childFeature = {
			id: 'feature-digital-xpert',
			code: 'FEATURE_XPERT',
			parentId: parentFeature.id
			}
			const featureRepository = {
				find: jest.fn(async ({ where }: { where: { code: string } }) => {
					if (where.code === 'GROUP_XPERT') {
						return [parentFeature]
					}
					if (where.code === 'FEATURE_PARENT') {
						return [{ id: 'feature-parent', code: 'FEATURE_PARENT' }]
					}
					if (where.code === 'FEATURE_CHILD') {
						return [{ id: 'feature-child', code: 'FEATURE_CHILD', parentId: 'feature-parent' }]
					}
					if (where.code === 'FEATURE_XPERT') {
						return [legacyTopLevelFeature, childFeature]
					}
				return []
			}),
			save: jest.fn(async <T>(entity: T) => entity),
			delete: jest.fn()
		}
		const featureOrganizationRepository = {}
		const handler = new FeatureBulkCreateHandler(
			featureOrganizationRepository as unknown as Repository<FeatureOrganization>,
			featureRepository as unknown as Repository<Feature>
		)

		await handler.execute(new FeatureBulkCreateCommand())

			expect(featureRepository.save).toHaveBeenCalledWith(
				expect.objectContaining({
					id: childFeature.id,
					code: childFeature.code,
					parent: expect.objectContaining(parentFeature),
					parentId: parentFeature.id
				})
			)
		expect(featureRepository.delete).toHaveBeenCalledWith([legacyTopLevelFeature.id])
	})
})
