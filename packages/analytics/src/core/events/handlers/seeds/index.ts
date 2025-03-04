import { Employee } from '@metad/server-core'
import { getConnectionOptions } from '@metad/server-config'
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
import { BUSINESS_AREAS, createBusinessArea } from './business-area'
import { createDemoBigViewStory } from './demo-bigview/story'
import { createDemoChartsStory } from './demo-charts'
import { createDemoFoodMartStory } from './demo-foodmart/story'
import { createDemoCalculationStory } from './demo-calculation/story'
import { createIndicators } from './indicator'
import { SEMANTIC_MODEL, SEMANTIC_MODEL_NAME, SEMANTIC_MODEL_ROLES } from './semantic-model'
import { BusinessAreaRole, IModelRole } from '@metad/contracts'
import { CommandBus, ICommand } from '@nestjs/cqrs'

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
	userId: string,
	organizationId: string,
	commandBus: CommandBus<ICommand>
) {
	// 数据源
	let dataSource = new DataSource()
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
	dataSource = await dsRepository.save(dataSource)

	// 业务域
	const areas = await Promise.all(
		BUSINESS_AREAS.map((item) =>
			createBusinessArea(
				businessAreaRepository,
				tenantId,
				organizationId,
				userId,
				item
			)
		)
	)

	for (const businessArea of areas) {
		await businessAreaUserRepository.save({
			tenantId,
			organizationId,
			createdById: userId,
			userId,
			businessArea,
			role: BusinessAreaRole.Modeler
		})
	}

	// 语义模型
	let semanticModel = new SemanticModel()
	semanticModel.tenantId = tenantId
	semanticModel.createdById = userId
	semanticModel.organizationId = organizationId
	semanticModel.businessAreaId = areas[0].id
	semanticModel.dataSourceId = dataSource.id

	semanticModel.name = SEMANTIC_MODEL_NAME
	semanticModel.type = 'XMLA'
	semanticModel.catalog = 'foodmart'
	// semanticModel.options = SEMANTIC_MODEL

	// Save Model
	semanticModel = await modelRepository.save(semanticModel)

	// Update Roles
	semanticModel.roles = SEMANTIC_MODEL_ROLES as IModelRole[]
	semanticModel = await commandBus.execute(new SemanticModelUpdateCommand(semanticModel))
	// Update Xmla Schema
	await modelService.updateCatalogContent(semanticModel.id)

	// 指标
	await createIndicators(
		indicatorRepository,
		businessAreaRepository,
		tenantId,
		organizationId,
		userId,
		semanticModel.id
	)

	// await createDemoFoodMartStory(
	// 	{ tenantId, userId, organizationId } as Employee,
	// 	semanticModel,
	// 	storyRepository,
	// 	storyPointRepository,
	// 	storyWidgetRepository,
	// 	indicatorRepository
	// )

	// await createDemoChartsStory(
	// 	{ tenantId, userId, organizationId } as Employee,
	// 	semanticModel,
	// 	storyRepository,
	// 	storyPointRepository,
	// 	storyWidgetRepository
	// )

	// await createDemoBigViewStory(
	// 	{ tenantId, userId, organizationId } as Employee,
	// 	semanticModel,
	// 	storyRepository,
	// 	storyPointRepository,
	// 	storyWidgetRepository
	// )

	await createDemoCalculationStory(
		{ tenantId, userId, organizationId } as Employee,
		semanticModel,
		storyRepository,
		storyPointRepository,
		storyWidgetRepository
	)
}
