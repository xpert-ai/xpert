import { CreationTable, DORIS_TYPE, File } from '@metad/adapter'
import {
	IIndicator,
	IOrganization,
	IProject,
	ISemanticModel,
	IStory,
	IStoryPoint,
	IStoryWidget,
	ITenant,
	IndicatorOptionFields,
	IndicatorStatusEnum,
	ProjectStatusEnum,
	StoryStatusEnum,
	Visibility
} from '@metad/contracts'
import { ConfigService } from '@metad/server-config'
import {
	Organization,
	REDIS_CLIENT,
	RequestContext,
	SeedDataService as SeedServerDataService,
	Tenant,
	User
} from '@metad/server-core'
import { readYamlFile } from '@metad/server-common'
import { Inject, Injectable } from '@nestjs/common'
import { ConfigService as NestConfigService } from '@nestjs/config'
import chalk from 'chalk';
import * as fs from 'fs'
import { assign, omit, pick } from 'lodash'
import * as path from 'path'
import { RedisClientType } from 'redis'
import { Connection, Like } from 'typeorm'
import { seedDefaultDataSourceTypes } from '../../data-source-type/index'
import { dataLoad, prepareDataSource } from '../../data-source/utils'
import { updateXmlaCatalogContent } from '../../model/helper'
import {
	DataSource,
	DataSourceType,
	Indicator,
	Project,
	SemanticModel,
	Story,
	StoryPoint,
	StoryWidget
} from '../entities/internal'


@Injectable()
export class SeedDataService extends SeedServerDataService {
	project: IProject
	constructor(
		private readonly nestConfigService: NestConfigService,
		protected readonly configService: ConfigService,
		@Inject(REDIS_CLIENT)
		private readonly redisClient: RedisClientType
	) {
		super(configService)
	}

	public async seedTenantMoreDefault(connection: Connection, tenant: ITenant) {
		await this.tryExecute('Default DataSource Types', seedDefaultDataSourceTypes(connection, tenant))
	}

	public async runDemoSeed(name: string, organization: string) {
		await this.cleanUpPreviousRuns()
		// Connect to database
		await this.createConnection()

		// Find tenant and organization
		this.tenant = await this.connection.manager.findOneOrFail(Tenant, {
			where: {
				name
			}
		})
		this.defaultOrganization = await this.connection.manager.findOneOrFail(Organization, {
			where: {
				tenantId: this.tenant.id,
				name: organization
			}
		})
		this.adminUser = await this.connection.manager.findOne(User, {
			relations: ['role'],
			// join: { alias: 'role', innerJoin: { users: 'roles.users' } },
			where: {
				tenantId: this.tenant.id,
				role: {
					name: 'ADMIN'
				}
			}
		})
		await this.cleanDemos()

		await this.seedOrganizationDemo(this.connection, this.tenant, this.defaultOrganization)
		// Disconnect to database and redis
		await this.closeConnection()
	}

	async closeConnection() {
		await super.closeConnection()
		try {
			if (this.redisClient) {
				await this.redisClient?.disconnect()
				this.log(chalk.green(`✅ DISCONNECTED TO REDIS!`))
			}
		} catch (error) {
			this.log('NOTE: CANT CLOSE REDIS CONNECTION!');
		}
	}

	async cleanDemos() {
		this.connection.manager.delete(Story, {
			tenantId: this.tenant.id,
			organizationId: this.defaultOrganization.id,
			name: Like('Demo - %')
		})

		this.connection.manager.delete(Indicator, {
			tenantId: this.tenant.id,
			organizationId: this.defaultOrganization.id,
			name: Like('Demo - %')
		})

		this.connection.manager.delete(Project, {
			tenantId: this.tenant.id,
			organizationId: this.defaultOrganization.id,
			name: Like('Demo - %')
		})

		this.connection.manager.delete(SemanticModel, {
			tenantId: this.tenant.id,
			organizationId: this.defaultOrganization.id,
			name: Like('Demo - %')
		})

		this.connection.manager.delete(DataSource, {
			tenantId: this.tenant.id,
			organizationId: this.defaultOrganization.id,
			name: Like('Demo - %')
		})
	}

