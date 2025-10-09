import { rimraf } from 'rimraf';
import path from 'path';
import { Injectable } from '@nestjs/common';
import {
	Connection,
	createConnection,
	ConnectionOptions,
	getConnection,
	getManager
} from 'typeorm';
import chalk from 'chalk';
import moment from 'moment';
import { IPluginConfig, SEEDER_DB_CONNECTION } from '@metad/server-common';
import { environment as env, getConfig, ConfigService } from '@metad/server-config';
import {
	IEmployee,
	IOrganization,
	IRole,
	ITenant,
	IUser,
	DEFAULT_TENANT
} from '@metad/contracts';
import { createRoles } from '../../role/role.seed';
import {	
	createDefaultAdminUsers,
	createDefaultEmployeesUsers,
	createDefaultUsers,
	createRandomSuperAdminUsers,
	createRandomUsers
} from '../../user/user.seed';
import {
	createDefaultEmployees,
	createRandomEmployees
} from '../../employee/employee.seed';
import {
	createDefaultOrganizations,
	DEFAULT_ORGANIZATIONS,
	getTenantDefaultOrganization,
	OrganizationDemoCommand
} from '../../organization';
import {
	createDefaultUsersOrganizations,
	createRandomUsersOrganizations
} from '../../user-organization/user-organization.seed';
import { createCountries } from '../../country/country.seed';
import { cleanUpRolePermissions, createRolePermissions } from '../../role-permission/';
import {
	createDefaultTenant,
	createRandomTenants,
	TenantService
} from '../../tenant';
import {
	createDefaultTenantSetting
} from './../../tenant/tenant-setting/tenant-setting.seed';
import { createDefaultEmailTemplates } from '../../email-template/email-template.seed';
import {
	createDefaultTags,
	createRandomOrganizationTags,
	createTags
} from '../../tags/tag.seed';
import { createCurrencies } from '../../currency/currency.seed';
import {
	createDefaultFeatureToggle,
	createFeatures,
	createRandomFeatureToggle
} from '../../feature/feature.seed';
import { DEFAULT_EMPLOYEES, DEFAULT_PEANUT_EMPLOYEES } from './../../employee';
import { createLanguages } from '../../language/language.seed';
import { Role, Tenant } from '../entities/internal';


export enum SeederTypeEnum {
	ALL = 'all',
	DEFAULT = 'default',
	TENANT = 'tenant',
}

@Injectable()
export class SeedDataService {
	connection: Connection;
	log = console.log;

	organizations: IOrganization[] = [];
	defaultOrganization: IOrganization;
	tenant: ITenant;
	roles: IRole[] = [];
	superAdminUsers: IUser[] = [];
	defaultUsers: IUser[] = [];
	defaultCandidateUsers: IUser[] = [];
	defaultEmployees: IEmployee[] = [];
	adminUser: IUser;

	config: IPluginConfig = getConfig();
	seedType: SeederTypeEnum;

	constructor(
		// private readonly moduleRef: ModuleRef,
		protected readonly configService: ConfigService,
	) {
		this.log(
			chalk.blueBright(
				`📧 Environments ${JSON.stringify(this.configService.environment)}`
			)
		);
		this.log(
			chalk.blueBright(
				`📧 Configs ${JSON.stringify(this.configService.config)}`
			)
		);
	}

	/**
	 * This config is applied only for `yarn seed:*` type calls because
	 * that is when connection is created by this service itself.
	 */
	overrideDbConfig = {
		logging: true,
		logger: 'file' //Removes console logging, instead logs all queries in a file ormlogs.log
		// dropSchema: !env.production //Drops the schema each time connection is being established in development mode.
	};

	/**
	* Seed All Data
	*/
	public async runAllSeed() {
		try {
			this.seedType = SeederTypeEnum.ALL;

			await this.cleanUpPreviousRuns();

			// Connect to database
			await this.createConnection();

			// Reset database to start with new, fresh data
			await this.resetDatabase();

			// Seed basic default data for default tenant
			await this.seedBasicDefaultData();

			// Seed data with mock / fake data for default tenant
			await this.seedDefaultData();

			// Disconnect to database
			await this.closeConnection();

			console.log('Database All Seed Completed');
		} catch (error) {
			this.handleError(error);
		}
	}

