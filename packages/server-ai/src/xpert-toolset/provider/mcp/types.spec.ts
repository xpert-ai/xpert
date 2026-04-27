const mockClients: any[] = []

jest.mock('@langchain/mcp-adapters', () => ({
  MultiServerMCPClient: jest.fn().mockImplementation(function (this: any, config: unknown) {
    this.config = config
    this.getTools = jest.fn().mockResolvedValue([])
    this.close = jest.fn()
    mockClients.push(this)
  })
}))

jest.mock('@langchain/core/callbacks/dispatch', () => ({
  dispatchCustomEvent: jest.fn()
}))

jest.mock('@xpert-ai/server-config', () => ({
  environment: {
    production: false
  }
}))

jest.mock('@xpert-ai/server-core', () => ({
  runScript: jest.fn()
}))

jest.mock('i18next', () => ({
  t: (key: string) => key
}))

import { createMCPClient } from './types'

describe('createMCPClient', () => {
  beforeEach(() => {
    mockClients.length = 0
  })

  it('injects Codexpert identity headers and keeps connection authorization', async () => {
    await createMCPClient(
      {
        id: 'toolset-1',
        name: 'Codexpert Context'
      },
      {
        servers: {
          'codexpert-context': {
            type: 'http',
            url: 'http://codexpert.test/mcp',
            headers: {
              Authorization: 'Bearer {{ token }}',
              'x-principal-user-id': 'schema-user'
            }
          }
        }
      } as any,
      {
        token: 'secret-token'
      },
      {
        principal: {
          tenantId: 'tenant-1',
          organizationId: 'org-1',
          userId: 'user-1'
        }
      }
    )

    expect(mockClients[0].config.mcpServers['codexpert-context'].headers).toEqual({
      Authorization: 'Bearer secret-token',
      'tenant-id': 'tenant-1',
      'organization-id': 'org-1',
      'x-principal-user-id': 'user-1'
    })
  })

  it('does not inject business identity headers into non-Codexpert MCP servers', async () => {
    await createMCPClient(
      {
        id: 'toolset-1',
        name: 'Other MCP'
      },
      {
        servers: {
          other: {
            type: 'http',
            url: 'http://other.test/mcp',
            headers: {
              Authorization: 'Bearer {{ token }}'
            }
          }
        }
      } as any,
      {
        token: 'secret-token'
      }
    )

    expect(mockClients[0].config.mcpServers.other.headers).toEqual({
      Authorization: 'Bearer secret-token'
    })
  })

  it('fails Codexpert MCP when the business principal is missing', async () => {
    await expect(
      createMCPClient(
        {
          id: 'toolset-1',
          name: 'Codexpert Context'
        },
        {
          servers: {
            'codexpert-context': {
              type: 'http',
              url: 'http://codexpert.test/mcp'
            }
          }
        } as any,
        {}
      )
    ).rejects.toThrow('Missing BusinessPrincipal for Codexpert MCP server "codexpert-context"')
  })
})
