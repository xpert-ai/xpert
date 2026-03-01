import { RunSource, LaneName } from '@xpert-ai/plugin-sdk'
import { ConfigService } from '@metad/server-config'
import { loadYamlFile } from '@metad/server-core'
import { Injectable, Logger, OnModuleInit } from '@nestjs/common'
import * as path from 'path'
import { z } from 'zod'
import {
	HandoffQueueName,
	XPERT_HANDOFF_QUEUE,
	XPERT_HANDOFF_QUEUES,
	XPERT_HANDOFF_QUEUE_BATCH,
	XPERT_HANDOFF_QUEUE_INTEGRATION,
	XPERT_HANDOFF_QUEUE_REALTIME
} from '../constants'

const HANDOFF_ROUTING_CONFIG_PATH_ENV_KEY = 'HANDOFF_ROUTING_CONFIG_PATH'

const LANE_NAMES = ['main', 'subagent', 'cron', 'nested'] as const
const RUN_SOURCES = ['chat', 'xpert', 'lark', 'analytics', 'api'] as const
const RETRY_BACKOFF_TYPES = ['fixed', 'exponential'] as const
const RETRY_JITTER_TYPES = ['none', 'full', 'equal'] as const

const BASE_QUEUE_ALIAS_MAP = buildBaseQueueAliasMap()
const LANE_ALIAS_MAP: Record<string, LaneName> = {
	main: 'main',
	subagent: 'subagent',
	cron: 'cron',
	nested: 'nested',
	high: 'main',
	normal: 'main',
	low: 'cron'
}

const HandoffRouteMatchSchema = z
	.object({
		type: z.string().min(1).optional(),
		typePrefix: z.string().min(1).optional(),
		tenantId: z.string().min(1).optional(),
		organizationId: z.string().min(1).optional(),
		source: z.enum(RUN_SOURCES).optional()
	})
	.refine((value) => Object.keys(value).length > 0, {
		message: 'route.match requires at least one condition'
	})

const HandoffQueueConfigSchema = z.object({
	bullQueueName: z.string().min(1),
	maxInFlight: z.number().int().positive().optional()
})

const HandoffLanePolicySchema = z.object({
	weight: z.number().positive().optional(),
	maxConcurrent: z.number().int().positive().optional(),
	maxQueued: z.number().int().nonnegative().optional(),
	mapToLane: z.string().min(1).optional()
})

const HandoffTypeRetryPolicySchema = z.object({
	maxAttempts: z.number().int().positive().optional(),
	backoff: z.enum(RETRY_BACKOFF_TYPES).optional(),
	baseDelayMs: z.number().int().nonnegative().optional(),
	maxDelayMs: z.number().int().nonnegative().optional(),
	jitter: z.enum(RETRY_JITTER_TYPES).optional(),
	retryOn: z.array(z.union([z.string(), z.number().int()])).optional()
})

const HandoffTypeIdempotencyPolicySchema = z.object({
	keyFrom: z.string().min(1).optional(),
	windowMs: z.number().int().positive().optional()
})

const HandoffTypePolicySchema = z.object({
	queue: z.string().min(1).optional(),
	lane: z.string().min(1).optional(),
	timeoutMs: z.number().int().positive().optional(),
	retry: HandoffTypeRetryPolicySchema.optional(),
	idempotency: HandoffTypeIdempotencyPolicySchema.optional()
})

const HandoffRouteTargetSchema = z.object({
	queue: z.string().min(1),
	lane: z.string().min(1).optional(),
	timeoutMs: z.number().int().positive().optional()
})

const HandoffRoutingFileSchema = z.object({
	version: z.number().int().positive().default(1),
	defaultQueue: z.string().min(1).default(XPERT_HANDOFF_QUEUE),
	defaultLane: z.string().min(1).default('main'),
	queues: z.record(HandoffQueueConfigSchema).default({}),
	lanePolicy: z.record(HandoffLanePolicySchema).default({}),
	typePolicies: z.record(HandoffTypePolicySchema).default({}),
	routes: z
		.array(
			z.object({
				match: HandoffRouteMatchSchema,
				target: HandoffRouteTargetSchema
			})
		)
		.default([])
})

type HandoffRoutingFile = z.infer<typeof HandoffRoutingFileSchema>

export interface HandoffRouteRule {
	match: {
		type?: string
		typePrefix?: string
		tenantId?: string
		organizationId?: string
		source?: RunSource
	}
	target: {
		queue: HandoffQueueName
		lane?: LaneName
		timeoutMs?: number
	}
}

export interface HandoffQueueConfig {
	name: string
	bullQueueName: HandoffQueueName
	maxInFlight?: number
}

export interface HandoffLanePolicy {
	weight?: number
	maxConcurrent?: number
	maxQueued?: number
	mapToLane?: LaneName
}

export interface HandoffTypeRetryPolicy {
	maxAttempts?: number
	backoff?: (typeof RETRY_BACKOFF_TYPES)[number]
	baseDelayMs?: number
	maxDelayMs?: number
	jitter?: (typeof RETRY_JITTER_TYPES)[number]
	retryOn?: Array<string | number>
}