	/**
	* Seed Default Data
	*/
	public async runDefaultSeed(fromAPI: boolean) {
		try {
			if (this.configService.get('demo') === true && fromAPI === true) {
				this.seedType = SeederTypeEnum.ALL;
			} else {
				this.seedType = SeederTypeEnum.DEFAULT;
			}

			await this.cleanUpPreviousRuns();

			// Connect to database
			await this.createConnection();

			// Reset database to start with new, fresh data
			await this.resetDatabase();

			// Seed basic default data for default tenant
			await this.seedBasicDefaultData();

			// Disconnect to database
			await this.closeConnection();

			console.log('Database Default Seed Completed');
		} catch (error) {
			this.handleError(error);
		}
	}

	/**
	* Seed Tenant Data
	*/
	public async runTenantSeed(name: string) {
		try {
			this.seedType = SeederTypeEnum.TENANT;
			
			await this.cleanUpPreviousRuns();

			// Connect to database
			await this.createConnection();

			// Seed basic default data for default tenant
			await this.seedTenantDefaultData(name || DEFAULT_TENANT);

			// Disconnect to database
			await this.closeConnection();

			console.log(`Database for Tenant '${name}' Seed Completed`);
		} catch (error) {
			this.handleError(error);
		}
	}

	public async runTenantEmailTSeed(name: string) {
		name = name || DEFAULT_TENANT
		try {
			this.seedType = SeederTypeEnum.TENANT;
			
			await this.cleanUpPreviousRuns();

			// Connect to database
			await this.createConnection();

			// Find tenant or default tenant
			this.tenant = await (await this.connection.getRepository(Tenant)).findOne({where: {name}})

			// Seed email templates
			await this.tryExecute(
				'Default Email Templates',
				createDefaultEmailTemplates(this.connection, this.tenant)
			);

			// Disconnect to database
			await this.closeConnection();

			console.log(`Email Templates for Tenant '${name}' Seed Completed`);
		} catch (error) {
			this.handleError(error);
		}
	}

	/**
	* Seed Default & Random Data
	*/
	public async excuteDemoSeed() {
		try {
			console.log('Database Demo Seed Started');

			// Connect to database
			await this.createConnection();

			// Seed default data
			await this.seedDefaultData();

			// Disconnect to database
			await this.closeConnection();

			console.log('Database Demo Seed Completed');
		} catch (error) {
			this.handleError(error);
		}
	}

	/**
	* Populate Database with Basic Default Data
	*/
	private async seedBasicDefaultData() {
		this.log(
			chalk.magenta(
				`🌱 SEEDING BASIC ${env.production ? 'PRODUCTION' : ''
				} DATABASE...`
			)
		);

		// Seed data which only needs connection
		await this.tryExecute(
			'Countries',
			createCountries(this.connection)
		);

		await this.tryExecute(
			'Currencies',
			createCurrencies(this.connection)
		);

		await this.tryExecute(
			'Languages', 
			createLanguages(this.connection)
		);

		await this.tryExecute(
			'Features', 
			createFeatures(this.connection)
		);

		// default and internal tenant
		await this.seedTenantDefaultData(DEFAULT_TENANT)
		
		this.log(
			chalk.magenta(
				`✅ SEEDED BASIC ${env.production ? 'PRODUCTION' : ''} DATABASE`
			)
		);
	}

