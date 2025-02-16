import { IKnowledgebase, IUser, KnowledgebasePermission, TAvatar } from '@metad/contracts'
import { Exclude, Expose } from 'class-transformer'
import { Knowledgebase } from '../knowledgebase.entity'

@Exclude()
export class KnowledgebasePublicDTO extends Knowledgebase {
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
	declare permission?: KnowledgebasePermission

	@Expose()
	declare createdBy?: IUser

	constructor(partial: IKnowledgebase) {
		super()
		Object.assign(this, partial)
	}
}
