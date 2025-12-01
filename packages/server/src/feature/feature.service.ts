import { IFeature, IPagination } from '@metad/contracts'
import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import chalk from 'chalk'
import { IsNull, Repository } from 'typeorm'
import { CrudService } from '../core/crud/crud.service'
import { DEFAULT_FEATURES } from './default-features'
import { Feature } from './feature.entity'
import { createFeature } from './feature.seed'

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
		return await super.findAll({
			where: {
				parentId: IsNull()
			},
			relations,
			order: {
				createdAt: 'ASC'
			}
		});
	}

	async seedDB() {
		console.log(chalk.magenta(`Seed Features into DB`))
		try {
			for await (const item of DEFAULT_FEATURES) {
				const feature: IFeature = createFeature(item)
				const _feature = await this.findOneOrFailByOptions({ where: { name: feature.name, code: feature.code } })
				let parent = null
				if (_feature.success) {
					parent = _feature.record
				} else {
					parent = await this.repository.save(feature)
				}
				const { children = [] } = item
				if (children.length > 0) {
					const featureChildren: IFeature[] = []
					children.forEach((child: IFeature) => {
						const childFeature: IFeature = createFeature(child)
						childFeature.parent = parent
						featureChildren.push(childFeature)
					})

					await this.repository.upsert(featureChildren, {
						conflictPaths: ['name', 'code'],
						skipUpdateIfNoValuesChanged: true
					})
				}
			}
		} catch (err) {
			console.error(err)
		}
	}
}
