import { IWFNKnowledgeRetrieval, XpertParameterTypeEnum } from '@metad/contracts'

export function knowledgeOutputVariables(knowledge: IWFNKnowledgeRetrieval) {
	return [
		{
            type: XpertParameterTypeEnum.ARRAY,
            name: 'result',
            title: 'Retrieval segmented data',
            description: {
                en_US: 'Retrieval segmented data',
                zh_Hans: '检索分段数据'
            },
            item: [
                {
                    type: XpertParameterTypeEnum.STRING,
                    name: 'content',
                },
                {
                    type: XpertParameterTypeEnum.OBJECT,
                    name: 'metadata',
                }
            ]
        }
	]
}