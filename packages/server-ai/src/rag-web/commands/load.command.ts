import { IIntegration, TRagWebOptions } from '@metad/contracts'
import { ICommand } from '@nestjs/cqrs'

export class RagWebLoadCommand implements ICommand {
	static readonly type = '[Rag Web] Load'

	static readonly prefix = 'rag_web'
	static readonly providerPrefix = 'rag_web_provider'

	constructor(
		public readonly type: string,
		public readonly input: { webOptions: TRagWebOptions; integration: IIntegration }) {}
}
