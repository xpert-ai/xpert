import { IWorkflowNode, XpertParameterTypeEnum } from '@metad/contracts'

export function classifierOutputVariables(entity: IWorkflowNode) {
    return [
        {
            type: XpertParameterTypeEnum.NUMBER,
            name: 'category',
            title: 'Category Index',
            description: {
                en_US: 'Category Index',
                zh_Hans: '分类索引'
            },
        }
    ]
}