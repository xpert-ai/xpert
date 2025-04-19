import yargs from 'yargs';
import chalk from 'chalk';

import { NestFactory } from '@nestjs/core';
import { IPluginConfig } from '@metad/server-common';
import { registerPluginConfig } from './../../bootstrap';
import { SeedDataService } from './seed-data.service';
import { SeederModule } from './seeder.module';

/**
* Usage:
* yarn seed:module All
* yarn seed:module Default
* yarn seed:module Jobs
* yarn seed:module Reports
* yarn seed:module Tenant --tenant Peanut
*
*/
export async function seedModule(devConfig: Partial<IPluginConfig>) {
	await registerPluginConfig(devConfig);

	NestFactory.createApplicationContext(SeederModule.forPluings(), {
		logger: false
	})
		.then((app) => {
			const seeder = app.get(SeedDataService);
			const argv: any = yargs(process.argv).argv;
			const module = argv.name;
			const tenantName = argv.tenant;
			const methodName = `run${module}Seed`;

			if (seeder[methodName]) {
				seeder[methodName](tenantName)
					.catch((error) => {
						throw error;
					})
					.finally(() => app.close());
			} else {
				console.log(
					chalk.red(
						`Method ${methodName} not found in SeedDataService`
					)
				);
				app.close();
			}
		})
		.catch((error) => {
			throw error;
		});
}
