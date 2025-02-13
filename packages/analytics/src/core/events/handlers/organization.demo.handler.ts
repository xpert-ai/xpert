import { CreationTable, DORIS_TYPE, STARROCKS_TYPE, createQueryRunnerByType } from '@metad/adapter'
import {
	IBusinessArea,
	IDataSource,
	IIndicator,
	IProject,
	ISemanticModel,
	IStory,
	IStoryPoint,
	IStoryWidget,
	ITenant,
	IUser,
	OrgGenerateDemoOptions,
	OrganizationDemoNetworkEnum,
	ProjectStatusEnum,
	StoryStatusEnum,
	Visibility
} from '@metad/contracts'
import { pick, readYamlFile } from '@metad/server-common'
import { ConfigService, getConnectionOptions } from '@metad/server-config'
import { Organization, OrganizationDemoCommand, REDIS_CLIENT, RequestContext } from '@metad/server-core'
import { Inject, Logger } from '@nestjs/common'
import { ConfigService as NestConfigService } from '@nestjs/config'
import { CommandBus, CommandHandler, ICommandHandler } from '@nestjs/cqrs'
import { InjectRepository } from '@nestjs/typeorm'
import * as fs from 'fs'
import * as path from 'path'
import * as decompress from 'decompress'
import * as _axios from 'axios'
import { assign, isString } from 'lodash'
import { RedisClientType } from 'redis'
import { Repository } from 'typeorm'
import { importSheetTables, prepareDataSource } from '../../../data-source/utils'
import { updateXmlaCatalogContent } from '../../../model/helper'
import {
	BusinessArea,
	DataSource,
	DataSourceType,
	Indicator,
	Project,
	SemanticModel,
	Story,
	StoryPoint,
	StoryWidget
} from '../../entities/internal'


export enum InstallationModeEnum {
	Standalone = 'standalone',
	WithDoris = 'with-doris',
	WithStarrocks = 'with-starrocks'
}

const OrganizationDemoNetworkAliyun = 'https://metad-oss.oss-cn-shanghai.aliyuncs.com/ocap/demos-v1.1.0.zip'
const OrganizationDemoNetworkGitHub = 'https://github.com/meta-d/samples/raw/main/ocap/demos-v1.1.0.zip'

const axios = _axios.default

@CommandHandler(OrganizationDemoCommand)
export class OrganizationDemoHandler implements ICommandHandler<OrganizationDemoCommand> {
	private readonly logger = new Logger(OrganizationDemoHandler.name)

	tenant: ITenant
	organization: Organization
	owner: IUser
	project: Project

	constructor(
		private readonly nestConfigService: NestConfigService,
		protected readonly configService: ConfigService,
		@InjectRepository(DataSource)
		private readonly dsRepository: Repository<DataSource>,
		@InjectRepository(SemanticModel)
		private readonly modelRepository: Repository<SemanticModel>,
		@InjectRepository(Story)
		private readonly storyRepository: Repository<Story>,
		@InjectRepository(StoryPoint)
		private readonly storyPointRepository: Repository<StoryPoint>,
		@InjectRepository(StoryWidget)
		private readonly storyWidgetRepository: Repository<StoryWidget>,
		@InjectRepository(BusinessArea)
		private readonly businessAreaRepository: Repository<BusinessArea>,
		@InjectRepository(Indicator)
		private readonly indicatorRepository: Repository<Indicator>,
		@InjectRepository(Organization)
		private readonly orgRepository: Repository<Organization>,
		@InjectRepository(DataSourceType)
		private readonly dstRepository: Repository<DataSourceType>,
		@InjectRepository(Project)
		private readonly projectRepository: Repository<Project>,
		private readonly commandBus: CommandBus,

		@Inject(REDIS_CLIENT)
		private readonly redisClient: RedisClientType
	) {}

