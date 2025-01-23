import { TXpertOptions, TXpertTeamDraft } from '@metad/contracts'
import { Exclude, Expose, Transform, TransformFnParams } from 'class-transformer'
import { Knowledgebase, XpertToolset } from '../../core/entities/internal'
import { KnowledgebasePublicDTO } from '../../knowledgebase/dto'
import { ToolsetPublicDTO } from '../../xpert-toolset/dto'
import { Xpert } from '../xpert.entity'
import { XpertIdentiDto } from './xpert-identi.dto'

@Expose()
export class XpertPublicDTO extends XpertIdentiDto {
	@Exclude()
	declare draft?: TXpertTeamDraft

	@Exclude()
	declare options?: TXpertOptions

	@Transform((params: TransformFnParams) =>
		params.value ? params.value.map((item) => new KnowledgebasePublicDTO(item)) : null
	)
	declare knowledgebases?: Knowledgebase[]

	@Transform((params: TransformFnParams) =>
		params.value ? params.value.map((item) => new ToolsetPublicDTO(item)) : null
	)
	declare toolsets?: XpertToolset[]

	constructor(partial: Partial<XpertPublicDTO | Xpert>) {
		super(partial)
	}
}
