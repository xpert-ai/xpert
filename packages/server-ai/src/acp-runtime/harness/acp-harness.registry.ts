import { THarnessType } from '@xpert-ai/contracts'
import { Injectable } from '@nestjs/common'
import { ClaudeCodeCliHarnessAdapter } from './claude-code-cli.adapter'
import { CodexCliHarnessAdapter } from './codex-cli.adapter'
import { IAcpHarnessAdapter } from './acp-harness.types'

@Injectable()
export class AcpHarnessRegistry {
  constructor(
    private readonly codexAdapter: CodexCliHarnessAdapter,
    private readonly claudeAdapter: ClaudeCodeCliHarnessAdapter
  ) {}

  get(harnessType: THarnessType): IAcpHarnessAdapter {
    switch (harnessType) {
      case 'codex':
        return this.codexAdapter
      case 'claude_code':
        return this.claudeAdapter
      default:
        throw new Error(`Unsupported ACP harness: ${harnessType}`)
    }
  }
}
