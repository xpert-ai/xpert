import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { mcpAppClientCapabilities } from '../../../mcp-consumer/mcp-app-capabilities'
import { installMcpToolSchemaBridge } from '../../../mcp-consumer/tools/mcp-consumer-tool-schema'

let installed = false

export function installMcpUiClientCapabilitiesBridge(): void {
    installMcpToolSchemaBridge()
    if (installed) {
        return
    }
    installed = true

    const prototype = Client.prototype
    const originalConnect = prototype.connect
    prototype.connect = async function connectWithMcpAppsCapability(
        this: Client,
        ...args: Parameters<Client['connect']>
    ) {
        if (!this.transport && typeof this.registerCapabilities === 'function') {
            this.registerCapabilities({
                elicitation: {
                    form: {},
                    url: {}
                },
                ...mcpAppClientCapabilities()
            })
        }
        return originalConnect.apply(this, args)
    } as Client['connect']
}