export interface HandoffTypeIdempotencyPolicy {
	keyFrom?: string
	windowMs?: number
}

export interface HandoffTypePolicy {
	queue?: HandoffQueueName
	lane?: LaneName
	timeoutMs?: number
	retry?: HandoffTypeRetryPolicy
	idempotency?: HandoffTypeIdempotencyPolicy
}

export interface HandoffRoutingConfigSnapshot {
	version: number
	defaultQueue: HandoffQueueName
	defaultLane: LaneName
	queues: Record<string, HandoffQueueConfig>
	lanePolicy: Record<string, HandoffLanePolicy>
	typePolicies: Record<string, HandoffTypePolicy>
	routes: HandoffRouteRule[]
	queueAliases: Record<string, HandoffQueueName>
}

@Injectable()
export class HandoffRoutingConfigService implements OnModuleInit {
	readonly #logger = new Logger(HandoffRoutingConfigService.name)
	#snapshot: HandoffRoutingConfigSnapshot = {
		version: 1,
		defaultQueue: XPERT_HANDOFF_QUEUE,
		defaultLane: 'main',
		queues: {},
		lanePolicy: {},
		typePolicies: {},
		routes: [],
		queueAliases: BASE_QUEUE_ALIAS_MAP
	}

	constructor(private readonly configService: ConfigService) {}

	onModuleInit() {
		this.#snapshot = this.loadConfig()
	}

	getSnapshot(): HandoffRoutingConfigSnapshot {
		return this.#snapshot
	}

	resolveQueueAlias(input: string | undefined): HandoffQueueName | undefined {
		if (!input) {
			return undefined
		}
		return this.#snapshot.queueAliases[input.trim().toLowerCase()]
	}

	resolveLaneAlias(input: string | undefined): LaneName | undefined {
		if (!input) {
			return undefined
		}
		const laneKey = input.trim().toLowerCase()
		const fromAlias = LANE_ALIAS_MAP[laneKey]
		if (fromAlias) {
			return fromAlias
		}
		return this.#snapshot.lanePolicy[laneKey]?.mapToLane
	}

	private loadConfig(): HandoffRoutingConfigSnapshot {
		const configFilePath = this.resolveConfigFilePath()
		const raw = loadYamlFile<unknown>(configFilePath, this.#logger, false)
		const parsed = HandoffRoutingFileSchema.parse(raw as HandoffRoutingFile)
		const normalized = this.normalizeConfig(parsed)

		this.#logger.log(
			`Loaded handoff routing config from "${configFilePath}" (version=${normalized.version}, routes=${normalized.routes.length})`
		)

		return normalized
	}

	private normalizeConfig(config: HandoffRoutingFile): HandoffRoutingConfigSnapshot {
		const queues = this.normalizeQueues(config.queues)
		const queueAliases = this.buildQueueAliasMap(queues)
		const lanePolicy = this.normalizeLanePolicy(config.lanePolicy)
		const defaultLane = this.normalizeLane(config.defaultLane, 'defaultLane', lanePolicy, 'main')
		const defaultQueue = this.normalizeQueue(config.defaultQueue, 'defaultQueue', queueAliases)
		const typePolicies = this.normalizeTypePolicies(
			config.typePolicies,
			queueAliases,
			lanePolicy,
			defaultLane
		)

		return {
			version: config.version,
			defaultQueue,
			defaultLane,
			queues,
			lanePolicy,
			typePolicies,
			routes: config.routes.map((route, index) => ({
				match: {
					type: route.match.type,
					typePrefix: route.match.typePrefix,
					tenantId: route.match.tenantId,
					organizationId: route.match.organizationId,
					source: route.match.source
				},
				target: {
					queue: this.normalizeQueue(route.target.queue, `routes[${index}].target.queue`, queueAliases),
					lane: route.target.lane
						? this.normalizeLane(
								route.target.lane,
								`routes[${index}].target.lane`,
								lanePolicy,
								defaultLane
						  )
						: undefined,
					timeoutMs: route.target.timeoutMs
				}
			})),
			queueAliases
		}
	}

	private normalizeQueues(
		configQueues: HandoffRoutingFile['queues']
	): Record<string, HandoffQueueConfig> {
		const queues: Record<string, HandoffQueueConfig> = {}
		for (const [queueName, queueConfig] of Object.entries(configQueues ?? {})) {
			const key = queueName.trim().toLowerCase()
			if (!key) {
				continue
			}
			queues[key] = {
				name: key,
				bullQueueName: this.normalizeQueue(
					queueConfig.bullQueueName,
					`queues.${queueName}.bullQueueName`,
					BASE_QUEUE_ALIAS_MAP
				),
				maxInFlight: queueConfig.maxInFlight
			}
		}
		return queues
	}

	private buildQueueAliasMap(
		queues: Record<string, HandoffQueueConfig>
	): Record<string, HandoffQueueName> {
		const queueAliases = {
			...BASE_QUEUE_ALIAS_MAP
		}
		for (const [queueName, queueConfig] of Object.entries(queues)) {
			queueAliases[queueName] = queueConfig.bullQueueName
		}
		return queueAliases
	}

	private normalizeLanePolicy(
		rawLanePolicy: HandoffRoutingFile['lanePolicy']
	): Record<string, HandoffLanePolicy> {
		const lanePolicy: Record<string, HandoffLanePolicy> = {}
		for (const [laneName, laneConfig] of Object.entries(rawLanePolicy ?? {})) {
			const key = laneName.trim().toLowerCase()
			if (!key) {
				continue
			}
			lanePolicy[key] = {
				weight: laneConfig.weight,
				maxConcurrent: laneConfig.maxConcurrent,
				maxQueued: laneConfig.maxQueued,
				mapToLane: laneConfig.mapToLane
					? this.normalizeLaneAlias(laneConfig.mapToLane, `lanePolicy.${laneName}.mapToLane`)
					: undefined
			}
		}
		return lanePolicy
	}

	private normalizeTypePolicies(
		rawTypePolicies: HandoffRoutingFile['typePolicies'],
		queueAliases: Record<string, HandoffQueueName>,
		lanePolicy: Record<string, HandoffLanePolicy>,
		defaultLane: LaneName
	): Record<string, HandoffTypePolicy> {
		const typePolicies: Record<string, HandoffTypePolicy> = {}
		for (const [messageType, typePolicy] of Object.entries(rawTypePolicies ?? {})) {
			const type = messageType.trim()
			if (!type) {
				continue
			}
			typePolicies[type] = {
				queue: typePolicy.queue
					? this.normalizeQueue(typePolicy.queue, `typePolicies.${messageType}.queue`, queueAliases)
					: undefined,
				lane: typePolicy.lane
					? this.normalizeLane(
							typePolicy.lane,
							`typePolicies.${messageType}.lane`,
							lanePolicy,
							defaultLane
					  )
					: undefined,
				timeoutMs: typePolicy.timeoutMs,
				retry: typePolicy.retry,
				idempotency: typePolicy.idempotency
			}
		}
		return typePolicies
	}

	private normalizeQueue(
		input: string,
		fieldPath: string,
		queueAliases: Record<string, HandoffQueueName>
	): HandoffQueueName {
		const normalized = queueAliases[input.trim().toLowerCase()]
		if (!normalized) {
			throw new Error(
				`Invalid queue "${input}" at ${fieldPath}. Allowed values: ${Object.keys(queueAliases).join(', ')}`
			)
		}
		return normalized
	}

	private normalizeLane(
		input: string,
		fieldPath: string,
		lanePolicy: Record<string, HandoffLanePolicy>,
		defaultLane: LaneName
	): LaneName {
		const laneAlias = this.resolveLaneAliasFromPolicy(input, lanePolicy)
		if (laneAlias) {
			return laneAlias
		}
		this.#logger.warn(
			`Unknown lane "${input}" at ${fieldPath}, fallback to "${defaultLane}". ` +
				`Allowed lane aliases: ${LANE_NAMES.join(', ')}, high, normal, low`
		)
		return defaultLane
	}

	private normalizeLaneAlias(input: string, fieldPath: string): LaneName {
		const laneAlias = LANE_ALIAS_MAP[input.trim().toLowerCase()]
		if (!laneAlias) {
			throw new Error(
				`Invalid lane "${input}" at ${fieldPath}. Allowed lane aliases: ${LANE_NAMES.join(
					', '
				)}, high, normal, low`
			)
		}
		return laneAlias
	}

	private resolveLaneAliasFromPolicy(
		input: string,
		lanePolicy: Record<string, HandoffLanePolicy>
	): LaneName | undefined {
		const key = input.trim().toLowerCase()
		return LANE_ALIAS_MAP[key] ?? lanePolicy[key]?.mapToLane
	}

	private resolveConfigFilePath(): string {
		const configuredPath =
			process.env[HANDOFF_ROUTING_CONFIG_PATH_ENV_KEY]
		if (configuredPath) {
			return path.isAbsolute(configuredPath)
				? configuredPath
				: path.join(this.configService.assetOptions.serverRoot, configuredPath)
		}
		this.#logger.warn(
			`${HANDOFF_ROUTING_CONFIG_PATH_ENV_KEY} is not set. ` +
				`Configure this env in production.`
		)
		return null
	}
}

function buildBaseQueueAliasMap(): Record<string, HandoffQueueName> {
	const entries: Array<[string, HandoffQueueName]> = [
		['handoff', XPERT_HANDOFF_QUEUE],
		['default', XPERT_HANDOFF_QUEUE],
		['realtime', XPERT_HANDOFF_QUEUE_REALTIME],
		['batch', XPERT_HANDOFF_QUEUE_BATCH],
		['integration', XPERT_HANDOFF_QUEUE_INTEGRATION],
		...XPERT_HANDOFF_QUEUES.map((queueName) => [queueName, queueName] as [string, HandoffQueueName])
	]
	return entries.reduce<Record<string, HandoffQueueName>>((state, [alias, queue]) => {
		state[alias.trim().toLowerCase()] = queue
		return state
	}, {})
}
