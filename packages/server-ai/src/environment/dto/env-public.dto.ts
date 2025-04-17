import { TEnvironmentVariable } from '@metad/contracts'
import { omit } from '@metad/server-common'
import { Expose, Transform } from 'class-transformer'
import { Environment } from '../environment.entity'

@Expose()
export class EnvironmentPublicDTO {
	@Expose()
	@Transform(({ value }) => value?.map((_) => omit(_, 'value')))
	variables: TEnvironmentVariable[]

	constructor(partial: Partial<EnvironmentPublicDTO | Environment>) {
		Object.assign(this, partial)
	}
}
