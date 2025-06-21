import { IWFNClassifier, XpertParameterTypeEnum } from '@metad/contracts'

export function classifierOutputVariables(entity: IWFNClassifier) {
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