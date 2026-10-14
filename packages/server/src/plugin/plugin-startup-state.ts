/**
 * Invariants: snapshots are replica-local, private and never change the desired database configuration.
 * An unfinished candidate boot is tried once, then the supervisor restores the last admitted configuration.
 * Snapshots restore code/configuration only; database migrations must remain backward compatible.
 */
import { createHash, randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { hostname } from 'node:os'
import { dirname, join } from 'node:path'
import type { Worker } from 'node:worker_threads'
import { createPluginStartupWatchdog } from './plugin-startup-watchdog'
import { z } from 'zod'
import { serializePluginConfig, deserializePluginConfig } from './plugin-config.crypto'
import type { RuntimePluginState } from '../managed-connection/instance-registry.service'
import type { OrganizationPluginConfig } from './plugin-instance.loader'

const groupSchema = z.object({
	tenantId: z.string().nullish(),
	organizationId: z.string().optional(),
	scopeKey: z.string().optional(),
	plugins: z.array(
		z.object({
			name: z.string(),
			runtimeName: z
				.string()
				.nullish()
				.transform((value) => value ?? undefined),
			version: z
				.string()
				.nullish()
				.transform((value) => value ?? undefined),
			source: z
				.string()
				.nullish()
				.transform((value) => value ?? undefined),
			level: z
				.enum(['system', 'tenant', 'organization'])
				.nullish()
				.transform((value) => value ?? undefined),
			sourceConfig: z.object({ workspacePath: z.string().optional() }).passthrough().nullish()
		})
	),
	configs: z.record(z.unknown())
})
const runtimePluginSchema = z.object({
	scopeKey: z.string(),
	pluginName: z.string(),
	packageName: z.string().optional(),
	version: z.string().optional(),
	runtimeRevision: z.string().optional()
})
const stateSchema = z.object({
	good: z.array(groupSchema).optional(),
	goodRuntime: z
		.object({
			plugins: z.array(runtimePluginSchema),
			failures: z.array(
				z.object({
					scopeKey: z.string(),
					pluginName: z.string(),
					packageName: z.string().optional()
				})
			)
		})
		.optional(),
	attempted: z.string().optional(),
	blocked: z.string().optional(),
	recovering: z.boolean().optional(),
	active: z.object({ pluginName: z.string(), stage: z.string(), startedAt: z.number() }).optional(),
	failure: z
		.object({ pluginName: z.string(), stage: z.string(), code: z.string(), durationMs: z.number() })
		.optional()
})
type StartupState = Omit<z.infer<typeof stateSchema>, 'good'> & { good?: OrganizationPluginConfig[] }

export class PluginStartupRecoveryRequiredError extends Error {}

function fingerprint(groups: OrganizationPluginConfig[]): string {
	const ordered = [...groups]
		.sort((a, b) => (a.scopeKey ?? a.organizationId ?? '').localeCompare(b.scopeKey ?? b.organizationId ?? ''))
		.map((group) => ({ ...group, plugins: [...group.plugins].sort((a, b) => a.name.localeCompare(b.name)) }))
	return createHash('sha256')
		.update(
			JSON.stringify(ordered, (_key, value: unknown) => {
				if (value && typeof value === 'object' && !Array.isArray(value))
					return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)))
				return value
			})
		)
		.digest('hex')
}

