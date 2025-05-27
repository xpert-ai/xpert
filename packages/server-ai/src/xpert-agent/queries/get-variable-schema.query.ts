import { IQuery } from '@nestjs/cqrs'

/**
 * Get schema of state variable.
 * 
 * @deprecated Is it still useful?
 */
export class XpertAgentVariableSchemaQuery implements IQuery {
	static readonly type = '[Xpert Agent] Get schema of variable'

	constructor(
		public readonly options: {
			xpertId: string
			type?: 'agent' | 'workflow'
			variable?: string,
			/**
			 * Draft First
			 */
			isDraft?: boolean,
		},
	) {}
}
