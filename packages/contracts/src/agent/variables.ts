import { TWorkflowVarGroup } from "../ai";

export function getVariableSchema(variables: TWorkflowVarGroup[], variable: string) {
    const [groupName, name] = variable?.startsWith('sys.') ? [variable] : (variable?.split('.') ?? [])

    const group = variables?.find((_) => (name ? _.group?.name === groupName : !_.group?.name))

    return {
        group,
        variable: group?.variables.find((_) => _.name === (name ?? groupName))
    }
}