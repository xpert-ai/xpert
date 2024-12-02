import { IFeature, IPagination } from '@metad/contracts'
import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import * as chalk from 'chalk'
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
		// Seed latest features into DB
		// this.seedDB()
	}

	async getParentFeatures(request: any): Promise<IPagination<IFeature>> {
		const { relations = [] } = request
		return await this.findAll({
			where: {
				parentId: IsNull()
			},
			relations,
			order: {
				createdAt: 'ASC'
			}
		})
	}

	async seedDB() {
		console.log(chalk.magenta(`Seed Features into DB`))
		try {
			for await (const item of DEFAULT_FEATURES) {
				const feature: IFeature = createFeature(item)
				const _feature = await this.findOneOrFail({ where: { name: feature.name, code: feature.code } })
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
