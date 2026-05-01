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
			findOne: jest.fn(() => {
				lookupCount += 1
				return lookupCount === 1 ? firstLookup.promise : Promise.resolve(null)
			}),
			save: jest.fn(async <T>(entity: T) => entity)
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
		expect(featureRepository.save).toHaveBeenCalledWith([
			expect.objectContaining({
				code: 'FEATURE_CHILD',
				parent: expect.objectContaining({
					code: 'FEATURE_PARENT'
				})
			})
		])
	})

	it('rejects when saving a default feature fails', async () => {
		const saveError = new Error('feature save failed')
		const featureRepository = {
			findOne: jest.fn().mockResolvedValue(null),
			save: jest.fn().mockRejectedValue(saveError)
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
})
