import { IKnowledgebase, IUser, KBMetadataFieldDef, KnowledgebasePermission, TAvatar } from '@metad/contracts'
import { Exclude, Expose } from 'class-transformer'

@Exclude()
export class KnowledgebasePublicDTO implements Partial<IKnowledgebase> {
	@Expose()
	declare id: string

	@Expose()
	declare name: string

	@Expose()
	declare language?: 'Chinese' | 'English'

	@Expose()
	declare avatar?: TAvatar

	@Expose()
	declare description?: string

	@Expose()
	declare status: string

	@Expose()
	metadataSchema?: KBMetadataFieldDef[];

	@Expose()
	declare permission?: KnowledgebasePermission

	@Expose()
	declare createdBy?: IUser

	@Expose()
	pipelineId?: string

	@Expose()
	declare createdAt: Date

	constructor(partial: IKnowledgebase) {
		Object.assign(this, partial)
	}
}
