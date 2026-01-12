import { TWorkflowVarGroup } from "../ai/xpert-workflow.model"
import { TXpertParameter, XpertParameterTypeEnum } from "../ai/xpert.model"

/**
 * 
 * Returns the variable schema for a given variable name.
 * The variable name can be in the format of 'groupName.variableName' or just 'variableName'.
 * 
 * @param variables 
 * @param variable 
 * @returns 
 */
export function getVariableSchema(variables: TWorkflowVarGroup[], variable: string) {
    const [groupName, ...rest] = variable?.split('.') ?? []
    const group = variables?.find((_) => (rest.length ? _.group?.name === groupName : !_.group?.name))
    const selectVariable = group?.variables.find((_) => _.name === (rest.join('.') || groupName))

    return {
        group,
        variable: selectVariable
    }
}

export const FILE_VARIABLES: TXpertParameter[] = [
    {
        name: 'filePath',
        type: XpertParameterTypeEnum.STRING,
        description: {
            en_US: 'The path to the file',
            zh_Hans: '文件的路径'
        },

    },
    {
        name: 'fileName',
        type: XpertParameterTypeEnum.STRING,
        description: {
            en_US: 'The name of the file',
            zh_Hans: '文件的名称'
        },
    },
    {
        name: 'fileUrl',
        type: XpertParameterTypeEnum.STRING,
        description: {
            en_US: 'The URL of the file',
            zh_Hans: '文件的URL地址'
        },
    },
    {
        name: 'fileSize',
        type: XpertParameterTypeEnum.NUMBER,
        description: {
            en_US: 'The size of the file in bytes',
            zh_Hans: '文件的大小，单位为字节'
        },
    },
    {
        name: 'mimeType',
        type: XpertParameterTypeEnum.STRING,
        description: {
            en_US: 'The MIME type of the file',
            zh_Hans: '文件的MIME类型'
        },
    }
]