import { ICopilotProvider } from '@metad/contracts'
import { IQuery } from '@nestjs/cqrs'

/**
 */
export class GetAiProviderCredentialsQuery implements IQuery {
	static readonly type = '[Copilot Provider Model] Get Credentials'

	constructor(
		public readonly provider: ICopilotProvider,
		public readonly modelName?: string,
	) {}
}
