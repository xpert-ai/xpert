import { Test, TestingModule } from '@nestjs/testing'
import { QueryBus } from '@nestjs/cqrs'
import { ToolsetRegistry } from '@xpert-ai/plugin-sdk'
import { ListBuiltinCredentialsSchemaHandler } from './list-builtin-credentials-schema.handler'
import { ListBuiltinCredentialsSchemaQuery } from '../list-builtin-credentials-schema.query'
import { ToolProviderNotFoundError } from '../../errors'

describe('ListBuiltinCredentialsSchemaHandler', () => {
  let handler: ListBuiltinCredentialsSchemaHandler
  let queryBus: QueryBus

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ListBuiltinCredentialsSchemaHandler,
        {
          provide: QueryBus,
          useValue: {
            execute: jest.fn()
          }
        },
        {
          provide: ToolsetRegistry,
          useValue: {
            get: jest.fn(() => {
              throw new Error('not a plugin toolset')
            })
          }
        }
      ]
    }).compile()

    handler = module.get<ListBuiltinCredentialsSchemaHandler>(ListBuiltinCredentialsSchemaHandler)
    queryBus = module.get<QueryBus>(QueryBus)
  })

  it('should be defined', () => {
    expect(handler).toBeDefined()
  })

  it('should return credentials schema for a valid provider', async () => {
    const provider = 'validProvider'
    const credentialsSchema = [{ name: 'apiKey', type: 'string' }]
    jest.spyOn(queryBus, 'execute').mockResolvedValueOnce([{ credentials_for_provider: { apiKey: { type: 'string' } } }])

    const result = await handler.execute(new ListBuiltinCredentialsSchemaQuery(provider))

    expect(result).toEqual(credentialsSchema)
  })

  it('should throw ToolProviderNotFoundError for an invalid provider', async () => {
    const provider = 'invalidProvider'
    jest.spyOn(queryBus, 'execute').mockResolvedValueOnce([])

    await expect(handler.execute(new ListBuiltinCredentialsSchemaQuery(provider))).rejects.toThrow(
      new ToolProviderNotFoundError(`Not found tool provider '${provider}'`)
    )
  })
})
