import { IOrganization, IXpert, IXpertAgent, TXpertGraph, TXpertOptions, TXpertTeamDraft } from '@metad/contracts'
import { OrganizationPublicDTO } from '@metad/server-core'
import { Exclude, Expose, Transform, TransformFnParams } from 'class-transformer'
import { Knowledgebase, XpertToolset } from '../../core/entities/internal'
import { KnowledgebasePublicDTO } from '../../knowledgebase/dto'
import { XpertAgentPublicDTO } from '../../xpert-agent/dto'
import { ToolsetPublicDTO } from '../../xpert-toolset/dto'
import { XpertIdentiDto } from './xpert-identi.dto'

@Expose()
export class XpertPublicDTO extends XpertIdentiDto {
	@Exclude()
	declare draft?: TXpertTeamDraft

	@Exclude()
	declare graph?: TXpertGraph

	@Exclude()
	declare options?: TXpertOptions

	@Expose()
	@Transform((params: TransformFnParams) => (params.value ? new XpertAgentPublicDTO(params.value) : null))
	agent?: IXpertAgent

	@Expose()
	@Transform((params: TransformFnParams) => params.value?.map((_) => new XpertAgentPublicDTO(_)))
	agents?: IXpertAgent[]

	@Transform((params: TransformFnParams) =>
		params.value ? params.value.map((item) => new KnowledgebasePublicDTO(item)) : null
	)
	declare knowledgebases?: Knowledgebase[]

	@Transform((params: TransformFnParams) =>
		params.value ? params.value.map((item) => new ToolsetPublicDTO(item)) : null
	)
	declare toolsets?: XpertToolset[]

	@Expose()
	@Transform((params: TransformFnParams) => (params.value ? new OrganizationPublicDTO(params.value) : null))
	organization?: IOrganization

	constructor(partial: Partial<XpertPublicDTO | IXpert>) {
		super(partial)
	}
}
