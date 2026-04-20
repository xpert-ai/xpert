import { StoredMessage } from '@langchain/core/messages'
import { IUser, IXpert, IXpertAgent, IXpertAgentExecution } from '@xpert-ai/contracts'
import { UserPublicDTO } from '@xpert-ai/server-core'
import { Expose, Transform } from 'class-transformer'
import { XpertAgentIdentiDto } from '../../xpert-agent/dto'
import { XpertIdentiDto } from '../../xpert/dto'

@Expose()
export class XpertAgentExecutionDTO {
	@Expose()
	id?: string

	@Expose()
	title?: string

	@Expose()
	status?: string

	@Expose()
	error?: string

	@Expose()
	metadata?: Record<string, unknown>

	@Expose()
	get runtimeKind(): string | undefined {
		return readMetadataString(this.metadata, 'runtimeKind')
	}

	@Expose()
	get harnessType(): string | undefined {
		return readMetadataString(this.metadata, 'harnessType')
	}

	@Expose()
	get acpSessionId(): string | undefined {
		return readMetadataString(this.metadata, 'acpSessionId')
	}

	@Expose()
	get sessionStatus(): string | undefined {
		return readMetadataString(this.metadata, 'sessionStatus')
	}

	@Expose()
	tokens?: number

	@Expose()
	messages?: StoredMessage[]

	@Expose()
	@Transform(({ value }) => value?.map((_) => new XpertAgentExecutionDTO(_)))
	subExecutions?: IXpertAgentExecution[]

	@Expose()
	@Transform(({ value }) => new UserPublicDTO(value))
	createdBy: IUser

	// Temporary properties
	@Expose()
	totalTokens?: number

	@Expose()
	summary?: string

	@Transform(({value}) => value ? new XpertAgentIdentiDto(value) : null)
	@Expose()
	agent?: IXpertAgent

	@Transform(({value}) => value ? new XpertIdentiDto(value) : null)
	@Expose()
	xpert?: IXpert

	constructor(partial: Partial<XpertAgentExecutionDTO>) {
		Object.assign(this, partial)
	}
}

function readMetadataString(metadata: Record<string, unknown> | undefined, key: string): string | undefined {
	if (!metadata) {
		return undefined
	}

	const value = metadata[key]
	return typeof value === 'string' && value.length > 0 ? value : undefined
}