export class PluginStartupState {
	private state: StartupState
	private candidate?: OrganizationPluginConfig[]
	rolledBack = false
	constructor(private readonly file: string) {
		try {
			this.state = existsSync(file)
				? (stateSchema.parse(JSON.parse(readFileSync(file, 'utf8'))) as StartupState)
				: {}
		} catch {
			throw new PluginStartupRecoveryRequiredError('Plugin startup snapshot is unreadable')
		}
	}
	select(groups: OrganizationPluginConfig[]): OrganizationPluginConfig[] {
		const candidate = groups
		const hash = fingerprint(candidate)
		if (this.state.attempted === hash || this.state.blocked === hash) {
			if (!this.state.failure) {
				const active = this.state.active
				this.state.failure = {
					pluginName: active?.pluginName ?? '(bootstrap)',
					stage: active?.stage ?? 'bootstrap',
					code: 'PLUGIN_STARTUP_INTERRUPTED',
					durationMs: active ? Date.now() - active.startedAt : 0
				}
			}
			if (this.state.recovering || !this.state.good) {
				this.save()
				throw new PluginStartupRecoveryRequiredError('Plugin recovery requires operator intervention')
			}
			this.state.recovering = true
			this.state.blocked = hash
			this.state.attempted = undefined
			this.save()
			this.rolledBack = true
			return this.state.good.map((group) => ({ ...group, configs: deserializePluginConfig(group.configs) }))
		}
		this.candidate = candidate
		this.state.attempted = hash
		this.state.failure = undefined
		this.state.recovering = false
		this.state.active = undefined
		this.save()
		return candidate
	}
	canRestore(state: RuntimePluginState): boolean {
		if (!this.state.goodRuntime || !state) return false
		return (
			this.state.goodRuntime.plugins.length === state.plugins.length &&
			this.state.goodRuntime.plugins.every((expected) =>
				state.plugins.some(
					(actual) =>
						actual.scopeKey === expected.scopeKey &&
						actual.pluginName === expected.pluginName &&
						actual.version === expected.version &&
						actual.runtimeRevision === expected.runtimeRevision
				)
			) &&
			state.failures.every((failure) =>
				this.state.goodRuntime.failures.some(
					(known) => known.scopeKey === failure.scopeKey && known.pluginName === failure.pluginName
				)
			)
		)
	}
	commit(runtime: RuntimePluginState): void {
		if (this.candidate) {
			this.state.failure = undefined
			this.state.goodRuntime = runtime
				? {
						plugins: runtime.plugins,
						failures: runtime.failures.map(({ scopeKey, pluginName, packageName }) => ({
							scopeKey,
							pluginName,
							packageName
						}))
					}
				: undefined
		}
		if (this.candidate)
			this.state.good = this.candidate.map((group) => ({
				...group,
				configs: serializePluginConfig(group.configs)
			}))
		this.state.recovering = false
		this.state.active = undefined
		this.state.attempted = undefined
		this.save()
	}
	allowRetry(): void {
		this.state.recovering = false
		this.state.blocked = undefined
		this.state.attempted = undefined
		this.save()
	}
	get failure(): StartupState['failure'] {
		return this.state.failure
	}
	start(pluginName: string, stage: string): void {
		this.state.active = { pluginName, stage, startedAt: Date.now() }
		this.save()
	}
	finish(pluginName: string, stage: string): void {
		if (this.state.active?.pluginName === pluginName && this.state.active.stage === stage) {
			this.state.active = undefined
			this.save()
		}
	}
	fail(failure: NonNullable<StartupState['failure']>): void {
		if (!this.rolledBack) this.state.failure = failure
		this.save()
	}
	private save(): void {
		mkdirSync(dirname(this.file), { recursive: true, mode: 0o700 })
		const temporary = `${this.file}.${randomUUID()}.tmp`
		writeFileSync(temporary, JSON.stringify(this.state), { mode: 0o600 })
		renameSync(temporary, this.file)
	}
}

let startup: PluginStartupState | undefined
let watchdog: Worker | undefined
let listening = false
export function beginPluginStartup(root: string, timeoutMs = 120_000): void {
	const replica = createHash('sha256')
		.update(process.env.XPERT_INSTANCE_ID || process.env.HOSTNAME || hostname())
		.digest('hex')
	startup = new PluginStartupState(join(root, 'plugins', '.runtime-plugin-state', `${replica}.json`))
	watchdog = createPluginStartupWatchdog(join(root, 'plugins', '.runtime-plugin-state', `${replica}.json`), timeoutMs)
}
export function selectPluginStartup(groups: OrganizationPluginConfig[]): OrganizationPluginConfig[] {
	return startup?.select(groups) ?? groups
}
export function canRestorePluginStartup(state: RuntimePluginState): boolean {
	return startup?.canRestore(state) ?? false
}
export function isPluginStartupListening(): boolean {
	return !startup || listening
}
export function markPluginStartupListening(): void {
	listening = true
}
export function admitPluginStartup(state: RuntimePluginState): boolean {
	if (!isPluginStartupListening()) return false
	startup?.commit(state)
	watchdog?.postMessage('ready')
	watchdog = undefined
	return true
}
export function preparePluginStartupRetry(): void {
	startup?.allowRetry()
}
export function recordPluginStartupFailure(failure: NonNullable<StartupState['failure']>): void {
	startup?.fail(failure)
}

export function startPluginStartupStep(pluginName: string, stage: string): void {
	startup?.start(pluginName, stage)
}
export function getPluginStartupFailure() {
	return startup?.rolledBack ? startup.failure : undefined
}
/** Keep an exhausted recovery unavailable without a PM2 crash loop; an operator can restart after repair. */
export function holdFailedPluginStartup(error: unknown): void {
	if (!(error instanceof PluginStartupRecoveryRequiredError)) throw error
	watchdog?.postMessage('stop')
	watchdog = undefined
	console.error(JSON.stringify({ event: 'runtime.startup.recovery-required', failure: startup?.failure }))
	setInterval(() => undefined, 60_000)
}

export function finishPluginStartupStep(pluginName: string, stage: string): void {
	startup?.finish(pluginName, stage)
}
