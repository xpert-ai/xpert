import { ICommand } from '@nestjs/cqrs'

export class DataSourcePingCommand implements ICommand {
	static readonly type = '[DataSource] Ping'

	constructor(
		public readonly args: {
			dataSource: string
			schema: string
		},
	) {}
}