	/**
	 * Populate default data for default tenant
	 */
	private async seedDefaultData() {
		this.log(
			chalk.magenta(
				`🌱 SEEDING DEFAULT ${env.production ? 'PRODUCTION' : ''
				} DATABASE...`
			)
		);

		await this.tryExecute(
			'Default Tags',
			createDefaultTags(
				this.connection, 
				this.tenant, 
				this.organizations
			)
		);

		const {
			defaultEmployeeUsers 
		} = await createDefaultEmployeesUsers(
			this.connection, 
			this.tenant
		);

		if (this.seedType !== SeederTypeEnum.DEFAULT) {
			const { 
				defaultPeanutEmployeeUsers,
				defaultCandidateUsers 
			} = await createDefaultUsers(
				this.connection, 
				this.tenant
			);
			this.defaultCandidateUsers.push(...defaultCandidateUsers);
			defaultEmployeeUsers.push(...defaultPeanutEmployeeUsers);
		}

		await this.tryExecute(
			'Users',
			createDefaultUsersOrganizations(
				this.connection,
				this.tenant,
				this.organizations,
				defaultEmployeeUsers
			)
		);

		const allDefaultEmployees = DEFAULT_EMPLOYEES.concat(DEFAULT_PEANUT_EMPLOYEES);
		//User level data that needs connection, tenant, organization, role, users
		this.defaultEmployees = await createDefaultEmployees(
			this.connection, 
			this.tenant,
			this.defaultOrganization,
			defaultEmployeeUsers,
			allDefaultEmployees
		);

		// // run all plugins default seed method
		// await this.bootstrapPluginSeedMethods(
		// 	'onDefaultPluginSeed',
		// 	(instance: any) => {
		// 		const pluginName =
		// 			instance.constructor.name || '(anonymous plugin)';
		// 		console.log(
		// 			chalk.green(`SEEDED Default Plugin [${pluginName}]`)
		// 		);
		// 	}
		// );

		this.log(
			chalk.magenta(
				`✅ SEEDED DEFAULT ${env.production ? 'PRODUCTION' : ''} DATABASE`
			)
		);
	}

	/**
	 * 创建新的 Tenant 并初始化相应默认数据
	 * 
	 * @param tenantName 
	 */
	public async seedTenantDefaultData(tenantName: string) {

		this.tenant = await this.tryExecute(
			'Tenant',
			createDefaultTenant(
				this.connection,
				tenantName
			) 
		) as ITenant;

		this.roles = await createRoles(
			this.connection, 
			[this.tenant]
		);

		await createDefaultTenantSetting(
			this.connection, 
			[this.tenant]
		);

		const isDemo = this.configService.get('demo') as boolean;
		await createRolePermissions(
			this.connection, 
			this.roles,
			[this.tenant],
			isDemo
		);

		// Tenant level inserts which only need connection, tenant, roles
		const organizations = [...DEFAULT_ORGANIZATIONS]
		if (this.seedType !== SeederTypeEnum.DEFAULT) {
			organizations.push(getTenantDefaultOrganization(this.tenant.name))
		}
		this.organizations = await this.tryExecute(
			'Organizations',
			createDefaultOrganizations(
				this.connection,
				this.tenant,
				organizations
			)
		) as IOrganization[];

		//default organization set as main orgnaization
		this.defaultOrganization = this.organizations.find(
			(organization: IOrganization) => organization.isDefault
		);

		await this.tryExecute(
			'Default Feature Toggle',
			createDefaultFeatureToggle(
				this.connection,
				this.config,
				this.tenant
			)
		);

		await this.tryExecute(
			'Default Email Templates',
			createDefaultEmailTemplates(this.connection, this.tenant)
		);

		const {
			defaultSuperAdminUsers,
			defaultAdminUsers
		} = await createDefaultAdminUsers(
			this.connection, 
			this.tenant
		);
		this.superAdminUsers.push(...defaultSuperAdminUsers as IUser[]);
		this.adminUser = defaultAdminUsers[0]

		const defaultUsers = [ 
			...this.superAdminUsers,
			...defaultAdminUsers,
			// ...defaultEmployeeUsers
		];
		await this.tryExecute(
			'Users',
			createDefaultUsersOrganizations(
				this.connection,
				this.tenant,
				this.organizations,
				defaultUsers
			)
		);

		// run all plugins random seed method
		// await this.bootstrapPluginSeedMethods(
		// 	'onBasicPluginSeed',
		// 	(instance: any) => {
		// 		const pluginName =
		// 			instance.constructor.name || '(anonymous plugin)';
		// 		console.log(chalk.green(`SEEDED Basic Plugin [${pluginName}]`));
		// 	}
		// );

		await this.seedTenantMoreDefault(
			this.connection, 
			this.tenant
		)

		// Trigger create demo command for the default organization; After all default data is seeded
		if (isDemo) {
			await this.tryExecute(
				'Demos',
				this.seedOrganizationDemo(
					this.connection,
					this.tenant,
					this.defaultOrganization
				)
			);
		}

		this.log(
			chalk.magenta(
				`✅ SEEDED TENANT '${tenantName}' ${env.production ? 'PRODUCTION' : ''} DATABASE`
			)
		);
		
	}

