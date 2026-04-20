import { Injectable } from '@nestjs/common'
import { AcpHarnessPreviewInput } from './acp-harness.types'
import { BaseCliHarnessAdapter, withTargetPathInstruction } from './base-cli-harness.adapter'

@Injectable()
export class ClaudeCodeCliHarnessAdapter extends BaseCliHarnessAdapter {
  readonly harnessType = 'claude_code' as const

  protected readonly commandVariableName = 'ACP_CLAUDE_CODE_CLI_COMMAND'
  protected readonly forwardedEnvironmentVariables = [
    'ANTHROPIC_API_KEY',
    'ANTHROPIC_AUTH_TOKEN',
    'ANTHROPIC_BASE_URL',
    'CLAUDE_CODE_OAUTH_TOKEN',
    'CLAUDE_CODE_USE_BEDROCK',
    'CLAUDE_CODE_USE_VERTEX'
  ] as const

  protected buildArguments(input: AcpHarnessPreviewInput): string[] {
    return [
      '--cwd',
      input.workingDirectory,
      '--print',
      '--output-format',
      'text',
      '--permission-mode',
      mapPermissionMode(input.permissionProfile),
      '-p',
      withTargetPathInstruction(input.prompt, input.targetPaths)
    ]
  }
}

function mapPermissionMode(profile: AcpHarnessPreviewInput['permissionProfile']): string {
  switch (profile) {
    case 'read_only':
      return 'default'
    case 'full_exec':
      return 'bypassPermissions'
    case 'workspace_write':
    default:
      return 'acceptEdits'
  }
}
