import { IQuery } from '@nestjs/cqrs'

export class ModelSqlQuery implements IQuery {
	static readonly type = '[Model] Sql query'

	constructor(
		public readonly modelId: string,
		public readonly options: {
			method: 'post' | 'get'
			url: string
			body: {
				statement: string
				forceRefresh: boolean
			}
			catalog: string
		}
	) {}
}
