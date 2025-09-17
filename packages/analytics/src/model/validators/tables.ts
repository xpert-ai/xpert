import { IDSTable } from '@metad/adapter'
import { CommandBus } from '@nestjs/cqrs'
import { QuerySchemaCommand } from '../../data-source/commands'

export class TablesCache {
	constructor(
		private readonly commandBus: CommandBus,
		private readonly dataSource: string,
		private readonly schema: string
	) {}

	private cache: { [key: string]: IDSTable } = {}

	async getTable(name: string): Promise<IDSTable> {
		if (!this.cache[name]) {
			const tables: IDSTable[] = await this.commandBus.execute(
				new QuerySchemaCommand({
					dataSource: this.dataSource,
					schema: this.schema,
					tables: [name]
				})
			)
			this.cache[name] = tables.find((table) => table.name === name)
		}
		return this.cache[name]
	}
}
