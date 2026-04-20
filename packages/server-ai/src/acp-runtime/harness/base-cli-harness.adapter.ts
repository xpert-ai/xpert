import { TEnvironmentVariable, TAcpPermissionProfile } from '@xpert-ai/contracts'
import { ExecuteResponse } from '@xpert-ai/plugin-sdk'
import { AcpHarnessExecutionInput, AcpHarnessPreviewInput, AcpHarnessResolvedConfiguration, IAcpHarnessAdapter } from './acp-harness.types'

const COMMON_AUTOMATION_ENV: Record<string, string> = {
  CI: '1',
  GIT_EDITOR: 'true',
  GIT_TERMINAL_PROMPT: '0',
  NO_COLOR: '1',
  PAGER: 'cat',
  VISUAL: 'true'
}

export abstract class BaseCliHarnessAdapter implements IAcpHarnessAdapter {
  abstract readonly harnessType: IAcpHarnessAdapter['harnessType']

  protected abstract readonly commandVariableName: string
  protected abstract readonly forwardedEnvironmentVariables: readonly string[]

  protected abstract buildArguments(input: AcpHarnessPreviewInput): string[]

  resolveConfiguration(variables: TEnvironmentVariable[]): AcpHarnessResolvedConfiguration {
    const variableMap = new Map<string, TEnvironmentVariable>()
    for (const variable of variables) {
      variableMap.set(variable.name, variable)
    }

    const commandVariable = variableMap.get(this.commandVariableName)
    if (!commandVariable?.value) {
      throw new Error(`Missing required environment variable "${this.commandVariableName}"`)
    }

    const environment = { ...COMMON_AUTOMATION_ENV }
    const redactedEnvironment: Record<string, string> = {}

    for (const name of this.forwardedEnvironmentVariables) {
      const variable = variableMap.get(name)
      if (!variable?.value) {
        continue
      }

      environment[name] = variable.value
      redactedEnvironment[name] = variable.type === 'secret' || isSensitiveKey(name) ? '[REDACTED]' : variable.value
    }

    return {
      command: commandVariable.value,
      environment,
      redactedEnvironment
    }
  }

  buildCommandPreview(configuration: AcpHarnessResolvedConfiguration, input: AcpHarnessPreviewInput): string {
    return [quoteShell(configuration.command), ...this.buildArguments(input).map(quoteShell)].join(' ')
  }

  async execute(input: AcpHarnessExecutionInput) {
    const configuration = this.resolveConfiguration(input.variables)
    const preview = this.buildCommandPreview(configuration, input)
    const command = buildEnvWrappedCommand(configuration.environment, preview)
    const response = await this.runCommand(command, input)

    return {
      status: this.resolveStatus(response, input.signal),
      exitCode: response.exitCode,
      output: response.output,
      summary: summarizeOutput(response),
      commandPreview: preview,
      timedOut: Boolean(response.timedOut)
    }
  }

  private async runCommand(command: string, input: AcpHarnessExecutionInput): Promise<ExecuteResponse> {
    if (typeof input.backend.streamExecute === 'function') {
      return input.backend.streamExecute(
        command,
        async (line) => {
          await input.onOutput?.(line)
        },
        {
          timeoutMs: input.timeoutMs
        }
      )
    }

    const response = await input.backend.execute(command, {
      timeoutMs: input.timeoutMs
    })

    if (response.output) {
      for (const line of response.output.split('\n')) {
        if (!line) {
          continue
        }
        await input.onOutput?.(line)
      }
    }

    return response
  }

  private resolveStatus(response: ExecuteResponse, signal?: AbortSignal): 'success' | 'error' | 'timeout' | 'canceled' {
    if (signal?.aborted) {
      return 'canceled'
    }
    if (response.timedOut) {
      return 'timeout'
    }
    if (response.exitCode === 0) {
      return 'success'
    }
    return 'error'
  }
}

function buildEnvWrappedCommand(environment: Record<string, string>, preview: string): string {
  const assignments = Object.entries(environment).map(([key, value]) => `${key}=${quoteShell(value)}`)
  return assignments.length > 0 ? `env ${assignments.join(' ')} ${preview}` : preview
}

function summarizeOutput(response: ExecuteResponse): string {
  if (response.timedOut) {
    return 'Command timed out.'
  }

  if (!response.output) {
    return response.exitCode === 0 ? 'Command completed successfully.' : 'Command failed without output.'
  }

  const lines = response.output
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)

  return lines[lines.length - 1] ?? response.output
}

function isSensitiveKey(value: string): boolean {
  return /(secret|token|authorization|api[-_]?key|password|cookie|header)/i.test(value)
}

export function quoteShell(value: string): string {
  return `'${value.replace(/'/g, `'\"'\"'`)}'`
}

export function normalizePermissionSandbox(profile: TAcpPermissionProfile): string {
  switch (profile) {
    case 'read_only':
      return 'read-only'
    case 'full_exec':
      return 'danger-full-access'
    case 'workspace_write':
    default:
      return 'workspace-write'
  }
}

export function withTargetPathInstruction(prompt: string, targetPaths?: string[]): string {
  if (!Array.isArray(targetPaths) || targetPaths.length === 0) {
    return prompt
  }

  return `${prompt}\n\nLimit edits to these paths when possible:\n${targetPaths.map((path) => `- ${path}`).join('\n')}`
}
