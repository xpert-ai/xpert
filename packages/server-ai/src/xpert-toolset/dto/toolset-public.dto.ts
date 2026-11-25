import { IUser, IXpertToolset, TToolCredentials, TXpertToolsetOptions } from '@xpert-ai/contracts'
import { UserPublicDTO } from '@xpert-ai/server-core'
import { Exclude, Expose, Transform } from 'class-transformer'

@Expose()
export class ToolsetPublicDTO implements IXpertToolset {
    name: string

    @Expose()
    @Transform(({ value }: { value?: TXpertToolsetOptions }) =>
        value?.capabilityBindingKey ? { capabilityBindingKey: value.capabilityBindingKey } : undefined
    )
    declare options: TXpertToolsetOptions

    @Exclude()
    declare credentials?: TToolCredentials

    @Transform(({ value }) => (value ? new UserPublicDTO(value) : null))
    @Expose()
    createdBy?: IUser

    @Transform(({ value }) => (value ? new UserPublicDTO(value) : null))
    @Expose()
    updatedBy?: IUser

    constructor(partial: Partial<ToolsetPublicDTO>) {
        Object.assign(this, partial)
    }
}
