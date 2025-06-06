import {
	AiModelTypeEnum,
	ICopilot,
	ICopilotModel,
	IKnowledgebase,
	ITag,
	IXpert,
	IXpertAgent,
	IXpertTool,
	IXpertToolset,
	TAgentOutputVariable,
	TAgentPromptTemplate,
	TAvatar,
	TCopilotModel,
	TCopilotModelOptions,
	TLongTermMemory,
	TSummarize,
	TXpertAgent,
	TXpertAgentConfig,
	TXpertAgentOptions,
	TXpertAttachment,
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
	agentConfig?: TXpertAgentConfig

	@Expose()
	memory?: TLongTermMemory

	@Expose()
	summarize?: TSummarize

	@Expose()
	attachment?: TXpertAttachment

	@Expose()
	version?: string

	@Expose()
	@Transform(({ value }) => value ? new XpertAgentDslDTO(value) : null)
	agent?: IXpertAgent

	@Expose()
	@Transform(({ value }) => value ? new CopilotModelDslDTO(value) : null)
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
	promptTemplates?: TAgentPromptTemplate[]

	@Expose()
	parameters?: TXpertParameter[]

	@Expose()
	outputVariables?: TAgentOutputVariable[]

	@Expose()
	options?: TXpertAgentOptions

	@Expose()
	@Transform(({ value }) => value ? new CopilotModelDslDTO(value) : null)
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

	@Expose()
	@Transform(({ value }) => value?.map((_) => new XpertToolDslDTO(_)))
	tools: IXpertTool[]

	constructor(partial: Partial<XpertToolsetDslDTO>) {
		Object.assign(this, partial)
	}
}

@Exclude()
export class XpertToolDslDTO {
	@Expose()
	id?: string

	@Expose()
	name: string

	@Expose()
    description: string

	@Expose()
	avatar: TAvatar

	@Expose()
	enabled?: boolean

	@Expose()
	parameters?: Record<string, any>

	@Expose()
	options?: Record<string, any>

	constructor(partial: Partial<XpertToolDslDTO>) {
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