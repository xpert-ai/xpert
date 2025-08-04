import { IWorkflowNode, XpertParameterTypeEnum } from "@metad/contracts";

export const WORKFLOW_ANSWER_MESSAGES_CHANNEL = 'messages';

export function answerOutputVariables(entity: IWorkflowNode) {
    return [
        {
            type: XpertParameterTypeEnum.ARRAY,
            name: WORKFLOW_ANSWER_MESSAGES_CHANNEL,
            title: 'Messages',
            description: {
                en_US: 'AI Message',
                zh_Hans: 'AI 消息'
            }
        },
    ]
}
