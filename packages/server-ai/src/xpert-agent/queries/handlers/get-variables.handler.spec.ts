import {
    channelName,
    getVariableSchema,
    IWFNIterator,
    IteratorItemParameterName,
    TWorkflowVarGroup,
    WorkflowNodeTypeEnum,
    XpertParameterTypeEnum
} from '@xpert-ai/contracts'
import { refreshWorkflowInputVariableGroups } from './get-variables.utils'

describe('refreshWorkflowInputVariableGroups', () => {
    it('recomputes iterator item schema after upstream tool parameters are available', () => {
        const iterator: IWFNIterator = {
            id: 'iterator-id',
            key: 'Iterator_File',
            title: 'Iterate files',
            type: WorkflowNodeTypeEnum.ITERATOR,
            inputVariable: 'agenttool_process_channel.args.file_to_process',
            outputParams: []
        }
        const varGroups: TWorkflowVarGroup[] = [
            {
                group: {
                    name: channelName(iterator.key),
                    description: iterator.title
                },
                variables: [
                    {
                        name: IteratorItemParameterName,
                        type: XpertParameterTypeEnum.STRING,
                        description: 'Stale item schema'
                    }
                ]
            },
            {
                group: {
                    name: 'agenttool_process_channel',
                    description: 'Process one file'
                },
                variables: [
                    {
                        name: 'args.file_to_process',
                        type: XpertParameterTypeEnum.ARRAY,
                        description: 'Files',
                        item: [
                            {
                                name: 'fileType',
                                type: XpertParameterTypeEnum.STRING,
                                description: 'File type'
                            }
                        ]
                    }
                ]
            }
        ]

        refreshWorkflowInputVariableGroups(varGroups, new Map([[iterator.key, iterator]]), new Set([iterator.key]), {
            get: () => ({
                inputVariables: (entity, variables?: TWorkflowVarGroup[]) => {
                    if (!('inputVariable' in entity) || typeof entity.inputVariable !== 'string') {
                        return []
                    }
                    const schema = getVariableSchema(variables, entity.inputVariable).variable
                    return [
                        {
                            name: IteratorItemParameterName,
                            type: XpertParameterTypeEnum.OBJECT,
                            item: schema?.item,
                            description: 'Current item'
                        }
                    ]
                }
            })
        })

        const iteratorGroup = varGroups.find((group) => group.group?.name === channelName(iterator.key))
        const itemVariable = iteratorGroup?.variables.find((variable) => variable.name === IteratorItemParameterName)

        expect(itemVariable?.type).toBe(XpertParameterTypeEnum.OBJECT)
        expect(itemVariable?.item?.map((item) => item.name)).toEqual(['fileType'])
    })
})
