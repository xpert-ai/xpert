import { CommandHandler, ICommandHandler, QueryBus } from '@nestjs/cqrs'
import { DataSourceService } from '../../data-source.service'
import { dataLoad } from '../../utils'
import { DataLoadCommand } from '../load.command'

@CommandHandler(DataLoadCommand)
export class DataLoadHandler implements ICommandHandler<DataLoadCommand> {
	constructor(
		private readonly dataSourceService: DataSourceService,
		private readonly queryBus: QueryBus
	) {}

	public async execute(command: DataLoadCommand): Promise<void> {
		const { id, sheets, file } = command.input
		const dataSource = await this.dataSourceService.prepareDataSource(id)
		return dataLoad(this.queryBus, dataSource, sheets, file)
	}
}
