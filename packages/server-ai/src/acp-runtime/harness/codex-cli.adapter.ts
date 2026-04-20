import { Injectable } from '@nestjs/common'
import { AcpHarnessPreviewInput } from './acp-harness.types'
import { BaseCliHarnessAdapter, normalizePermissionSandbox, withTargetPathInstruction } from './base-cli-harness.adapter'

@Injectable()
export class CodexCliHarnessAdapter extends BaseCliHarnessAdapter {
  readonly harnessType = 'codex' as const

  protected readonly commandVariableName = 'ACP_CODEX_CLI_COMMAND'
  protected readonly forwardedEnvironmentVariables = [
    'OPENAI_API_KEY',
    'OPENAI_BASE_URL',
    'OPENAI_ORG_ID',
    'CODEX_API_KEY',
    'CODEX_HOME'
  ] as const

  protected buildArguments(input: AcpHarnessPreviewInput): string[] {
    return [
      'exec',
      '--ask-for-approval',
      'never',
      '--sandbox',
      normalizePermissionSandbox(input.permissionProfile),
      withTargetPathInstruction(input.prompt, input.targetPaths)
    ]
  }
}
