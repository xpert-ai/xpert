import type { IRuntimePluginRequirement, RuntimeRestartStatus } from '@xpert-ai/contracts'

export type RuntimeRestartRedisClient = {
	set: (key: string, value: string, options?: { NX?: boolean; PX?: number; EX?: number }) => Promise<string | null>
	get: (key: string) => Promise<string | null>
	hSet: (key: string, field: string, value: string) => Promise<number>
	hGetAll: (key: string) => Promise<Record<string, string>>
	expire: (key: string, seconds: number) => Promise<boolean | number>
	eval?: (script: string, options: { keys: string[]; arguments: string[] }) => Promise<number | string | null>
	duplicate?: () => RuntimeRestartRedisSubscriber
	publish?: (channel: string, message: string) => Promise<number>
}

export type RuntimeRestartRedisSubscriber = {
	connect?: () => Promise<unknown>
	subscribe?: (channel: string, listener: (message: string) => void) => Promise<unknown>
	unsubscribe?: (channel: string) => Promise<unknown>
	quit?: () => Promise<unknown>
}

export type RestartOperationMetadata = {
	restartId: string
	requestedAt: string
	reason?: string
	source: 'interactive' | 'plugin-change' | 'plugin-follow-up' | 'plugin-catch-up'
	actorUserId?: string
	tenantId?: string
	sourceIp?: string
	pluginGeneration: number
	pluginGenerations: number[]
	runtimeRequirements: IRuntimePluginRequirement[]
	registrationDeadlineAt?: string
	// Keep legacy phases readable while the creator publishes generation status before activation.
	phase: 'collecting' | 'rolling'
	preparing?: boolean
	targetReplicaCount: number
	maxConcurrentRestarts?: number
	deadlineAt?: string
}

export type RestartTargetState = {
	replicaId: string
	expectedBootId: string
	status: 'pending' | 'restarting' | 'completed' | 'failed'
	updatedAt: string
	startedAt?: string
	acknowledgedBootId?: string
	observedBootId?: string
	lockToken?: string
	restartSlot?: number
	error?: string
}

export type PluginGenerationChange = {
	generation: number
	requirements: IRuntimePluginRequirement[]
	source: 'interactive' | 'plugin-change'
	reason?: string
	actorUserId?: string
	tenantId?: string
	sourceIp?: string
}

export type PluginGenerationState = {
	generation: number
	status: RuntimeRestartStatus
	restartId?: string
	error?: string
}

export type RestartOperationInput = {
	reason?: string
	source: RestartOperationMetadata['source']
	actorUserId?: string
	tenantId?: string
	sourceIp?: string
	pluginGeneration: number
	pluginChanges: PluginGenerationChange[]
	runtimeRequirements: IRuntimePluginRequirement[]
}

export interface PluginRuntimeChangeInput {
	pluginName: string
	version?: string | null
	runtimeRevision?: string | null
	scopeKey: string
}

export interface PluginRuntimeChangeResult {
	scheduled: boolean
	generation: number
}
