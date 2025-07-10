import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { MetadataScanner, Reflector } from '@nestjs/core';
import { DiscoveryService } from '@nestjs/core/discovery';

import { McpServer, ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { Request, Response } from 'express';

import { z } from 'zod';

import { MetadataKey } from './types/metadata.type';
import type { IResource, ITool, IPrompt } from './decorators';
import type { IMCPOptions } from './types';
import { NestSSEAdapter } from './transport/sse-transport';

export type TTransportType = 'stdio';

@Injectable()
export class MCPService implements OnModuleInit, OnModuleDestroy {
    private readonly logger = new Logger(MCPService.name);
    private server: McpServer;
    private stdioTransport: StdioServerTransport | null = null;
    private sseAdapter: NestSSEAdapter | null = null;

    constructor(
        private readonly options: IMCPOptions,
        private readonly discoveryService: DiscoveryService,
        private readonly metadataScanner: MetadataScanner,
        private readonly reflector: Reflector,
    ) {
        this.server = new McpServer({
            name: options.name,
            version: options.version,
            capabilities: options.capabilities || {},
        });
    }

    async onModuleInit() {
        await this.scanAndRegisterProviders();
        
        // Create the SSE adapter
        this.sseAdapter = new NestSSEAdapter({
            messagesEndpoint: this.options.messagesEndpoint || 'mcp/messages',
            sseEndpoint: this.options.sseEndpoint || 'mcp/sse',
            globalApiPrefix: this.options.globalApiPrefix || '',
        });
        
        // Initialize stdio transport if needed
        await this.setupStdioTransport();
    }

    async onModuleDestroy() {
        if (this.stdioTransport) {
            try {
                this.logger.log('Disconnecting stdio transport');
            } catch (error) {
                this.logger.error('Failed to disconnect stdio transport', error);
            }
        }
    }

    // Handle SSE connection from controller
    async handleSSEConnection(req: Request, res: Response): Promise<void> {
        if (!this.sseAdapter) {
            this.logger.error('SSE adapter not initialized');
            res.status(500).send('SSE transport not initialized');
            return;
        }
        
        try {
            // Create a new transport for this connection (not started)
            const transport = this.sseAdapter.handleSSE(req, res);
            
            // Connect the transport to the server
            // This will automatically start the transport - no need to call start() manually
            await this.server.connect(transport);
            this.logger.log('Connected SSE transport to server');
        } catch (error) {
            this.logger.error('Error handling SSE connection', error);
            if (!res.headersSent) {
                res.status(500).send('Error handling SSE connection');
            }
        }
    }

    // Handle messages from controller
    async handleMessages(req: Request, res: Response): Promise<void> {
        if (!this.sseAdapter) {
            this.logger.error('SSE adapter not initialized');
            if (!res.headersSent) {
                res.status(500).send('SSE transport not initialized');
            }
            return;
        }
        
        await this.sseAdapter.handleMessages(req, res);
    }

    private async setupStdioTransport() {
        try {
            if (this.options.enableStdio) {
                this.stdioTransport = new StdioServerTransport();
                await this.server.connect(this.stdioTransport);
                this.logger.log('MCP stdio transport connected');
            }
        } catch (error) {
            this.logger.error('Failed to setup MCP stdio transport', error);
            throw error;
        }
    }

    private async scanAndRegisterProviders() {
        const providers = this.discoveryService.getProviders();

        for (const provider of providers) {
            if (!provider.instance) continue;

            const instancePrototype = Object.getPrototypeOf(provider.instance);
            const methods = this.metadataScanner.getAllFilteredMethodNames(instancePrototype);

            for (const method of methods) {
                // Register resources
                const resourceMetadata: IResource = this.reflector.get(MetadataKey.MCP_RESOURCE, provider.instance[method]);

                if (resourceMetadata) {
                    this.registerResource(resourceMetadata, provider.instance, method);
                }

                // Register tools
                const toolMetadata: ITool = this.reflector.get(MetadataKey.MCP_TOOL, provider.instance[method]);

                if (toolMetadata) {
                    this.registerTool(toolMetadata, provider.instance, method);
                }

                // Register prompts
                const promptMetadata: IPrompt = this.reflector.get(MetadataKey.MCP_PROMPT, provider.instance[method]);

                if (promptMetadata) {
                    this.registerPrompt(promptMetadata, provider.instance, method);
                }
            }
        }
    }

    private registerResource(metadata: IResource, instance: any, methodName: string) {
        const { name, description, parameters } = metadata;

        const template = new ResourceTemplate(`${name}://{id}`, { list: undefined });

        this.server.resource(
            name,
            template,
            {
                description,
                parameters: parameters ? this.convertParametersToZod(parameters) : undefined,
            },
            async (uri: any, params: any) => {
                try {
                    // Execute the decorated method with the parameters
                    const result = await instance[methodName](uri, params);
                    return {
                        contents: Array.isArray(result) ? result : [result],
                    };
                } catch (error) {
                    this.logger.error(`Error executing resource '${name}'`, error);
                    throw error;
                }
            },
        );

        this.logger.log(`Registered MCP resource: ${name}`);
    }

    private registerTool(metadata: ITool, instance: any, methodName: string) {
        const { name, description, parameters } = metadata;

        // Tool parameters must be wrapped in an object for the server
        const schema = parameters ? this.convertParametersToZod(parameters) : {};

        // TypeScript doesn't understand the overload structure, we need to cast
        (this.server.tool as any)(
            name,
            schema,
            async (params: any) => {
                try {
                    // Execute the decorated method with the parameters
                    const result = await instance[methodName](params);
                    return {
                        content: Array.isArray(result) ? result : [{ type: 'text', text: String(result) }],
                    };
                } catch (error) {
                    this.logger.error(`Error executing tool '${name}'`, error);
                    throw error;
                }
            },
            { description },
        );

        this.logger.log(`Registered MCP tool: ${name}`);
    }

    private registerPrompt(metadata: IPrompt, instance: any, methodName: string) {
        const { name, description, template, parameters } = metadata;

        // TypeScript doesn't understand the overload structure, we need to cast
        (this.server.prompt as any)(
            name,
            template,
            parameters ? this.convertParametersToZod(parameters) : {},
            async (params: any) => {
                try {
                    // Execute the decorated method to get any dynamic parameters
                    const dynamicParams = await instance[methodName](params);
                    return {
                        ...params,
                        ...dynamicParams,
                    };
                } catch (error) {
                    this.logger.error(`Error executing prompt '${name}'`, error);
                    throw error;
                }
            },
            { description },
        );

        this.logger.log(`Registered MCP prompt: ${name}`);
    }

    private convertParametersToZod(parameters: any) {
        if (!parameters) return {};

        const zodSchema: Record<string, z.ZodType> = {};

        for (const [key, type] of Object.entries(parameters)) {
            // Simple conversion from common types to Zod types
            if (type === 'string') {
                zodSchema[key] = z.string();
            } else if (type === 'number') {
                zodSchema[key] = z.number();
            } else if (type === 'boolean') {
                zodSchema[key] = z.boolean();
            } else if (type === 'array') {
                zodSchema[key] = z.array(z.any());
            } else if (type === 'object') {
                zodSchema[key] = z.record(z.any());
            } else if (typeof type === 'object') {
                // If it's already a Zod schema, use it directly
                zodSchema[key] = type as z.ZodType;
            } else {
                // Default to any
                zodSchema[key] = z.any();
            }
        }

        return zodSchema;
    }
}
