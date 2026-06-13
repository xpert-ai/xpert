import { IWFNIterator, TXpertTeamDraft, TXpertTeamNode, WorkflowNodeTypeEnum } from '@xpert-ai/contracts'
import { WorkflowIteratorNodeValidator } from './validator'

describe('WorkflowIteratorNodeValidator', () => {
    let validator: WorkflowIteratorNodeValidator

    const createIteratorNode = (overrides: Partial<IWFNIterator> = {}): TXpertTeamNode<'workflow'> => {
        const entity: IWFNIterator = {
            id: 'Iterator_1',
            key: 'Iterator_1',
            type: WorkflowNodeTypeEnum.ITERATOR,
            title: 'Iterator',
            inputVariable: 'start.items',
            outputParams: [
                {
                    name: 'result',
                    variable: 'answer_channel.output'
                }
            ],
            ...overrides
        }

        return {
            type: 'workflow',
            key: entity.key,
            position: { x: 0, y: 0 },
            entity
        }
    }

    const createDraft = (node: TXpertTeamNode<'workflow'>): TXpertTeamDraft => ({
        team: {
            id: 'xpert-1'
        },
        nodes: [node],
        connections: []
    })

    beforeEach(() => {
        validator = new WorkflowIteratorNodeValidator()
    })

    it('returns an error when input variable is empty', () => {
        const results = validator.handle({
            draft: createDraft(createIteratorNode({ inputVariable: '' }))
        })

        expect(results).toEqual([
            {
                node: 'Iterator_1',
                ruleCode: 'ITERATOR_INPUT_VARIABLE_EMPTY',
                field: 'inputVariable',
                value: '',
                message: {
                    en_US: 'Iterator node must have an input variable.',
                    zh_Hans: '迭代节点必须设置输入变量。'
                },
                level: 'error'
            }
        ])
    })

    it('returns an error when output variables are empty', () => {
        const results = validator.handle({
            draft: createDraft(createIteratorNode({ outputParams: [] }))
        })

        expect(results).toEqual([
            {
                node: 'Iterator_1',
                ruleCode: 'ITERATOR_OUTPUT_PARAMS_EMPTY',
                field: 'outputParams',
                value: '[]',
                message: {
                    en_US: 'Iterator node must have at least one output variable.',
                    zh_Hans: '迭代节点必须至少设置一个输出变量。'
                },
                level: 'error'
            }
        ])
    })

    it('returns errors when an output variable item is incomplete', () => {
        const results = validator.handle({
            draft: createDraft(
                createIteratorNode({
                    outputParams: [
                        {
                            name: '',
                            variable: ''
                        }
                    ]
                })
            )
        })

        expect(results).toEqual([
            {
                node: 'Iterator_1',
                ruleCode: 'ITERATOR_OUTPUT_PARAM_NAME_EMPTY',
                field: 'outputParams[0].name',
                value: '',
                message: {
                    en_US: 'Iterator output variable name is empty.',
                    zh_Hans: '迭代节点的输出变量名称为空。'
                },
                level: 'error'
            },
            {
                node: 'Iterator_1',
                ruleCode: 'ITERATOR_OUTPUT_PARAM_VARIABLE_EMPTY',
                field: 'outputParams[0].variable',
                value: '',
                message: {
                    en_US: 'Iterator output variable selector is empty.',
                    zh_Hans: '迭代节点的输出变量选择器为空。'
                },
                level: 'error'
            }
        ])
    })

    it('passes when required iterator fields are configured', () => {
        const results = validator.handle({
            draft: createDraft(createIteratorNode())
        })

        expect(results).toEqual([])
    })
})