	public async runRolePermissionsSeed(tenantName: string) {
		try {
			await this.cleanUpPreviousRuns();

			// Connect to database
			await this.createConnection();

			// Find tenant or default tenant
			this.tenant = await (await this.connection.getRepository(Tenant)).findOne({where: {name: tenantName} })

			// Find all roles in tenant
			this.roles = await (await this.connection.getRepository(Role)).find({
				relations: ['tenant'],
				where: {
					tenant: this.tenant
				}
			})

			const isDemo = this.configService.get('demo') as boolean;
			// Clean role permissions
			await this.tryExecute(
				'Clean Role Permissions',
				cleanUpRolePermissions(this.connection, this.roles, [this.tenant], isDemo)
			)
			// Seed role permissions
			await this.tryExecute(
				'Role Permissions',
				createRolePermissions(
					this.connection, 
					this.roles,
					[this.tenant],
					isDemo
				)
			)

			// Disconnect to database
			await this.closeConnection();

			console.log('Database Default Seed Completed');
		} catch (error) {
			this.handleError(error);
		}
	}

	// public async seedFeatureData(tenantId: string) {
	// 	try {
	// 		console.log('Database Feature Seed Started');

	// 		// Connect to database
	// 		await this.createConnection();

	// 		// Get default Tenant
	// 		this.tenant = await this.tenantService.findOne(tenantId)

	// 		// Seed default data
	// 		await this.tryExecute(
	// 			'Default Feature Toggle',
	// 			createDefaultFeatureToggle(
	// 				this.connection,
	// 				this.config,
	// 				this.tenant
	// 			)
	// 		);

	// 		// Disconnect to database
	// 		await this.closeConnection();

	// 		console.log('Database Features Seed Completed');
	// 	} catch (error) {
	// 		this.handleError(error);
	// 	}
	// }

	/**
	* Cleans all the previous generate screenshots, reports etc
	*/
	protected async cleanUpPreviousRuns() {
		this.log(chalk.green(`CLEANING UP FROM PREVIOUS RUNS...`));

		await new Promise((resolve) => {
			const assetOptions = this.config.assetOptions;
			const dir = path.join(assetOptions.assetPublicPath, 'screenshots');

			// delete old generated screenshots
			rimraf(`${dir}/!(rimraf|.gitkeep)`).then(() => {
				this.log(chalk.green(`✅ CLEANED UP`));
				resolve(true);
			})
		});
	}

	/**
	* Create connection from database
	*/
	protected async createConnection() {
		try {
			this.connection = getConnection(SEEDER_DB_CONNECTION);
		} catch (error) {
			this.log(
				'NOTE: DATABASE CONNECTION DOES NOT EXIST YET. NEW ONE WILL BE CREATED!'
			);
		}
		const { dbConnectionOptions } = this.config;
		if (!this.connection || !this.connection.isConnected) {
			try {
				this.log(chalk.green(`CONNECTING TO DATABASE...`));
				this.connection = await createConnection({ 
					name: SEEDER_DB_CONNECTION, 
					...dbConnectionOptions, 
					...this.overrideDbConfig 
				} as ConnectionOptions);
				this.log(chalk.green(`✅ CONNECTED TO DATABASE!`));
			} catch (error) {
				this.handleError(error, 'Unable to connect to database');
			}
		}
	}

