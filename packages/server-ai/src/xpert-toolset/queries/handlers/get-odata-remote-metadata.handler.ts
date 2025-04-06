import { ApiAuthType, IXpertToolset, TXpertToolEntity } from '@metad/contracts'
import { getErrorMessage } from '@metad/server-common'
import { ConfigService } from '@metad/server-config'
import { Inject, Logger } from '@nestjs/common'
import { IQueryHandler, QueryBus, QueryHandler } from '@nestjs/cqrs'
import { ToolApiSchemaError } from '../../errors'
import { ODataToolset } from '../../provider'
import { GetODataRemoteMetadataQuery } from '../get-odata-remote-metadata.query'

@QueryHandler(GetODataRemoteMetadataQuery)
export class GetODataRemoteMetadataHandler implements IQueryHandler<GetODataRemoteMetadataQuery> {
	protected logger = new Logger(GetODataRemoteMetadataHandler.name)

	@Inject(ConfigService)
	protected readonly configService: ConfigService

	constructor(private readonly queryBus: QueryBus) {}

	public async execute(command: GetODataRemoteMetadataQuery): Promise<{ schema: string; tools: TXpertToolEntity[] }> {
		const { url, credentials } = command

		const formattedUrl = url.endsWith('/') ? `${url}$metadata` : `${url}/$metadata`
		let authorization = null
		if (credentials.auth_type === ApiAuthType.BASIC) {
			authorization = 'Basic ' + Buffer.from(`${credentials.username}:${credentials.password}`).toString('base64')
		}
		try {
			const response = await fetch(formattedUrl, {
				headers: {
					'Authorization': authorization
				}
			})
			const text = await response.text()
			const toolsetInstance = new ODataToolset({ options: { baseUrl: url }, credentials } as IXpertToolset)
			return {
				schema: text,
				tools: await toolsetInstance.getToolsSchema()
			}
		} catch (err) {
			throw new ToolApiSchemaError(getErrorMessage(err))
		}
	}
}
