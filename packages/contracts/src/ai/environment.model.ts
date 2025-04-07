import { IBasePerWorkspaceEntityModel } from "./xpert-workspace.model"

export type TEnvironmentVariable = {
    name: string
    value: string
    type: 'default' | 'secret'
}

export interface IEnvironment extends IBasePerWorkspaceEntityModel {
    name: string
    isArchived?: boolean
    variables: TEnvironmentVariable[]
}