	/**
	* Close connection from database
	*/
	protected async closeConnection() {
		try {
			this.connection = getConnection(SEEDER_DB_CONNECTION);
			if (this.connection && this.connection.isConnected) {
				await this.connection.close();
				this.log(chalk.green(`✅ DISCONNECTED TO DATABASE!`));
			}
		} catch (error) {
			this.log('NOTE: DATABASE CONNECTION DOES NOT EXIST YET. CANT CLOSE CONNECTION!');
		}
	}

	/**
	 * Use this wrapper function for all seed functions which are not essential.
	 * Essentials seeds are ONLY those which are required to start the UI/login
	 */
	public tryExecute<T>(
		name: string,
		p: Promise<T>
	): Promise<T> | Promise<void> {
		this.log(chalk.green(`${moment().format('DD.MM.YYYY HH:mm:ss')} SEEDING ${name}`));

		return (p as any).then(
			(x: T) => x,
			(error: Error) => {
				this.log(
					chalk.bgRed(
						`🛑 ERROR: ${error ? error.message : 'unknown'}`
					)
				);
			}
		);
	}

	/**
	 * Retrieve entities metadata
	 */
	private async getEntities() {
		const entities = [];
		try {
			this.connection.entityMetadatas.forEach((entity) =>
				entities.push({
					name: entity.name,
					tableName: entity.tableName
				})
			);
			return entities;
		} catch (error) {
			this.handleError(error, 'Unable to retrieve database metadata');
		}
	}

	/**
	 * Cleans all the entities
	 * Removes all data from database
	 */
	private async cleanAll(entities: Array<any>) {
		try {
			const manager = getManager(SEEDER_DB_CONNECTION);
			const database = this.config.dbConnectionOptions;

			switch (database.type) {
				case 'postgres': {
					const tables = entities.map(
						(entity) => '"' + entity.tableName + '"'
					);
					const truncateSql = `TRUNCATE TABLE ${tables.join(
						','
					)} RESTART IDENTITY CASCADE;`;
					await manager.query(truncateSql);
					break;
				}
				default:
					await manager.query(`PRAGMA foreign_keys = OFF;`);
					for (const entity of entities) {
						await manager.query(
							`DELETE FROM "${entity.tableName}";`
						);
					}
			}
		} catch (error) {
			this.handleError(error, 'Unable to clean database');
		}
	}

	/**
	 * Reset the database, truncate all tables (remove all data)
	 */
	private async resetDatabase() {
		this.log(chalk.green(`RESETTING DATABASE`));

		const entities = await this.getEntities();
		await this.cleanAll(entities);

		this.log(chalk.green(`✅ RESET DATABASE SUCCESSFUL`));
	}

	private handleError(error: Error, message?: string): void {
		this.log(
			chalk.bgRed(
				`🛑 ERROR: ${message ? message + '-> ' : ''} ${error ? error.message : ''
				}`
			)
		);
		throw error;
	}

	// private async bootstrapPluginSeedMethods(
	// 	lifecycleMethod: keyof PluginLifecycleMethods,
	// 	closure?: (instance: any) => void
	// ): Promise<void> {
	// 	const plugins = getPluginModules(this.config.plugins);
	// 	for (const plugin of plugins) {
	// 		let classInstance: ClassDecorator;
	// 		try {
	// 			classInstance = this.moduleRef.get(plugin, { strict: false });
	// 		} catch (e) {
	// 			console.log(
	// 				`Could not find ${plugin.name}`,
	// 				undefined,
	// 				e.stack
	// 			);
	// 		}
	// 		if (classInstance) {
	// 			if (hasLifecycleMethod(classInstance, lifecycleMethod)) {
	// 				await classInstance[lifecycleMethod]();
	// 				if (typeof closure === 'function') {
	// 					closure(classInstance);
	// 				}
	// 			}
	// 		}
	// 	}
	// }

	public async seedTenantMoreDefault(connection: Connection, tenant: ITenant) {
		//
	}

	public async seedOrganizationDemo(connection: Connection, tenant: ITenant, organization: IOrganization) {
		//
	}
}
