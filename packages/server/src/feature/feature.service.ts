import { AiFeatureEnum, AnalyticsFeatures, FeatureEnum, IFeature, IPagination } from '@xpert-ai/contracts'
import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import chalk from 'chalk'
import { IsNull, Repository } from 'typeorm'
import { CrudService } from '../core/crud/crud.service'
import { DEFAULT_FEATURES } from './default-features'
import { Feature } from './feature.entity'
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

const RETIRED_FEATURE_CODES = new Set<string>([
	FeatureEnum.FEATURE_HOME,
	FeatureEnum.FEATURE_DASHBOARD,
	AnalyticsFeatures.FEATURE_HOME_CATALOG,
	AnalyticsFeatures.FEATURE_HOME_TREND,
	FeatureEnum.FEATURE_SETTING,
	FeatureEnum.FEATURE_FILE_STORAGE,
	AiFeatureEnum.FEATURE_COPILOT_KNOWLEDGEBASE,
	AiFeatureEnum.FEATURE_COPILOT_CHAT,
	AnalyticsFeatures.FEATURE_INDICATOR,
	AnalyticsFeatures.FEATURE_INDICATOR_MARKET,
	AnalyticsFeatures.FEATURE_INDICATOR_REGISTER,
	AnalyticsFeatures.FEATURE_INDICATOR_APP
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
export class FeatureService extends CrudService<Feature> {
	constructor(
		@InjectRepository(Feature)
		public readonly featureRepository: Repository<Feature>
	) {
		super(featureRepository)
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
		});
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