	public async execute(command: OrganizationDemoCommand): Promise<void> {
		const { id, options } = command.input as { id: string; options: OrgGenerateDemoOptions}
		const userId = RequestContext.currentUserId()
		const organization = await this.orgRepository.findOne(id, { relations: ['tenant'] })
		this.organization = organization
		this.tenant = organization.tenant
		this.owner = RequestContext.currentUser()

		const isDemo = this.configService.get('demo') as boolean
		const withDoris = this.nestConfigService.get('INSTALLATION_MODE') === InstallationModeEnum.WithDoris
		const withStarrocks = this.nestConfigService.get('INSTALLATION_MODE') === InstallationModeEnum.WithStarrocks
		const standalone = !this.nestConfigService.get('INSTALLATION_MODE') || this.nestConfigService.get('INSTALLATION_MODE') === InstallationModeEnum.Standalone

		this.logger.log(`Generate demo data for tenant ${organization.tenantId}, organzation ${organization.id}, user ${userId}`)
		
		//extracted import data files directory path
		const samplesPath = await this.getUserSamplesPath(userId)
		const demosFolder = path.join(samplesPath, 'demos')
		const file = options?.source === OrganizationDemoNetworkEnum.aliyun ? OrganizationDemoNetworkAliyun
			: options?.source === OrganizationDemoNetworkEnum.github ? OrganizationDemoNetworkGitHub
			: options?.source
	    const files = await this.unzipAndRead(file, samplesPath)

		this.logger.debug(`Start to import files in demo file: ${files}`)

		for await (const file of files) {
			this.logger.debug(`	Start to import file: ${file}`)
			let sheets
			try {
				sheets = await readYamlFile<
					Array<{
						name: string
						installationMode: string
						dataSource: IDataSource
						dataset: CreationTable & { fileUrl: string }
						businessArea: BusinessArea
						semanticModel: ISemanticModel
						project: IProject
						story: IStory[]
						indicator: IIndicator[]
					}>
				>(path.join(demosFolder, file))
			} catch (err) {
				this.logger.error(err.message)
				continue;
			}
			for await (const {
				name,
				installationMode,
				dataSource,
				dataset,
				businessArea,
				semanticModel,
				project,
				indicator,
				story
			} of sheets) {
				this.logger.debug(`		Start to import record: ${name}`)

				if (withStarrocks && installationMode && installationMode !== 'with-starrocks') {
					continue;
				}

				if (withDoris && installationMode && installationMode !== 'with-doris') {
					continue;
				}

				if (standalone && installationMode && installationMode !== 'standalone') {
					continue;
				}

				let dataSourceId = null
				let dataSourceEntity = null
				if (dataSource) {
					let name = null
					if (isString(dataSource)) {
						name = dataSource
					} else {
						if (!Array.isArray(dataSource)) {
							throw new Error(`'dataSource' must be an onject array or string`)
						}
						for await (const item of dataSource) {
							if (withStarrocks && item.type === STARROCKS_TYPE) {
								dataSourceEntity = await this.createStarrocksDataSource(item)
							} else if (withDoris && item.type === DORIS_TYPE) {
								dataSourceEntity = await this.createDorisDataSource(item)
							} else {
								dataSourceEntity = await this.createDataSource(item, isDemo)
							}
						}
						dataSourceId = dataSourceEntity.id
						name = dataSourceEntity.name
					}

					dataSourceEntity = await prepareDataSource(await this.dsRepository.findOne({
						where: {
							tenantId: this.tenant.id,
							organizationId: this.organization.id,
							name
						},
						relations: ['type', 'authentications']
					}))
				}

				if (options.importData && !isDemo && dataset) {
					if (!Array.isArray(dataset)) {
						throw new Error(`'dataset' must be an array`)
					}

					if (!dataSourceEntity) {
						throw new Error(`'dataSource' must be defined for 'dataset'`)
					}

					// Create dataSource runner
					const isDev = process.env.NODE_ENV === 'development'
					const runner = createQueryRunnerByType(dataSourceEntity.type.type, {...dataSourceEntity.options, debug: isDev, trace: isDev})

					for await (const item of dataset) {
						this.logger.debug(`			Start to import dataset file: ${item.fileUrl}`)
						try {
							// Load data file into database table
							await importSheetTables(runner, [item], {
								stream: (withDoris || withStarrocks) ? fs.createReadStream(path.join(demosFolder, item.fileUrl)) : null,
								fieldname: '',
								originalname: '',
								path: path.join(demosFolder, item.fileUrl),
								encoding: '',
								mimetype: 'text/csv'
							} as any)
						} catch(err) {
							runner.teardown()
							throw new Error(`Can't import dataset file: ${item.fileUrl} with error: ${err.message}`)
						}
					}

					runner.teardown()
				}

				if (businessArea) {
					if (!Array.isArray(businessArea)) {
						throw new Error(`'businessArea' must be an array`)
					}
					for await (const item of businessArea) {
						await this.createBusinessArea(null, item)
					}
				}

				let modelId = null
				if (semanticModel) {
					if (!Array.isArray(semanticModel)) {
						throw new Error(`'semanticModel' must be an array`)
					}
					for await (const item of semanticModel) {
						const model = await this.createSemanticModel(dataSourceId, item)
						if (model) {
							modelId = model.id
						}
					}
				}

				this.project = null
				if (project) {
					const _project = await this.createProject(modelId, project)
					if (_project) {
						this.project = _project
					}
				}

				if (indicator) {
					if (!Array.isArray(indicator)) {
						throw new Error(`'indicator' must be an array`)
					}
					for await (const item of indicator) {
						await this.createIndicator(modelId, item)
					}
				}

				if (story) {
					if (!Array.isArray(story)) {
						throw new Error(`'story' must be an array`)
					}
					for await (const _story of story) {
						await this.createStory(modelId, _story)
					}
				}
			}
		}

		// Delete the samples folder
		// fs.rmSync(samplesPath, { recursive: true, force: true })
		
		this.logger.debug(`Generate demo data all done!`)

		return Promise.resolve()
	}

