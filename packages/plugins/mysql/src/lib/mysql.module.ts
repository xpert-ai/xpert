import { XpertServerPlugin, IOnPluginBootstrap, IOnPluginDestroy } from '@xpert-ai/plugin-sdk';
import chalk from 'chalk';
import { MySQLDataSourceStrategy } from './mysql.strategy';
import { RDSMySQLDataSourceStrategy } from './rds-mysql.strategy';
import { StarRocksDataSourceStrategy } from './starrocks.strategy';
import { DorisDataSourceStrategy } from './doris.strategy';



@XpertServerPlugin({
	/**
	 * An array of modules that will be imported and registered with the plugin.
	 */
	imports: [],

	providers: [
		MySQLDataSourceStrategy,
		RDSMySQLDataSourceStrategy,
		DorisDataSourceStrategy,
		StarRocksDataSourceStrategy
	]
})
export class MySQLPlugin implements IOnPluginBootstrap, IOnPluginDestroy {
	// We disable by default additional logging for each event to avoid cluttering the logs
	private logEnabled = true;

	/**
	 * Called when the plugin is being initialized.
	 */
	onPluginBootstrap(): void | Promise<void> {
		if (this.logEnabled) {
			console.log(chalk.green(`${MySQLPlugin.name} is being bootstrapped...`));
		}
	}

	/**
	 * Called when the plugin is being destroyed.
	 */
	onPluginDestroy(): void | Promise<void> {
		if (this.logEnabled) {
			console.log(chalk.green(`${MySQLPlugin.name} is being destroyed...`));
		}
	}
}
