// Interface for MCP Module configuration options
export interface IMCPOptions {
    /** The name of the MCP server */
    name: string;
    /** The version of the MCP server */
    version: string;
    /** Endpoint for SSE connections */
    sseEndpoint?: string;
    /** Endpoint for HTTP messages */
    messagesEndpoint?: string;
    /** Global API prefix */
    globalApiPrefix?: string;
    /** Server capabilities */
    capabilities?: Record<string, any>;
    /** Enable stdio transport */
    enableStdio?: boolean;
}