	async getUserSamplesPath(userId: string) {
		const cache = path.join(process.cwd(), '.cache')
		const samples = path.join(cache, 'samples')
		if (!fs.existsSync(cache)) {
			fs.mkdirSync(cache)
		}
		if (!fs.existsSync(samples)) {
			fs.mkdirSync(samples)
		}

		const userSamples = path.join(samples, userId)
		if (!fs.existsSync(userSamples)) {
			fs.mkdirSync(userSamples)
		}
		return userSamples
	}

	public async unzipAndRead(url: string, assetPath = '') {
		const demoFilePath = path.join(assetPath, 'demos.zip')
		
		await this.downloadDemoFile(url, demoFilePath)
		await decompress(demoFilePath, assetPath)

		const demosFolder = path.join(assetPath, 'demos')
		const files = fs.readdirSync(demosFolder).filter((file) => {
			return path.extname(file).toLowerCase() === '.yml'
		})
		return files
	}

	async downloadDemoFile(url: string, destination: string) {
		this.logger.debug(`Download demo file from ${url} to ${destination}`)

		const writer = fs.createWriteStream(destination)
		const response = await axios({
			url,
			method: 'GET',
			responseType: 'stream'
		  })
		
		response.data.pipe(writer)
	  
		return new Promise((resolve, reject) => {
		  writer.on('finish', resolve)
		  writer.on('error', reject)
		})
	  }

