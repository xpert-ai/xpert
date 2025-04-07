import { ApiAuthType } from '@metad/contracts'
import { getErrorMessage } from '@metad/server-common'
import { ConfigService } from '@metad/server-config'
import { Inject, Logger } from '@nestjs/common'
import { CommandBus, IQueryHandler, QueryBus, QueryHandler } from '@nestjs/cqrs'
import { ParserOpenAPISchemaCommand } from '../../commands'
import { ToolApiSchemaError } from '../../errors'
import { GetOpenAPIRemoteSchemaQuery } from '../get-openapi-remote-schema.query'

@QueryHandler(GetOpenAPIRemoteSchemaQuery)
export class GetOpenAPIRemoteSchemaHandler implements IQueryHandler<GetOpenAPIRemoteSchemaQuery> {
	protected logger = new Logger(GetOpenAPIRemoteSchemaHandler.name)

	@Inject(ConfigService)
	protected readonly configService: ConfigService

	constructor(
		private readonly commandBus: CommandBus,
		private readonly queryBus: QueryBus
	) {}

	public async execute(command: GetOpenAPIRemoteSchemaQuery): Promise<{ schema: string }> {
		const { url, credentials } = command

		let authorization = null
		if (credentials.auth_type === ApiAuthType.BASIC) {
			authorization = 'Basic ' + Buffer.from(`${credentials.username}:${credentials.password}`).toString('base64')
		}
		try {
			const response = await fetch(url, {
				headers: {
					Authorization: authorization
				}
			})
			const text = await response.text()

			await this.commandBus.execute(new ParserOpenAPISchemaCommand(text))

			return {
				schema: text
			}
		} catch (err) {
			throw new ToolApiSchemaError(getErrorMessage(err))
		}
	}
}
