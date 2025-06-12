import { TWorkflowVarGroup } from "../ai";

/**
 * 
 * Returns the variable schema for a given variable name.
 * The variable name can be in the format of 'groupName.variableName' or just 'variableName'.
 * If the variable starts with 'sys.', it is treated as a group name.
 * 
 * @param variables 
 * @param variable 
 * @returns 
 */
export function getVariableSchema(variables: TWorkflowVarGroup[], variable: string) {
    const [groupName, name] = variable?.startsWith('sys.') ? [variable] : (variable?.split('.') ?? [])

    const group = variables?.find((_) => (name ? _.group?.name === groupName : !_.group?.name))

    return {
        group,
        variable: group?.variables.find((_) => _.name === (name ?? groupName))
    }
}