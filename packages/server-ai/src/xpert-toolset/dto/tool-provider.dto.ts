import { IToolProvider, TAvatar, ToolTagEnum } from '@xpert-ai/contracts'
import { Expose } from 'class-transformer'

@Expose()
export class ToolProviderDTO implements Partial<IToolProvider> {
	@Expose()
	avatar?: TAvatar

	icon?: string
	tags?: ToolTagEnum[]

	constructor(partial: Partial<IToolProvider>, baseUrl: string, organizationId?: string | null) {
		Object.assign(this, partial)

		const url = baseUrl + (baseUrl.endsWith('/') ? '' : '/') + `api/xpert-toolset/builtin-provider/${partial.name}/icon`
		this.avatar = partial.avatar ?? {
			url: organizationId ? `${url}?org=${encodeURIComponent(organizationId)}` : url
		}
	}
}
