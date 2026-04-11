import { Employee } from '@xpert-ai/server-core'
import { getConnectionOptions } from '@xpert-ai/server-config'
import { Repository } from 'typeorm'
import { DataSourceTypeService } from '../../../../data-source-type'
import { SemanticModelService, SemanticModelUpdateCommand } from '../../../../model'
import {
	BusinessArea,
	BusinessAreaUser,
	DataSource,
	Indicator,
	SemanticModel,
	Story,
	StoryPoint,
	StoryWidget,
} from '../../../entities/internal'
import { BUSINESS_AREAS } from './business-area'
import { createDemoCalculationStory } from './demo-calculation/story'
import { createIndicators } from './indicator'
import { SEMANTIC_MODEL, SEMANTIC_MODEL_NAME, SEMANTIC_MODEL_ROLES } from './semantic-model'
import { BusinessAreaRole, IModelRole } from '@xpert-ai/contracts'
import { CommandBus, ICommand } from '@nestjs/cqrs'
import { STORY_NAME } from './demo-calculation/story'

export type AnalyticsBootstrapMode = 'semantic-only' | 'full-demo'

type SeedOrganizationAnalyticsDataOptions = {
	mode?: AnalyticsBootstrapMode
}

/**
 * @deprecated
 */
export async function seedOrganizationAnalyticsData(
	dstService: DataSourceTypeService,
	dsRepository: Repository<DataSource>,
	businessAreaRepository: Repository<BusinessArea>,
	businessAreaUserRepository: Repository<BusinessAreaUser>,
	modelRepository: Repository<SemanticModel>,
	modelService: SemanticModelService,
	storyRepository: Repository<Story>,
	storyPointRepository: Repository<StoryPoint>,
	storyWidgetRepository: Repository<StoryWidget>,
	indicatorRepository: Repository<Indicator>,
	tenantId: string,
	userId: string | null,
	organizationId: string | null,
	commandBus: CommandBus<ICommand>,
	options: SeedOrganizationAnalyticsDataOptions = {}
) {
	const mode = options.mode ?? 'semantic-only'

	const dataSource = await ensureDemoDataSource(dstService, dsRepository, tenantId, organizationId, userId)

	const areas = await Promise.all(
		BUSINESS_AREAS.map((item) =>
			ensureBusinessArea(businessAreaRepository, tenantId, organizationId, userId, item)
		)
	)

	if (userId) {
		for (const businessArea of areas) {
			const existing = await businessAreaUserRepository.findOne({
				where: {
					tenantId,
					organizationId,
					userId,
					businessAreaId: businessArea.id
				}
			})

			if (!existing) {
				await businessAreaUserRepository.save({
					tenantId,
					organizationId,
					createdById: userId,
					userId,
					businessArea,
					businessAreaId: businessArea.id,
					role: BusinessAreaRole.Modeler
				})
			}
		}
	}

	let semanticModel = await modelRepository.findOne({
		where: {
			tenantId,
			organizationId,
			name: SEMANTIC_MODEL_NAME
		}
	})

	if (!semanticModel) {
		semanticModel = new SemanticModel()
	}

	semanticModel.tenantId = tenantId
	semanticModel.createdById = userId
	semanticModel.ownerId = userId
	semanticModel.organizationId = organizationId
	semanticModel.businessAreaId = areas[0]?.id ?? null
	semanticModel.dataSourceId = dataSource.id
	semanticModel.name = SEMANTIC_MODEL_NAME
	semanticModel.type = 'XMLA'
	semanticModel.catalog = 'foodmart'
	semanticModel.options ??= SEMANTIC_MODEL as any

	semanticModel = await modelRepository.save(semanticModel)
	semanticModel.roles = SEMANTIC_MODEL_ROLES as IModelRole[]
	semanticModel = await commandBus.execute(new SemanticModelUpdateCommand(semanticModel))
	await modelService.updateCatalogContent(semanticModel.id)

	if (mode === 'full-demo' && userId) {
		const indicatorCount = await indicatorRepository.count({
			where: {
				tenantId,
				organizationId,
				modelId: semanticModel.id
			}
		})

		if (!indicatorCount) {
			await createIndicators(
				indicatorRepository,
				businessAreaRepository,
				tenantId,
				organizationId,
				userId,
				semanticModel.id
			)
		}

		const existingStory = await storyRepository.findOne({
			where: {
				tenantId,
				organizationId,
				name: STORY_NAME
			}
		})

		if (!existingStory) {
			await createDemoCalculationStory(
				{ tenantId, userId, organizationId } as Employee,
				semanticModel,
				storyRepository,
				storyPointRepository,
				storyWidgetRepository
			)
		}
	}

	return {
		dataSource,
		businessAreas: areas,
		semanticModel
	}
}

/**
 * @deprecated
 */
export async function seedTenantDefaultData(
	dstService: DataSourceTypeService,
	dsRepository: Repository<DataSource>,
	businessAreaRepository: Repository<BusinessArea>,
	businessAreaUserRepository: Repository<BusinessAreaUser>,
	modelRepository: Repository<SemanticModel>,
	modelService: SemanticModelService,
	storyRepository: Repository<Story>,
	storyPointRepository: Repository<StoryPoint>,
	storyWidgetRepository: Repository<StoryWidget>,
	indicatorRepository: Repository<Indicator>,
	tenantId: string,
	userId: string | null,
	organizationId: string | null,
	commandBus: CommandBus<ICommand>
) {
	return seedOrganizationAnalyticsData(
		dstService,
		dsRepository,
		businessAreaRepository,
		businessAreaUserRepository,
		modelRepository,
		modelService,
		storyRepository,
		storyPointRepository,
		storyWidgetRepository,
		indicatorRepository,
		tenantId,
		userId,
		organizationId,
		commandBus,
		{ mode: 'full-demo' }
	)
}

async function ensureDemoDataSource(
	dstService: DataSourceTypeService,
	dsRepository: Repository<DataSource>,
	tenantId: string,
	organizationId: string | null,
	userId: string | null
) {
	let dataSource = await dsRepository.findOne({
		where: {
			tenantId,
			organizationId,
			name: 'Demo - PG DB'
		},
		relations: ['type']
	})

	if (dataSource) {
		return dataSource
	}

	dataSource = new DataSource()
	dataSource.name = 'Demo - PG DB'
	dataSource.tenantId = tenantId
	dataSource.createdById = userId
	dataSource.organizationId = organizationId
	dataSource.type = await dstService.findOneByOptions({
		where: {
			type: 'pg'
		}
	})

	const connection = getConnectionOptions('postgres')
	dataSource.options = {
		host: connection.host,
		port: connection.port,
		database: 'demo',
		username: 'demo',
		password: 'GYIb9sx71LRdMVh&qc$!',
	}

	return dsRepository.save(dataSource)
}

async function ensureBusinessArea(
	repository: Repository<BusinessArea>,
	tenantId: string,
	organizationId: string | null,
	createdById: string | null,
	options: any,
	parent?: BusinessArea
) {
	let area = await repository.findOne({
		where: {
			tenantId,
			organizationId,
			name: options.name,
			parentId: parent?.id ?? null
		}
	})

	if (!area) {
		area = new BusinessArea()
		area.tenantId = tenantId
		area.organizationId = organizationId
		area.createdById = createdById
		area.name = options.name
		area.parent = parent
		area.parentId = parent?.id ?? null
		area = await repository.save(area)
	}

	if (options.children?.length) {
		area.children = await Promise.all(
			options.children.map((child) =>
				ensureBusinessArea(repository, tenantId, organizationId, createdById, child, area)
			)
		)
	}

	return area
}
