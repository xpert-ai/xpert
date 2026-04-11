import { IUser } from '@xpert-ai/contracts'
import { Exclude, Expose } from 'class-transformer'

@Exclude()
export class StoryTemplatePublicDTO {
	@Expose({
		name: 'id'
	})
	storyTemplate_id: string

	@Expose({
		name: 'key'
	})
	storyTemplate_key: string

	@Expose({
		name: 'name'
	})
	storyTemplate_name: string

	@Expose({
		name: 'description'
	})
	storyTemplate_description: string

	@Expose({
		name: 'storyId'
	})
	storyTemplate_storyId: string

	@Expose()
	createdBy?: IUser

	@Expose()
	previewUrl: string

	@Expose()
	storyCount: number

	constructor(partial: Partial<any>) {
		Object.assign(this, partial)

		this.createdBy = {
			firstName: partial.createdBy_firstName,
			lastName: partial.createdBy_lastName,
			email: partial.createdBy_email,
			imageUrl: partial.createdBy_imageUrl
		}
	}
}
