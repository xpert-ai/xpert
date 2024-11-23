import { IToolProvider, TAvatar, ToolTagEnum } from '@metad/contracts'
import { Expose } from 'class-transformer'

@Expose()
export class ToolProviderDTO implements Partial<IToolProvider> {
	@Expose()
	avatar?: TAvatar

	icon?: string
	tags?: ToolTagEnum[]

	constructor(partial: Partial<IToolProvider>, baseUrl: string) {
		Object.assign(this, partial)

		this.avatar = partial.avatar ?? {
			url: baseUrl + (baseUrl.endsWith('/') ? '' : '/') + `api/xpert-toolset/builtin-provider/${partial.name}/icon`
		}
	}
}
