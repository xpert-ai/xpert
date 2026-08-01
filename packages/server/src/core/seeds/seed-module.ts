import yargs from 'yargs'
import chalk from 'chalk'

import { NestFactory } from '@nestjs/core'
import { IPluginConfig } from '@xpert-ai/server-common'
import { registerPluginConfig } from './../../bootstrap'
import { SeedDataService } from './seed-data.service'
import { SeederModule } from './seeder.module'

export type SeedModuleOptions = {
	name?: string
	tenantName?: string
	organizationName?: string
}

/**
 * Usage:
 * pnpm seed:module All
 * pnpm seed:module Default
 * pnpm seed:module Jobs
 * pnpm seed:module Reports
 * pnpm seed:module Tenant --tenant Peanut
 *
 */
export async function seedModule(devConfig: Partial<IPluginConfig>, options: SeedModuleOptions = {}) {
	await registerPluginConfig(devConfig)
	const app = await NestFactory.createApplicationContext(SeederModule.forPluings(), {
		logger: false
	})
	try {
		const seeder = app.get(SeedDataService)
		const argv = await yargs(process.argv).parse()
		const moduleName = options.name ?? (typeof argv.name === 'string' ? argv.name : undefined)
		const tenantName = options.tenantName ?? (typeof argv.tenant === 'string' ? argv.tenant : undefined)
		const organizationName =
			options.organizationName ?? (typeof argv.organization === 'string' ? argv.organization : undefined)
		const methodName = `run${moduleName}Seed`
		const method: unknown = Reflect.get(seeder, methodName)

		if (typeof method !== 'function') {
			console.log(chalk.red(`Method ${methodName} not found in SeedDataService`))
			return
		}
		await method.call(seeder, tenantName, organizationName)
	} finally {
		await app.close()
	}
}
