import { IQuery } from '@nestjs/cqrs'

export class GetPluginSkillDocumentQuery implements IQuery {
	static readonly type = '[Plugin] Get Skill Document'

	constructor(
		public readonly input: {
			pluginName: string
			componentKey: string
			organizationId?: string | null
		}
	) {}
}
