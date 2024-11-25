import {
	AiModelTypeEnum,
	ICopilot,
	ICopilotModel,
	IKnowledgebase,
	ITag,
	IXpert,
	IXpertAgent,
	IXpertToolset,
	TAvatar,
	TCopilotModel,
	TCopilotModelOptions,
	TXpertAgent,
	TXpertAgentOptions,
	TXpertOptions,
	TXpertParameter,
	TXpertTeamConnection,
	TXpertTeamDraft,
	TXpertTeamNode,
	XpertTypeEnum
} from '@metad/contracts'
import { Exclude, Expose, Transform } from 'class-transformer'

@Exclude()
export class XpertDslDTO {
	@Expose()
	name: string

	@Expose()
	type: XpertTypeEnum

	@Expose()
	title?: string

	@Expose()
	description?: string

	@Expose()
	avatar?: TAvatar

	@Expose()
	starters?: string[]

	@Expose()
	options?: TXpertOptions

	@Expose()
	version?: string

	@Expose()
	@Transform(({ value }) => new XpertAgentDslDTO(value))
	agent?: IXpertAgent

	@Expose()
	@Transform(({ value }) => new CopilotModelDslDTO(value))
	copilotModel?: ICopilotModel

	@Expose()
	knowledgebases?: IKnowledgebase[]

	@Expose()
	toolsets?: IXpertToolset[]

	@Expose()
	tags?: ITag[]

	constructor(partial: Partial<XpertDslDTO>) {
		Object.assign(this, partial)
	}
}

@Exclude()
export class XpertDraftDslDTO implements TXpertTeamDraft {
	@Expose()
	@Transform(({ value }) => new XpertDslDTO(value))
	team: Partial<IXpert>

	@Expose()
	@Transform(({ value }) =>
		value?.map((node) => {
			switch (node.type) {
				case 'agent': {
					return {
						...node,
						entity: new XpertAgentDslDTO(node.entity)
					}
				}
				default: {
					return node
				}
			}
		})
	)
	nodes: TXpertTeamNode[]

	@Expose()
	connections: TXpertTeamConnection[]

	constructor(partial: Partial<XpertDraftDslDTO>) {
		Object.assign(this, partial)
	}
}

@Exclude()
export class XpertAgentDslDTO implements TXpertAgent {
	@Expose()
	key: string

	@Expose()
	name?: string

	@Expose()
	title?: string

	@Expose()
	description?: string

	@Expose()
	avatar?: TAvatar

	@Expose()
	prompt?: string

	@Expose()
	parameters?: TXpertParameter[]

	@Expose()
	options?: TXpertAgentOptions

	@Expose()
	@Transform(({ value }) => new CopilotModelDslDTO(value))
	copilotModel?: ICopilotModel

	@Expose()
	leaderKey?: string

	@Expose()
	collaboratorNames?: string[]

	@Expose()
	toolsetIds?: string[]

	@Expose()
	knowledgebaseIds?: string[]

	constructor(partial: Partial<XpertAgentDslDTO>) {
		Object.assign(this, partial)
	}
}

@Exclude()
export class CopilotModelDslDTO implements TCopilotModel {
	@Expose()
	copilot?: ICopilot

	@Expose()
	modelType?: AiModelTypeEnum

	@Expose()
	model?: string

	@Expose()
	options?: TCopilotModelOptions

	constructor(partial: Partial<CopilotModelDslDTO>) {
		Object.assign(this, partial)
	}
}