	public async seedOrganizationDemo(connection: Connection, tenant: ITenant, organization: IOrganization) {
		const userId = RequestContext.currentUserId()
		// Seed Doris demo data
		if (this.nestConfigService.get('INSTALLATION_MODE') === 'with-doris') {
			const dataSource = await this.createDorisDataSource(tenant.id, userId, organization.id)
			// await this.dataLoadDoris(dataSource.id)
		}
	}

	async createDorisDataSource(tenantId: string, userId: string, organizationId: string): Promise<DataSource> {
		// 数据源
		let dataSource = new DataSource()
		dataSource.name = 'Demo - Doris'
		dataSource.tenantId = tenantId
		dataSource.createdById = userId
		dataSource.organizationId = organizationId
		dataSource.type = await this.connection.manager.findOne(DataSourceType, {
			where: {
				type: DORIS_TYPE
			}
		})

		const dorisHost = this.nestConfigService.get('DORIS_HOST', 'doris')
		const dorisPort = this.nestConfigService.get('DORIS_PORT', '9030')
		const dorisUsername = this.nestConfigService.get('DORIS_USER', 'root')
		const dorisPassword = this.nestConfigService.get('DORIS_PASS', '')
		const dorisDatabase = this.nestConfigService.get('DORIS_DATABASE', 'demo')
		const dorisApiHost = this.nestConfigService.get('DORIS_API_HOST', '')
		const dorisApiPort = this.nestConfigService.get('DORIS_API_PORT', '8030')
		dataSource.options = {
			host: dorisHost,
			port: dorisPort,
			database: dorisDatabase,
			username: dorisUsername,
			password: dorisPassword,
			apiHost: dorisApiHost,
			apiPort: dorisApiPort,
		}

		dataSource = await this.connection.manager.save(dataSource)

		return dataSource
	}

	async dataLoadDoris(id: string) {
		let dataSource = await this.connection.manager.findOne(DataSource, {
			where: {id},
			relations: ['type', 'authentications']
		})
		dataSource = await prepareDataSource(dataSource)

		const demosFolder = path.join(this.configService.assetOptions.assetPath, 'demos')
		const files = fs.readdirSync(demosFolder).filter((file) => {
			return path.extname(file).toLowerCase() === '.yml'
		})

		for await (const file of files) {
			const sheets = await readYamlFile<
				Array<{
					name: string
					dataset: CreationTable & { fileUrl: string }
					semanticModel: ISemanticModel
					project: IProject
					story: IStory[]
					indicator: IIndicator[]
				}>
			>(path.join(demosFolder, file))
			for await (const { name, dataset, semanticModel, project, story, indicator } of sheets) {
				await this.tryExecute(
					`Initialize Demo Data '${name}'`,
					dataLoad(dataSource, [dataset], {
						stream: fs.createReadStream(path.join(demosFolder, dataset.fileUrl)),
						fieldname: '',
						originalname: '',
						encoding: '',
						mimetype: 'text/csv'
					} as unknown as File)
				)

				let modelId = null
				if (semanticModel) {
					const model = await this.tryExecute(
						`Initialize Demo Semantic Model '${semanticModel.name}'`,
						this.createSemanticModel(id, semanticModel)
					)
					if (model) {
						modelId = model.id
					}
				}

				if (project) {
					const _project = await this.tryExecute(
						`Initialize Demo Project '${project.name}'`,
						this.createProject(modelId, project)
					)
					if (_project) {
						this.project = _project
					}
				}

				if (indicator) {
					await this.tryExecute(`Initialize Demo Indicators`, this.createIndicators(modelId, indicator))
				}

				if (story) {
					for await (const _story of story) {
						await this.tryExecute(
							`Initialize Demo Story '${_story.name}'`,
							this.createStory(modelId, _story)
						)
					}
				}
			}
		}
	}

