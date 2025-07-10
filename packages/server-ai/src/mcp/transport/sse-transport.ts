import { Logger } from '@nestjs/common';

import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { Request, Response } from 'express';

/**
 * Custom SSE transport adapter that connects NestJS HTTP to the MCP SDK
 */
export class NestSSEAdapter {
    private logger = new Logger('NestSSEAdapter');
    private activeTransports: Map<string, SSEServerTransport> = new Map();
    private serverReady = false;

    constructor(
        private options: {
            messagesEndpoint: string;
            sseEndpoint: string;
            globalApiPrefix?: string;
        },
    ) {}

    /**
     * Create a new transport for a response
     */
    public createTransport(res: Response): SSEServerTransport {
        const messagesUrl = `${this.options.globalApiPrefix || ''}/${this.options.messagesEndpoint}`;
        // Create a new transport with the endpoint and response object
        const transport = new SSEServerTransport(messagesUrl, res);
        
        // Store session ID for later message handling
        const sessionId = (transport as any)._sessionId;
        
        // Add to active transports map
        this.activeTransports.set(sessionId, transport);
        
        // Handle cleanup when connection closes
        res.on('close', () => {
            this.logger.log(`SSE connection closed for session: ${sessionId}`);
            this.activeTransports.delete(sessionId);
        });
        
        this.logger.log(`Created SSE transport with session ID: ${sessionId}`);
        return transport;
    }

    /**
     * Get all active transports
     */
    public getActiveTransports(): SSEServerTransport[] {
        return Array.from(this.activeTransports.values());
    }

    /**
     * Set server ready state - used to track if the server is connected
     */
    public setServerReady(ready: boolean): void {
        this.serverReady = ready;
    }

    /**
     * Check if the server is ready
     */
    public isServerReady(): boolean {
        return this.serverReady;
    }

    /**
     * Handle an SSE connection request
     * @param req The HTTP request
     * @param res The HTTP response
     * @returns The created transport (NOT started - the server will start it)
     */
    public handleSSE(req: Request, res: Response): SSEServerTransport {
        try {
            // Create a new transport for this connection
            // DO NOT start it - McpServer.connect() will do that
            return this.createTransport(res);
        } catch (error) {
            this.logger.error('Error creating SSE transport', error);
            // Only send error if headers not sent yet
            if (!res.headersSent) {
                res.status(500).send('Error creating SSE transport');
            }
            
            // We need to throw to propagate the error
            throw error;
        }
    }

    /**
     * Handle a messages endpoint request
     */
    public async handleMessages(req: Request, res: Response): Promise<void> {
        // Get the session ID from query params
        const sessionId = req.query.sessionId as string;
        
        if (!sessionId || !this.activeTransports.has(sessionId)) {
            res.status(404).send('Session not found');
            return;
        }
        
        const transport = this.activeTransports.get(sessionId);
        
        try {
            // Using the transport's method to handle the incoming message
            await transport.handlePostMessage(req, res, req.body);
        } catch (error) {
            this.logger.error('Error handling message', error);
            if (!res.headersSent) {
                res.status(500).json({ error: 'Internal server error' });
            }
            
            // Throw to propagate the error
            throw error;
        }
    }
}
