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
	@Transform(({ value }) => value?.map((item) => new KnowledgebaseDslDTO(item)))
	knowledgebases?: IKnowledgebase[]

	@Expose()
	@Transform(({ value }) => value?.map((item) => new XpertToolsetDslDTO(item)))
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
				case 'toolset': {
					return {
						...node,
						entity: new XpertToolsetDslDTO(node.entity)
					}
				}
				case 'knowledge': {
					return {
						...node,
						entity: new KnowledgebaseDslDTO(node.entity)
					}
				}
				case 'xpert': {
					return {
						...node,
						entity: new XpertDslDTO(node.entity)
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

@Exclude()
export class XpertToolsetDslDTO {
	@Expose()
	id?: string

	@Expose()
	name: string

	@Expose()
	type: string

	@Expose()
	category: string

	@Expose()
    description: string
	@Expose()
	avatar: TAvatar

	@Expose()
	options: null

	@Expose()
	privacyPolicy: null

	@Expose()
	customDisclaimer: null

	@Expose()
	tags: any[]

	constructor(partial: Partial<XpertToolsetDslDTO>) {
		Object.assign(this, partial)
	}
}

@Exclude()
export class KnowledgebaseDslDTO {
	@Expose()
	id?: string

	@Expose()
	name: string

	constructor(partial: Partial<KnowledgebaseDslDTO>) {
		Object.assign(this, partial)
	}
}