	async createSemanticModel(dataSourceId: string, semanticModel: ISemanticModel) {
		let model = new SemanticModel()
		assign(model, semanticModel)
		model.tenantId = this.tenant.id
		model.organizationId = this.defaultOrganization.id
		model.createdById = this.adminUser.id
		model.ownerId = this.adminUser.id
		model.dataSourceId = dataSourceId
		model = await this.connection.manager.save<SemanticModel>(model)

		model = await this.connection.manager.findOne(SemanticModel, {
			where: { id: model.id },
			relations: ['dataSource', 'dataSource.type', 'roles']
		})

		await updateXmlaCatalogContent(this.redisClient, model)

		return model
	}

	async createProject(modelId: string, project: IProject) {
		const _project = new Project()
		assign(_project, pick(project, ['name', 'description', 'options']))

		_project.tenantId = this.tenant.id
		_project.organizationId = this.defaultOrganization.id
		_project.createdById = this.adminUser.id
		_project.ownerId = this.adminUser.id
		_project.status = ProjectStatusEnum.Progressing
		_project.models = [{
			id: modelId
		}]

		return await this.connection.manager.save<Project>(_project)
	}

	async createIndicators(modelId: string, indicators: any[]) {
		for await (const indicator of indicators) {
			const _indicator = new Indicator()
			assign(_indicator, omit(indicator, IndicatorOptionFields))

			_indicator.options = pick(indicator, IndicatorOptionFields)
			_indicator.tenantId = this.tenant.id
			_indicator.organizationId = this.defaultOrganization.id
			_indicator.createdById = this.adminUser.id
			_indicator.modelId = modelId
			_indicator.status = IndicatorStatusEnum.RELEASED
			_indicator.visibility = Visibility.Public
			_indicator.projectId = this.project?.id

			await this.connection.manager.save<Indicator>(_indicator)
		}
	}

	async createStory(semanticModelId: string, story: IStory) {
		let _story = new Story()
		assign(_story, pick(story, ['name', 'description', 'thumbnail', 'options']))

		_story.tenantId = this.tenant.id
		_story.organizationId = this.defaultOrganization.id
		_story.createdById = this.adminUser.id
		_story.modelId = semanticModelId
		_story.status = StoryStatusEnum.RELEASED
		_story.visibility = Visibility.Public
		_story.projectId = this.project?.id

		_story = await this.connection.manager.save<Story>(_story)

		if (story.points) {
			for await (const point of story.points) {
				await this.createPoint(_story.id, point)
			}
		}
	}

	async createPoint(storyId: string, point: IStoryPoint) {
		let _storyPoint = new StoryPoint()
		assign(_storyPoint, pick(point, ['key', 'name', 'options']))

		_storyPoint.tenantId = this.tenant.id
		_storyPoint.organizationId = this.defaultOrganization.id
		_storyPoint.createdById = this.adminUser.id
		_storyPoint.storyId = storyId

		_storyPoint = await this.connection.manager.save<StoryPoint>(_storyPoint)

		if (point.widgets) {
			for await (const widget of point.widgets) {
				await this.createWidget(storyId, _storyPoint.id, widget)
			}
		}
	}

	async createWidget(storyId: string, storyPointId: string, widget: IStoryWidget) {
		const _storyWidget = new StoryWidget()
		assign(_storyWidget, pick(widget, ['key', 'name', 'options']))

		_storyWidget.tenantId = this.tenant.id
		_storyWidget.organizationId = this.defaultOrganization.id
		_storyWidget.createdById = this.adminUser.id
		_storyWidget.storyId = storyId
		_storyWidget.pointId = storyPointId

		widget = await this.connection.manager.save<StoryWidget>(_storyWidget)
	}
}
