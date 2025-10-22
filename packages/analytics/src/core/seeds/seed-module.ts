import { IPluginConfig } from '@metad/server-common'
import { registerPluginConfig } from '@metad/server-core'
import { INestApplicationContext } from '@nestjs/common'
import { NestFactory } from '@nestjs/core'
import chalk from 'chalk'
import yargs from 'yargs'
import { prepare } from '../prepare'
import { SeedDataService } from './seed-data.service'
import { SeederModule } from './seeder.module'

export async function seedModule(devConfig: Partial<IPluginConfig>) {
	prepare()
	await registerPluginConfig(devConfig)

	let app: INestApplicationContext
	try {
		app = await NestFactory.createApplicationContext(SeederModule.forPluings(), {
			logger: ['log', 'error', 'warn', 'debug', 'verbose']
		})
	} catch (error) {
	  console.error(error)
	}

	console.log(chalk.green('Seeding Module...'))

	const seeder = app.get(SeedDataService)
	const argv: any = yargs(process.argv).argv
	const module = argv.name
	const tenantName = argv.tenant
	const organizationName = argv.organization
	const methodName = `run${module}Seed`

	if (seeder[methodName]) {
		console.log(chalk.green(`Running ${methodName} in SeedDataService`))
		try {
			await seeder[methodName](tenantName, organizationName)
		} finally {
			app.close()
		}
	} else {
		console.log(chalk.red(`Method ${methodName} not found in SeedDataService`))
		app.close()
	}
}
