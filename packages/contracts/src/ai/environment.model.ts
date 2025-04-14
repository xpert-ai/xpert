import { IBasePerWorkspaceEntityModel } from "./xpert-workspace.model"

export type TEnvironmentVariable = {
    name: string
    value: string
    type: 'default' | 'secret'
    /**
     * Has owner, private variable
     */
    owner?: string
}

export interface IEnvironment extends IBasePerWorkspaceEntityModel {
    name: string
    isDefault?: boolean
    isArchived?: boolean
    variables: TEnvironmentVariable[]
}
