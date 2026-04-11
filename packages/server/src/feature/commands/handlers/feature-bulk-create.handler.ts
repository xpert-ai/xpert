import { IFeature, IFeatureCreateInput, ITenant } from '@xpert-ai/contracts'
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { DEFAULT_FEATURES } from '../../default-features'
import { FeatureOrganization } from '../../feature-organization.entity'
import { Feature } from '../../feature.entity'
import { createFeature } from '../../feature.seed'
import { FeatureBulkCreateCommand } from '../feature-bulk-create.command'

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
		DEFAULT_FEATURES.forEach(async (item: IFeatureCreateInput) => {
			let feature: IFeature = await this.featureRepository.findOne({
				where: { code: item.code },
			})
			// If feature not exist, create it
			if (!feature) {
				feature = createFeature(item)
				feature = await this.featureRepository.save(feature)
			}

			const { children = [] } = item
			if (children.length > 0) {
				const featureChildren: IFeature[] = []
				for await(const child of children) {
					const childFeature: IFeature = await this.featureRepository.findOne({
						where: { code: child.code },
					})

					// If child feature not exist, create it
					if (!childFeature) {
						const childFeature: IFeature = createFeature(child)
						childFeature.parent = feature
						featureChildren.push(childFeature)
					}
				}

				await this.featureRepository.save(featureChildren)
			}
		})

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
}
