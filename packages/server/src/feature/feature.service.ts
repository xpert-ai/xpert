import { AiFeatureEnum, FeatureEnum, IFeature, IPagination } from '@xpert-ai/contracts'
import { Injectable, OnApplicationBootstrap } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import chalk from 'chalk'
import { In, IsNull, Repository } from 'typeorm'
import { CrudService } from '../core/crud/crud.service'
import { DEFAULT_FEATURES } from './default-features'
import { Feature } from './feature.entity'
import { FeatureOrganization } from './feature-organization.entity'
import { createFeature } from './feature.seed'

function isFeatureId(id: IFeature['id']): id is string {
	return typeof id === 'string' && id.length > 0
}

function featureMatchesParent(feature: IFeature, parentId: string | null) {
	return (feature.parentId ?? null) === parentId
}

function selectFeatureDefinition(features: IFeature[], parentId: string | null, name: string) {
	return (
		features.find((feature) => featureMatchesParent(feature, parentId) && feature.name === name) ??
		features.find((feature) => featureMatchesParent(feature, parentId)) ??
		features[0]
	)
}

/**
 * Compatibility tombstones for features that may still exist in upgraded databases.
 *
 * Keep these codes after removing their public definitions so reads stay clean even
 * before the feature seed has had a chance to purge the historical rows.
 */
export const RETIRED_FEATURE_CODES = new Set<string>([
	FeatureEnum.FEATURE_HOME,
	FeatureEnum.FEATURE_DASHBOARD,
	'FEATURE_HOME_CATALOG',
	'FEATURE_HOME_TREND',
	FeatureEnum.FEATURE_SETTING,
	FeatureEnum.FEATURE_FILE_STORAGE,
	AiFeatureEnum.FEATURE_COPILOT_KNOWLEDGEBASE,
	AiFeatureEnum.FEATURE_COPILOT_CHAT,
	'FEATURE_COPILOT_CHATBI',
	'FEATURE_XPERT_CHATBI',
	'FEATURE_INDICATOR',
	'FEATURE_INDICATOR_MARKET',
	'FEATURE_INDICATOR_REGISTER',
	'FEATURE_INDICATOR_APP',
	'FEATURE_BUSINESS_AREA',
	'FEATURE_STORY',
	'FEATURE_STORY_CREATION',
	'FEATURE_STORY_VIEWER',
	'FEATURE_STORY_MARKET',
	'FEATURE_MODEL',
	'FEATURE_MODEL_CREATION',
	'FEATURE_MODEL_VIEWER',
	'FEATURE_SUBSCRIPTION',
	'FEATURE_PROJECT',
	'FEATURE_DATA_FACTORY'
])

const filterRetiredFeatures = (features: IFeature[]): IFeature[] =>
	features.reduce<IFeature[]>((visibleFeatures, feature) => {
		if (RETIRED_FEATURE_CODES.has(feature.code)) {
			return visibleFeatures
		}

		if (feature.children) {
			visibleFeatures.push({
				...feature,
				children: filterRetiredFeatures(feature.children)
			})
			return visibleFeatures
		}

		visibleFeatures.push(feature)
		return visibleFeatures
	}, [])

@Injectable()
export class FeatureService extends CrudService<Feature> implements OnApplicationBootstrap {
	constructor(
		@InjectRepository(Feature)
		public readonly featureRepository: Repository<Feature>
	) {
		super(featureRepository)
	}

	async onApplicationBootstrap() {
		await this.purgeRetiredFeatures()
	}

	/**
	 * Retrieves top-level features (those with no parent) from the database. Allows specifying related entities
	 * to be included in the result. Features are ordered by their creation time in ascending order.
	 *
	 * @param relations An array of strings indicating which related entities to include in the result.
	 * @returns A promise resolving to a paginated response containing top-level IFeature objects.
	 */
	async getParentFeatures(relations: string[] = []): Promise<IPagination<IFeature>> {
		const result = await super.findAll({
			where: {
				parentId: IsNull()
			},
			relations,
			order: {
				createdAt: 'ASC'
			}
		})
		const items = filterRetiredFeatures(result.items)

		return {
			...result,
			items,
			total: items.length
		}
	}

	async seedDB() {
		console.log(chalk.magenta(`Seed Features into DB`))
		try {
			await this.purgeRetiredFeatures()

			for await (const item of DEFAULT_FEATURES) {
				const parent = await this.syncFeatureDefinition(item)
				const { children = [] } = item
				if (children.length > 0) {
					const featureChildren: IFeature[] = []
					children.forEach((child: IFeature) => {
						const childFeature: IFeature = createFeature(child)
						featureChildren.push(childFeature)
					})

					for await (const child of featureChildren) {
						await this.syncFeatureDefinition(child, parent)
					}
				}
			}
		} catch (err) {
			console.error(err)
		}
	}

	private async purgeRetiredFeatures(): Promise<void> {
		const retiredFeatures = await this.repository.find({
			select: ['id'],
			where: {
				code: In([...RETIRED_FEATURE_CODES])
			}
		})
		const retiredFeatureIds = retiredFeatures.map(({ id }) => id).filter(isFeatureId)
		if (retiredFeatureIds.length === 0) {
			return
		}

		await this.repository.manager.transaction(async (manager) => {
			await manager.delete(FeatureOrganization, {
				featureId: In(retiredFeatureIds)
			})
			await manager.delete(Feature, {
				id: In(retiredFeatureIds)
			})
		})
	}

	private async syncFeatureDefinition(item: IFeature, parent?: IFeature): Promise<IFeature> {
		const parentId = parent?.id ?? null
		const existingFeatures = await this.repository.find({
			where: {
				code: item.code
			},
			order: {
				createdAt: 'ASC'
			}
		})
		const selectedFeature = selectFeatureDefinition(existingFeatures, parentId, item.name)
		const feature = new Feature(selectedFeature)
		feature.name = item.name
		feature.code = item.code
		feature.description = item.description
		feature.link = item.link
		feature.status = item.status
		feature.icon = item.icon
		if (parent) {
			feature.parent = parent
			feature.parentId = parent.id
		} else {
			feature.parentId = null
		}

		const savedFeature = await this.repository.save(feature)
		const staleFeatureIds = existingFeatures
			.filter((existingFeature) => isFeatureId(existingFeature.id) && existingFeature.id !== savedFeature.id)
			.map((existingFeature) => existingFeature.id)
			.filter(isFeatureId)
		if (staleFeatureIds.length > 0) {
			await this.repository.delete(staleFeatureIds)
		}

		return savedFeature
	}
}
