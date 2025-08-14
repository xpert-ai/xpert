import { IQuery } from '@nestjs/cqrs'

/**
 * Init ocap framework and register semantic models
 */
export class GetBIContextQuery implements IQuery {
	static readonly type = '[AiBi] Get BI Context'

	constructor(
		public readonly models?: string[],
		public readonly params?: {
			/**
			 * Whether to use draft indicators
			 */
			indicatorDraft?: boolean;
			/**
			 * Whether to use draft semantic model
			 */
			semanticModelDraft?: boolean 
		}
	) {}
}
