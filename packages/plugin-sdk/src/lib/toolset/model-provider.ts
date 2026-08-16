import type { StructuredToolInterface } from '@langchain/core/tools'
import { AiModelTypeEnum, type IXpertToolset, type TToolCredentials } from '@xpert-ai/contracts'
import { type AIGCModelClient, type AsyncAIGCModelClient } from '../ai-model'
import {
  WorkspaceFilesRuntimeCapability,
  type RuntimeCapabilityResolver,
  type WorkspaceFileScope,
  type WorkspaceFilesApi
} from '../runtime'
import { BuiltinToolset, type TBuiltinToolsetParams, type TToolModelProviderRuntime } from './builtin'

export type ModelProviderAuthorizationScheme = 'Bearer' | 'ApiKey'

export type ModelProviderBuiltinToolsetOptions = {
  toolsetProviderName: string
  modelProviderName: string
  authorizationScheme: ModelProviderAuthorizationScheme
  invalidCredentialsMessage: string
  missingProviderMessage: string
  missingWorkspaceMessage: string
}

/**
 * Shared host-runtime plumbing for built-in tools backed by a configured model provider.
 * Provider request/response semantics remain owned by each plugin.
 */
export abstract class ModelProviderBuiltinToolset<
  T extends StructuredToolInterface = StructuredToolInterface,
  C = TToolCredentials
> extends BuiltinToolset<T, C> {
  private modelProvider?: Promise<TToolModelProviderRuntime>

  constructor(
    private readonly modelProviderOptions: ModelProviderBuiltinToolsetOptions,
    toolset?: IXpertToolset,
    private readonly runtimeCapabilities?: RuntimeCapabilityResolver,
    params?: TBuiltinToolsetParams
  ) {
    super(modelProviderOptions.toolsetProviderName, toolset, params)
  }

  override async _validateCredentials(_credentials: C): Promise<void> {
    void _credentials
    await this.getModelProviderRuntime()
  }

  protected getModelProviderRuntime(): Promise<TToolModelProviderRuntime> {
    if (!this.modelRuntime?.getModelProvider) {
      throw new Error(this.modelProviderOptions.missingProviderMessage)
    }
    this.modelProvider ??= this.modelRuntime.getModelProvider(this.modelProviderOptions.modelProviderName)
    return this.modelProvider
  }

  protected getModelProviderCredential(modelProvider: TToolModelProviderRuntime): string {
    const scheme = this.modelProviderOptions.authorizationScheme
    const match = new RegExp(`^${scheme}\\s+(.+)$`, 'i').exec(modelProvider.authorization.trim())
    if (!match?.[1]) {
      throw new Error(this.modelProviderOptions.invalidCredentialsMessage)
    }
    return match[1]
  }

  protected getWorkspaceFiles(): WorkspaceFilesApi {
    const workspaceFiles = this.runtimeCapabilities?.get(WorkspaceFilesRuntimeCapability)
    if (!workspaceFiles) {
      throw new Error(this.modelProviderOptions.missingWorkspaceMessage)
    }
    return workspaceFiles
  }

  protected createWorkspaceScope(): WorkspaceFileScope | undefined {
    const projectId = normalizeOptionalString(this.params?.projectId)
    if (projectId) {
      return {
        tenantId: normalizeOptionalString(this.params?.tenantId),
        userId: normalizeOptionalString(this.params?.userId),
        catalog: 'projects',
        scopeId: projectId,
        projectId
      }
    }

    const xpertId = normalizeOptionalString(this.xpertId)
    if (!xpertId) return undefined
    return {
      tenantId: normalizeOptionalString(this.params?.tenantId),
      userId: normalizeOptionalString(this.params?.userId),
      catalog: 'xperts',
      scopeId: xpertId,
      xpertId,
      isolateByUser: false
    }
  }

  protected async createAsyncModelClient<TInput, TData>(
    model: string,
    modality: 'image' | 'video',
    purpose: 'invoke' | 'observe' = 'invoke'
  ): Promise<AsyncAIGCModelClient<TInput, TData>> {
    const modelProvider = await this.getModelProviderRuntime()
    const copilotId = normalizeOptionalString(modelProvider.copilotId)
    if (!copilotId) {
      throw new Error(this.modelProviderOptions.missingProviderMessage)
    }
    const modelType = modality === 'image' ? AiModelTypeEnum.IMAGE : AiModelTypeEnum.VIDEO
    return this.modelRuntime.createModelClient<AsyncAIGCModelClient<TInput, TData>>(
      {
        copilotId,
        model,
        modelType
      },
      { purpose }
    )
  }

  protected async createModelClient<TInput, TData>(
    model: string,
    modality: 'image' | 'video'
  ): Promise<AIGCModelClient<TInput, TData>> {
    const modelProvider = await this.getModelProviderRuntime()
    const copilotId = normalizeOptionalString(modelProvider.copilotId)
    if (!copilotId) {
      throw new Error(this.modelProviderOptions.missingProviderMessage)
    }
    const modelType = modality === 'image' ? AiModelTypeEnum.IMAGE : AiModelTypeEnum.VIDEO
    return this.modelRuntime.createModelClient<AIGCModelClient<TInput, TData>>(
      {
        copilotId,
        model,
        modelType
      },
      {}
    )
  }
}

function normalizeOptionalString(value: string | null | undefined) {
  const normalized = value?.trim()
  return normalized || undefined
}
