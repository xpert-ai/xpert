import type { StructuredToolInterface } from '@langchain/core/tools'
import { AiModelTypeEnum, type IXpertToolset, type TToolCredentials } from '@xpert-ai/contracts'
import {
  type AIGCModelClient,
  ManagedAIGCModelClient,
  ManagedAsyncAIGCModelClient,
  type AsyncAIGCModelClient,
  type ManagedAIGCModelDefaults
} from '../ai-model'
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

  protected async createManagedAsyncModelClient<TInput, TData>(
    model: string,
    defaults: Omit<ManagedAIGCModelDefaults, 'model'>,
    purpose: 'invoke' | 'observe' = 'invoke'
  ): Promise<ManagedAsyncAIGCModelClient<TInput, TData>> {
    const modelProvider = await this.getModelProviderRuntime()
    const copilotId = normalizeOptionalString(modelProvider.copilotId)
    if (!copilotId) {
      throw new Error(this.modelProviderOptions.missingProviderMessage)
    }
    const modelType = defaults.modality === 'image' ? AiModelTypeEnum.IMAGE : AiModelTypeEnum.VIDEO
    const client = await this.modelRuntime.createModelClient<AsyncAIGCModelClient<TInput, TData>>(
      {
        copilotId,
        model,
        modelType
      },
      { purpose }
    )
    return new ManagedAsyncAIGCModelClient(
      client,
      modelProvider.recordInvocation,
      {
        ...defaults,
        model
      },
      modelProvider.resolvePricingSnapshot
    )
  }

  protected async createManagedModelClient<TInput, TData>(
    model: string,
    defaults: Omit<ManagedAIGCModelDefaults, 'model'>
  ): Promise<ManagedAIGCModelClient<TInput, TData>> {
    const modelProvider = await this.getModelProviderRuntime()
    const copilotId = normalizeOptionalString(modelProvider.copilotId)
    if (!copilotId) {
      throw new Error(this.modelProviderOptions.missingProviderMessage)
    }
    const modelType = defaults.modality === 'image' ? AiModelTypeEnum.IMAGE : AiModelTypeEnum.VIDEO
    const client = await this.modelRuntime.createModelClient<AIGCModelClient<TInput, TData>>(
      {
        copilotId,
        model,
        modelType
      },
      {}
    )
    return new ManagedAIGCModelClient(
      client,
      modelProvider.recordInvocation,
      {
        ...defaults,
        model
      },
      modelProvider.resolvePricingSnapshot
    )
  }
}

function normalizeOptionalString(value: string | null | undefined) {
  const normalized = value?.trim()
  return normalized || undefined
}
