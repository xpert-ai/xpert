import { XpertParameterTypeEnum } from '@xpert-ai/contracts'
import { BaseToolset } from '../../../xpert-toolset'
import { XpertAgentVariableSchemaQuery } from '../get-variable-schema.query'
import { XpertAgentVariableSchemaHandler } from './get-variable-schema.handler'

describe('XpertAgentVariableSchemaHandler', () => {
    it('closes loaded toolsets before returning a matching variable schema', async () => {
        const close = jest.fn<Promise<void>, []>().mockResolvedValue(undefined)
        const commandBus = {
            execute: jest.fn().mockResolvedValue([
                {
                    getVariables: jest.fn().mockResolvedValue([
                        {
                            name: 'result',
                            type: XpertParameterTypeEnum.STRING
                        }
                    ]),
                    close
                } as unknown as BaseToolset
            ])
        }
        const xpertService = {
            findOne: jest.fn().mockResolvedValue({
                workspaceId: 'workspace-1',
                graph: {
                    nodes: [
                        {
                            type: 'agent',
                            entity: {
                                toolsetIds: ['toolset-1']
                            }
                        }
                    ]
                }
            })
        }
        const handler = new XpertAgentVariableSchemaHandler(xpertService as never, commandBus as never)

        await expect(
            handler.execute(
                new XpertAgentVariableSchemaQuery({
                    xpertId: 'xpert-1',
                    variable: 'result'
                })
            )
        ).resolves.toMatchObject({ name: 'result' })
        expect(close).toHaveBeenCalledTimes(1)
    })
})
