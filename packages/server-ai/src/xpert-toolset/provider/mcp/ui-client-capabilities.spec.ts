import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { installMcpUiClientCapabilitiesBridge } from './ui-client-capabilities'

it('advertises result UI support in the SDK handshake without losing existing capabilities', async () => {
    installMcpUiClientCapabilitiesBridge()
    installMcpUiClientCapabilitiesBridge()
    const client = new Client({ name: 'test-host', version: '1' }, { capabilities: { roots: { listChanged: true } } })
    const server = new Server({ name: 'test-server', version: '1' }, { capabilities: {} })
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
    try {
        await server.connect(serverTransport)
        await client.connect(clientTransport)
        expect(server.getClientCapabilities()).toMatchObject({
            roots: { listChanged: true },
            elicitation: { form: {}, url: {} },
            experimental: { 'ai.xpert/tool-result-ui': { version: 1 } },
            extensions: {
                'io.modelcontextprotocol/ui': { mimeTypes: ['text/html;profile=mcp-app'] }
            }
        })
    } finally {
        await client.close()
        await server.close()
    }
})
