import { XpertToolsetService } from '@metad/server-ai'
import { CommandHandler, ICommandHandler, QueryBus } from '@nestjs/cqrs'
import { DataSourceService } from '../../data-source.service'
import { DataSourcePingCommand } from '../ping.command'
import { DataSourceStrategyQuery } from '../../queries'

@CommandHandler(DataSourcePingCommand)
export class DataSourcePingHandler implements ICommandHandler<DataSourcePingCommand> {
	constructor(
		private readonly toolsetService: XpertToolsetService,
		private readonly dataSourceService: DataSourceService,
		private readonly queryBus: QueryBus
	) {
	}

	public async execute(command: DataSourcePingCommand): Promise<void> {
		const { dataSource: dataSourceId } = command.args
		const isDev = process.env.NODE_ENV === 'development'

		const dataSource = await this.dataSourceService.prepareDataSource(dataSourceId)

		// const runner = createQueryRunnerByType(dataSource.type.type, {
		// 	...dataSource.options,
		// 	debug: isDev,
		// 	trace: isDev
		// })
		const runner = await this.queryBus.execute(new DataSourceStrategyQuery(dataSource.type.type, {
			...dataSource.options,
			debug: isDev,
			trace: isDev
		}))

		try {
			await runner.ping()
		} finally {
			await runner.teardown()
		}
	}
}
