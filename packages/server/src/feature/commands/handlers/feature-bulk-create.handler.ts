import { IFeature } from '@xpert-ai/contracts'
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { DEFAULT_FEATURES } from '../../default-features'
import { FeatureOrganization } from '../../feature-organization.entity'
import { Feature } from '../../feature.entity'
import { createFeature } from '../../feature.seed'
import { FeatureBulkCreateCommand } from '../feature-bulk-create.command'

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

@CommandHandler(FeatureBulkCreateCommand)
export class FeatureBulkCreateHandler implements ICommandHandler<FeatureBulkCreateCommand> {
	constructor(
		@InjectRepository(FeatureOrganization)
		public readonly featureOrganizationRepository: Repository<FeatureOrganization>,

		@InjectRepository(Feature)
		public readonly featureRepository: Repository<Feature>
	) {}

	public async execute(command: FeatureBulkCreateCommand): Promise<any> {
		const { tenants } = command

		// Create default features
		for (const item of DEFAULT_FEATURES) {
			const feature = await this.syncFeatureDefinition(item)

			const { children = [] } = item
			if (children.length > 0) {
				for (const child of children) {
					await this.syncFeatureDefinition(child, feature)
				}
			}
		}

		// // Create feature toggle for every new tenant
		// tenants.forEach((tenant: ITenant) => {
		// 	DEFAULT_FEATURES.forEach(async (item: IFeatureCreateInput) => {
		// 		const feature: IFeature = await this.featureRepository.findOne({
		// 			where: { code: item.code },
		// 			relations: ['featureOrganizations']
		// 		})

		// 		await this.featureOrganizationRepository.save(
		// 			new FeatureOrganization({
		// 				isEnabled: feature.isEnabled,
		// 				tenant,
		// 				featureId: feature.id
		// 			})
		// 		)

		// 		const { children = [] } = item
		// 		children?.forEach(async (child: IFeature) => {
		// 			const feature: IFeature = await this.featureRepository.findOne({
		// 				where: { code: child.code },
		// 				relations: ['featureOrganizations']
		// 			})
		// 			const childFeatureToggle: FeatureOrganization = new FeatureOrganization({
		// 				isEnabled: feature.isEnabled,
		// 				tenant,
		// 				featureId: feature.id
		// 			})

		// 			await this.featureOrganizationRepository.save(childFeatureToggle)
		// 		})
		// 	})
		// })

		return
	}

	private async syncFeatureDefinition(item: IFeature, parent?: IFeature): Promise<IFeature> {
		const parentId = parent?.id ?? null
		const existingFeatures = await this.featureRepository.find({
			where: {
				code: item.code
			},
			order: {
				createdAt: 'ASC'
			}
		})
		const selectedFeature = selectFeatureDefinition(existingFeatures, parentId, item.name)
		const feature = createFeature(item)
		const featureDefinition = {
			...(selectedFeature ?? {}),
			...feature,
			...(parent ? { parent, parentId: parent.id } : { parentId: null })
		}
		const savedFeature = await this.featureRepository.save(featureDefinition)
		const staleFeatureIds = existingFeatures
			.filter((existingFeature) => isFeatureId(existingFeature.id) && existingFeature.id !== savedFeature.id)
			.map((existingFeature) => existingFeature.id)
			.filter(isFeatureId)
		if (staleFeatureIds.length > 0) {
			await this.featureRepository.delete(staleFeatureIds)
		}

		return savedFeature
	}
}
