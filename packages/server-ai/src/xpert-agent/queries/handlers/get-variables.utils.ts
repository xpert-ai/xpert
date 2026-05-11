import { channelName, IWorkflowNode, TWorkflowVarGroup, TXpertParameter } from '@xpert-ai/contracts'

type TInputVariableNodeRegistry = {
    get(type: string): {
        inputVariables?: (entity: IWorkflowNode, variables?: TWorkflowVarGroup[]) => TXpertParameter[]
    }
}

export function refreshWorkflowInputVariableGroups(
    varGroups: TWorkflowVarGroup[],
    workflowEntitiesByKey: Map<string, IWorkflowNode>,
    inputKeys: Set<string>,
    nodeRegistry: TInputVariableNodeRegistry
) {
    for (const key of inputKeys) {
        const entity = workflowEntitiesByKey.get(key)
        if (!entity) {
            continue
        }

        try {
            const creator = nodeRegistry.get(entity.type)
            if (!creator.inputVariables) {
                continue
            }

            const variables = creator.inputVariables(entity, varGroups)
            const groupName = channelName(entity.key)
            const group = varGroups.find((item) => item.group?.name === groupName)
            if (group) {
                group.variables = variables
            } else {
                varGroups.push({
                    group: {
                        name: groupName,
                        description: entity.title || {
                            en_US: entity.key
                        }
                    },
                    variables
                })
            }
        } catch (error) {
            console.error(`Error refreshing input variables for node ${key}:`, error)
        }
    }
}
