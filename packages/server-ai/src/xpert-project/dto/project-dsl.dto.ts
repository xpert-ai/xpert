import { ICopilotModel, IKnowledgebase, IXpertProject, IXpertProjectTask, IXpertToolset, TAvatar, TXpertProjectSettings } from '@metad/contracts'
import { Exclude, Expose, Transform } from 'class-transformer'
import { CopilotModelDslDTO, KnowledgebaseDslDTO, XpertDraftDslDTO, XpertToolsetDslDTO } from '../../xpert/dto'
import { XpertProjectTaskDto } from './project-task.dto'

@Exclude()
export class XpertProjectDslDTO {
	@Expose()
	name: string

	@Expose()
	avatar: TAvatar

	@Expose()
	description?: string

	@Expose()
	settings?: TXpertProjectSettings

	@Expose()
	copilotModelId?: string

	@Expose()
	@Transform(({ value }) => value ? new CopilotModelDslDTO(value) : null)
	copilotModel?: ICopilotModel

	@Expose()
	xperts: XpertDraftDslDTO[]

	@Expose()
	@Transform(({ value }) => value?.map((_) => new XpertProjectTaskDto(_)))
	tasks?: IXpertProjectTask[]

	@Expose()
	@Transform(({ value }) => value?.map((item) => new KnowledgebaseDslDTO(item)))
	knowledgebases?: IKnowledgebase[]

	@Expose()
	@Transform(({ value }) => value?.map((item) => new XpertToolsetDslDTO(item)))
	toolsets?: IXpertToolset[]

	constructor(partial: Partial<Omit<IXpertProject, 'xperts'>> & {xperts: XpertDraftDslDTO[]}) {
		Object.assign(this, partial)
	}
}

@Exclude()
export class ProjectPackDslDTO {
	@Expose()
	project: XpertProjectDslDTO

	constructor(partial: Partial<ProjectPackDslDTO>) {
		Object.assign(this, partial)
	}
}
