import { IEnvironment, IUser } from '@xpert-ai/contracts'
import { UserPublicDTO } from '@xpert-ai/server-core'
import { Exclude, Expose, Transform } from 'class-transformer'

@Expose()
export class WorkspacePublicDTO {
    @Transform(({ value }) => value && new UserPublicDTO(value))
    @Expose()
    owner?: IUser

    @Exclude()
    members?: IUser[]

    @Exclude()
    environments?: IEnvironment[] | null

    constructor(partial: Partial<WorkspacePublicDTO>) {
        Object.assign(this, partial)
    }
}
