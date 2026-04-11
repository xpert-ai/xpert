import { DEFAULT_DB_CONNECTION } from '@xpert-ai/server-common'
import { ConfigModule, ConfigService } from '@xpert-ai/server-config'
import { Global, Logger, Module, OnApplicationShutdown } from '@nestjs/common'
import { ModuleRef } from '@nestjs/core'
import { TypeOrmModule } from '@nestjs/typeorm'
import { Pool } from 'pg'

export const DATABASE_POOL_TOKEN = 'DATABASE_POOL'

const databasePoolFactory = async (configService: ConfigService) => {
	const { dbConnectionOptions } = configService.config
	if (dbConnectionOptions.type !== 'postgres') {
		console.warn('Database pool (for vector store) is only available for PostgreSQL')
		return null
	}

	return new Pool({
		host: dbConnectionOptions.host,
		port: dbConnectionOptions.port,
		database: dbConnectionOptions.database,
		user: dbConnectionOptions.username,
		password: dbConnectionOptions.password
	})
}

/**
 * Import and provide base typeorm related classes.
 *
 * @module
 */
@Global()
@Module({
	imports: [
		/**
		 * Configuration for TypeORM database connection.
		 *
		 * @type {TypeOrmModuleOptions}
		 */
		TypeOrmModule.forRootAsync({
			imports: [ConfigModule],
			inject: [ConfigService],
			// Use useFactory, useClass, or useExisting
			useFactory: async (configService: ConfigService) => {
				const { dbConnectionOptions } = configService.config
				return {
					name: DEFAULT_DB_CONNECTION,
					...dbConnectionOptions
				}
			}
		})
	],
	providers: [
		{
			provide: DATABASE_POOL_TOKEN,
			inject: [ConfigService],
			useFactory: databasePoolFactory
		}
	],
	exports: [
		TypeOrmModule,
		DATABASE_POOL_TOKEN
	]
})
export class DatabaseModule implements OnApplicationShutdown {
	private readonly logger = new Logger(DatabaseModule.name)

	constructor(private readonly moduleRef: ModuleRef) {}

	onApplicationShutdown(signal?: string): any {
		this.logger.log(`Shutting down on signal ${signal}`)
		const pool = this.moduleRef.get(DATABASE_POOL_TOKEN) as Pool
		return pool.end()
	}
}
