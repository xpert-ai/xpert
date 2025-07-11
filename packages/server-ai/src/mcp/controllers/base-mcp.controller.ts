import { Controller, Get, Post, Req, Res, Inject } from '@nestjs/common';
import { Request, Response } from 'express';
import { MCPService } from '../mcp.service';
import { Public } from '@metad/server-auth';

/**
 * Base controller for MCP endpoints without throttling
 */
@Public()
@Controller()
export class BaseMCPController {
  constructor(
    @Inject('MCP_OPTIONS') protected readonly options: any,
    protected readonly mcpService: MCPService,
  ) {}

  /**
   * Handle SSE connection requests
   */
  @Get('mcp/sse')
  async sseHandler(@Req() req: Request, @Res() res: Response): Promise<void> {
    await this.mcpService.handleSSEConnection(req, res);
  }

  /**
   * Handle message POST requests
   */
  @Post('mcp/messages')
  async messagesHandler(@Req() req: Request, @Res() res: Response): Promise<void> {
    await this.mcpService.handleMessages(req, res);
  }
} 