	async createDorisDataSource(_dataSource: IDataSource): Promise<DataSource> {
		// Remove existing data sources with the same name
		const dataSources = await this.dsRepository.find({
			where: {
				tenant: this.tenant,
				organization: this.organization,
				name: _dataSource.name
			}
		})
		for (const dataSource of dataSources) {
			await this.dsRepository.remove(dataSource)
		}

		// 数据源
		const dataSource = new DataSource()
		dataSource.name = _dataSource.name
		dataSource.tenantId = this.tenant.id
		dataSource.organizationId = this.organization.id
		dataSource.createdBy = this.owner
		dataSource.type = await this.dstRepository.findOne({
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
		dataSource.options = assign({
			host: dorisHost,
			port: dorisPort,
			// catalog 当前充当了 database 的角色， 后续要分开理清
			catalog: dorisDatabase,
			database: dorisDatabase,
			username: dorisUsername,
			password: dorisPassword,
			apiHost: dorisApiHost,
			apiPort: dorisApiPort,
		}, _dataSource.options)

		return await this.dsRepository.save(dataSource)
	}

	async createStarrocksDataSource(_dataSource: IDataSource): Promise<DataSource> {
		// Remove existing data sources with the same name
		const dataSources = await this.dsRepository.find({
			where: {
				tenant: this.tenant,
				organization: this.organization,
				name: _dataSource.name
			}
		})
		for (const dataSource of dataSources) {
			await this.dsRepository.remove(dataSource)
		}

		// 数据源
		const dataSource = new DataSource()
		dataSource.name = _dataSource.name
		dataSource.tenantId = this.tenant.id
		dataSource.organizationId = this.organization.id
		dataSource.createdBy = this.owner
		dataSource.type = await this.dstRepository.findOne({
			where: {
				type: STARROCKS_TYPE
			}
		})

		const starrocksVersion = this.nestConfigService.get('STARROCKS_VERSION', 0)
		const starrocksHost = this.nestConfigService.get('STARROCKS_HOST', 'doris')
		const starrocksPort = this.nestConfigService.get('STARROCKS_PORT', '9030')
		const starrocksUsername = this.nestConfigService.get('STARROCKS_USER', 'root')
		const starrocksPassword = this.nestConfigService.get('STARROCKS_PASS', '')
		const starrocksDatabase = this.nestConfigService.get('STARROCKS_DATABASE', 'demo')
		const starrocksApiHost = this.nestConfigService.get('STARROCKS_API_HOST', '')
		const starrocksApiPort = this.nestConfigService.get('STARROCKS_API_PORT', '8030')
		dataSource.options = assign({
			version: starrocksVersion,
			host: starrocksHost,
			port: starrocksPort,
			// catalog 当前充当了 database 的角色， 后续要分开理清
			catalog: starrocksDatabase,
			database: starrocksDatabase,
			username: starrocksUsername,
			password: starrocksPassword,
			apiHost: starrocksApiHost,
			apiPort: starrocksApiPort,
		}, _dataSource.options)

		return await this.dsRepository.save(dataSource)
	}

	async createDataSource(dataSource: IDataSource, isDemo: boolean) {
		// Remove existing data sources with the same name
		const dataSources = await this.dsRepository.find({
			where: {
				tenant: this.tenant,
				organization: this.organization,
				name: dataSource.name
			}
		})

		for (const dataSource of dataSources) {
			await this.dsRepository.remove(dataSource)
		}

		// Create new data source
		const type = await this.dstRepository.findOne({
			where: {
				tenant: this.tenant,
				type: dataSource.type
			}
		})

		if (!type) {
			throw new Error(`DataSourceType with type '${dataSource.type}' not found`)
		}

		// get inner default postgres connection options
		const connection = getConnectionOptions('postgres')

		const _dataSource = new DataSource()
		_dataSource.name = dataSource.name
		_dataSource.type = type
		_dataSource.tenant = this.tenant
		_dataSource.organization = this.organization
		_dataSource.createdBy = this.owner
		_dataSource.options = {
			...(dataSource.options ?? {}),
			host: dataSource.options?.host ?? connection.host,
			port: dataSource.options?.port ?? connection.port
		}

		if (!isDemo) {
			_dataSource.options.database = connection.database
			_dataSource.options.password = connection.password
			_dataSource.options.username = connection.username
		}

		return await this.dsRepository.save(_dataSource)
	}

	async createBusinessArea(parentId: string, businessArea: IBusinessArea) {
		// Remove existing business areas with the same name
		if (!parentId) {
			await this.businessAreaRepository.delete({
				tenantId: this.tenant.id,
				organizationId: this.organization.id,
				name: businessArea.name
			})
		}

		// Create new business area
		let _businessArea = new BusinessArea()
		_businessArea.name = businessArea.name
		_businessArea.parentId = parentId
		_businessArea.tenantId = this.tenant.id
		_businessArea.organizationId = this.organization.id
		_businessArea.createdBy = this.owner

		_businessArea = await this.businessAreaRepository.save(_businessArea)

		if (businessArea.children) {
			for (const child of businessArea.children) {
				await this.createBusinessArea(_businessArea.id, child)
			}
		}
	}

	async createSemanticModel(dataSourceId: string, semanticModel: ISemanticModel) {
		// Remove existing semantic models with the same name
		await this.modelRepository.delete({
			tenantId: this.tenant.id,
			organizationId: this.organization.id,
			key: semanticModel.key
		})

		// Create new semantic model
		let model = new SemanticModel()
		assign(model, semanticModel)
		model.tenantId = this.tenant.id
		model.organizationId = this.organization.id
		model.createdBy = this.owner
		model.owner = this.owner
		model.dataSourceId = semanticModel.dataSourceId
			? (
					await this.dsRepository.findOne({
						tenantId: this.tenant.id,
						organizationId: this.organization.id,
						name: semanticModel.dataSourceId
					})
			  ).id
			: dataSourceId
		model.businessAreaId = semanticModel.businessAreaId ? (
				await this.businessAreaRepository.findOne({
					tenantId: this.tenant.id,
					organizationId: this.organization.id,
					name: semanticModel.businessAreaId
				})
			)?.id : null
		model = await this.modelRepository.save(model)

		model = await this.modelRepository.findOne(model.id, {
			relations: ['dataSource', 'dataSource.type', 'roles']
		})

		await updateXmlaCatalogContent(this.redisClient, model)

		return model
	}

	async createProject(modelId: string, project: IProject) {
		// Remove existing projects with the same name
		await this.projectRepository.delete({
			tenantId: this.tenant.id,
			organizationId: this.organization.id,
			name: project.name
		})

		// Create new project
		const _project = new Project()
		assign(_project, pick(project, ['name', 'description', 'options']))

		_project.tenantId = this.tenant.id
		_project.organizationId = this.organization.id
		_project.createdBy = this.owner
		_project.owner = this.owner
		_project.status = ProjectStatusEnum.Progressing
		_project.models = [
			{
				id: modelId
			}
		]

		return await this.projectRepository.save(_project)
	}

	async createIndicator(modelId: string, indicator: any) {
		// Remove existing indicators with the same name
		await this.indicatorRepository.delete({
			tenantId: this.tenant.id,
			organizationId: this.organization.id,
			code: indicator.code
		})

		// Create new indicator
		const _indicator = new Indicator()
		assign(_indicator, indicator)
		_indicator.tenantId = this.tenant.id
		_indicator.organizationId = this.organization.id
		_indicator.createdBy = this.owner
		_indicator.project = this.project
		_indicator.modelId = indicator.modelId
			? (
					await this.modelRepository.findOne({
						tenantId: this.tenant.id,
						organizationId: this.organization.id,
						key: indicator.modelKey
					})
				)?.id
			: modelId
		_indicator.businessAreaId = (
			await this.businessAreaRepository.findOne({
				tenantId: this.tenant.id,
				organizationId: this.organization.id,
				name: indicator.businessAreaId
			})
		)?.id

		_indicator.options = {
			dimensions: indicator.dimensions,
			filters: indicator.filters,
			measure: indicator.measure,
			formula: indicator.formula,
			aggregator: indicator.aggregator,
			calendar: indicator.calendar,
			...(indicator.options ?? {})
		}
		return await this.indicatorRepository.save(_indicator)
	}

	async createStory(semanticModelId: string, story: IStory) {
		let _story = new Story()
		assign(_story, pick(story, ['name', 'description', 'thumbnail', 'options']))

		_story.tenantId = this.tenant.id
		_story.organizationId = this.organization.id
		_story.createdBy = this.owner
		_story.project = this.project
		// _story.modelId = story.modelId
		// 	? (
		// 			await this.modelRepository.findOne({
		// 				tenantId: this.tenant.id,
		// 				organizationId: this.organization.id,
		// 				name: story.modelId
		// 			})
		// 	  ).id
		// 	: semanticModelId
		_story.models = await Promise.all(story.models.map((model) => {
			return this.modelRepository.findOne({
				tenantId: this.tenant.id,
				organizationId: this.organization.id,
				key: model.key
			})
		}))
		_story.status = StoryStatusEnum.RELEASED
		_story.visibility = Visibility.Private
		_story.businessAreaId = story.businessAreaId
			? (
					await this.businessAreaRepository.findOne({
						tenantId: this.tenant.id,
						organizationId: this.organization.id,
						name: story.businessAreaId
					})
			  )?.id
			: null

		_story = await this.storyRepository.save(_story)

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
		_storyPoint.organizationId = this.organization.id
		_storyPoint.createdBy = this.owner
		_storyPoint.storyId = storyId

		_storyPoint = await this.storyPointRepository.save(_storyPoint)

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
		_storyWidget.organizationId = this.organization.id
		_storyWidget.createdBy = this.owner
		_storyWidget.storyId = storyId
		_storyWidget.pointId = storyPointId

		widget = await this.storyWidgetRepository.save(_storyWidget)
	}
}
