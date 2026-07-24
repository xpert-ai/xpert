export type JsonPrimitive = string | number | boolean | null
export type JsonValue = JsonPrimitive | JsonObject | JsonValue[]
export type JsonObject = { [key: string]: JsonValue | undefined }

export type RemoteContext = {
	manifest: JsonObject
	payload: JsonObject
	initialQuery: JsonObject
	locale: string
	theme?: JsonValue
	debug?: {
		enabled: boolean
		production: boolean
	}
}

export type RemoteHostEvent = {
	id?: string
	type?: string
	source?: string
	toolName?: string
	data?: JsonObject
}

type PendingRequest = {
	resolve(value: JsonObject): void
	reject(error: Error): void
}

type DebugState = {
	enabled: boolean
	production: boolean
}

type RemoteRequestBody = { [key: string]: unknown }

const CHANNEL = 'xpertai.remote_component'
const PROTOCOL_VERSION = 1

export function createRemoteBridge(namespace: string) {
	let instanceId: string | null = null
	let requestSequence = 0
	let currentContext: RemoteContext | null = null
	const pending = new Map<string, PendingRequest>()
	const contextListeners = new Set<(context: RemoteContext) => void>()
	const hostEventListeners = new Set<(event: RemoteHostEvent) => void>()
	let hostDebug: DebugState = {
		enabled: false,
		production: true
	}

	const logger = {
		debug(event: string, data?: JsonObject) {
			if (isDebugEnabled()) {
				console.debug(`[${namespace}] ${event}`, redactDebugData(data))
			}
		},
		info(event: string, data?: JsonObject) {
			if (isDebugEnabled()) {
				console.info(`[${namespace}] ${event}`, redactDebugData(data))
			}
		},
		warn(event: string, data?: JsonObject) {
			console.warn(`[${namespace}] ${event}`, redactDebugData(data))
		},
		error(event: string, data?: JsonObject) {
			console.error(`[${namespace}] ${event}`, redactDebugData(data))
		}
	}

	function isDebugEnabled() {
		const stored = window.localStorage?.getItem(`xpert.debug.${namespace}`)
		if (stored === '0') {
			return false
		}
		if (stored === '1') {
			return true
		}
		const requested = new URLSearchParams(window.location.search).get('xpertDebug')
		return requested === namespace || hostDebug.enabled
	}

	function post(type: string, body: RemoteRequestBody = {}) {
		if (!instanceId && type !== 'ready') {
			return
		}
		window.parent.postMessage(
			{
				channel: CHANNEL,
				protocolVersion: PROTOCOL_VERSION,
				instanceId,
				type,
				...body
			},
			'*'
		)
	}

	function request(type: string, body: RemoteRequestBody = {}) {
		const requestId = String(++requestSequence)
		return new Promise<JsonObject>((resolve, reject) => {
			const timeout = window.setTimeout(() => {
				if (pending.delete(requestId)) {
					reject(new Error(`Remote request '${type}' timed out.`))
				}
			}, 30_000)
			pending.set(requestId, {
				resolve(value) {
					window.clearTimeout(timeout)
					resolve(value)
				},
				reject(error) {
					window.clearTimeout(timeout)
					reject(error)
				}
			})
			post(type, {
				requestId,
				...body
			})
		})
	}

	function handleMessage(event: MessageEvent) {
		if (event.source !== window.parent || !isJsonObject(event.data)) {
			return
		}
		const message = event.data
		if (readString(message, 'channel') !== CHANNEL || readNumber(message, 'protocolVersion') !== PROTOCOL_VERSION) {
			return
		}

		const type = readString(message, 'type')
		if (type === 'init') {
			instanceId = readString(message, 'instanceId') ?? null
			currentContext = readContext(message)
			hostDebug = currentContext.debug ?? hostDebug
			document.documentElement.lang = currentContext.locale
			logger.info('bridge.init', {
				locale: currentContext.locale,
				viewKey: readString(currentContext.manifest, 'key')
			})
			for (const listener of contextListeners) {
				listener(currentContext)
			}
			reportResize()
			return
		}

		if (readString(message, 'instanceId') !== instanceId) {
			return
		}

		if (type === 'hostEvent') {
			const hostEvent = readHostEvent(message['event'])
			if (hostEvent) {
				logger.debug('host-event.received', {
					type: hostEvent.type,
					toolName: hostEvent.toolName
				})
				for (const listener of hostEventListeners) {
					listener(hostEvent)
				}
			}
			return
		}

		const requestId = readString(message, 'requestId')
		if (!requestId) {
			return
		}
		const item = pending.get(requestId)
		if (!item) {
			return
		}
		pending.delete(requestId)
		if (type === 'error') {
			item.reject(new Error(readString(message, 'message') ?? 'Remote request failed.'))
		} else {
			item.resolve(message)
		}
	}

	window.addEventListener('message', handleMessage)

	return {
		logger,
		ready() {
			post('ready')
		},
		destroy() {
			window.removeEventListener('message', handleMessage)
			for (const item of pending.values()) {
				item.reject(new Error('Remote component bridge was destroyed.'))
			}
			pending.clear()
			contextListeners.clear()
			hostEventListeners.clear()
		},
		subscribeContext(listener: (context: RemoteContext) => void) {
			contextListeners.add(listener)
			if (currentContext) {
				listener(currentContext)
			}
			return () => {
				contextListeners.delete(listener)
			}
		},
		subscribeHostEvents(listener: (event: RemoteHostEvent) => void) {
			hostEventListeners.add(listener)
			return () => {
				hostEventListeners.delete(listener)
			}
		},
		requestData(query: JsonObject) {
			logger.debug('request-data.started', {
				modelId: readString(readObject(query, 'parameters'), 'modelId')
			})
			return request('requestData', { query })
		},
		requestParameterOptions(parameterKey: string, query: JsonObject) {
			return request('requestParameterOptions', {
				parameterKey,
				query
			})
		},
		executeAction(
			actionKey: string,
			options: {
				targetId?: string
				input?: JsonObject
				parameters?: JsonObject
			} = {}
		) {
			logger.debug('execute-action.started', {
				actionKey,
				targetId: options.targetId
			})
			return request('executeAction', {
				actionKey,
				targetId: options.targetId,
				input: options.input,
				parameters: options.parameters
			})
		},
		async executeFileAction(
			actionKey: string,
			file: File,
			options: {
				targetId?: string
				input?: JsonObject
				parameters?: JsonObject
			} = {}
		) {
			logger.debug('execute-file-action.started', {
				actionKey,
				fileName: file.name,
				fileSize: file.size
			})
			return request('executeFileAction', {
				actionKey,
				targetId: options.targetId,
				input: options.input,
				parameters: options.parameters,
				file: {
					name: file.name,
					type: file.type,
					size: file.size,
					buffer: await file.arrayBuffer()
				}
			})
		},
		notify(level: 'info' | 'success' | 'error', message: string) {
			post('notify', { level, message })
		},
		reportResize
	}

	function reportResize() {
		const height = Math.max(document.documentElement.scrollHeight, document.body.scrollHeight, 100000)
		post('resize', {
			height,
			viewportBound: true
		})
	}
}

export function buildInitialQuery(context: RemoteContext): JsonObject {
	const payloadParameters = readObject(context.payload, 'parameters') ?? {}
	return {
		page: readNumber(context.initialQuery, 'page') ?? 1,
		pageSize: readNumber(context.initialQuery, 'pageSize') ?? 50,
		search: readString(context.initialQuery, 'search'),
		parameters: {
			...payloadParameters,
			...(readObject(context.initialQuery, 'parameters') ?? {})
		}
	}
}

export function applyHostTheme(theme: JsonValue | undefined) {
	const root = document.documentElement
	const themeObject = isJsonObject(theme) ? theme : undefined
	const mode =
		typeof theme === 'string'
			? theme
			: (readString(themeObject, 'mode') ?? readString(themeObject, 'name') ?? readString(themeObject, 'scheme'))
	const dark = mode?.toLowerCase().includes('dark') ?? false

	root.dataset['theme'] = dark ? 'dark' : 'light'
	root.classList.toggle('dark', dark)
	root.style.colorScheme = dark ? 'dark' : 'light'

	const tokens = readObject(themeObject, 'tokens')
	if (!tokens) {
		return
	}
	for (const [key, value] of Object.entries(tokens)) {
		if (typeof value === 'string' || typeof value === 'number') {
			root.style.setProperty(`--xui-${toKebabCase(key)}`, String(value))
		}
	}
}

export function readData(response: JsonObject) {
	return readObject(response, 'data') ?? {}
}

export function readResult(response: JsonObject) {
	return readObject(response, 'result') ?? {}
}

export function readLocalizedText(value: JsonValue | undefined, locale: string, fallback: string) {
	if (typeof value === 'string') {
		return value
	}
	if (!isJsonObject(value)) {
		return fallback
	}
	const normalized = normalizeLocale(locale)
	const primaryKey = normalized === 'zh-Hans' ? 'zh_Hans' : 'en_US'
	const secondaryKey = primaryKey === 'zh_Hans' ? 'en_US' : 'zh_Hans'
	return readString(value, primaryKey) ?? readString(value, secondaryKey) ?? fallback
}

export function normalizeLocale(locale?: string) {
	const normalized = (locale ?? '').split('_').join('-')
	const aliases: { [key: string]: 'en-US' | 'zh-Hans' | 'zh-Hant' } = {
		en: 'en-US',
		'en-US': 'en-US',
		'en-GB': 'en-US',
		zh: 'zh-Hans',
		'zh-CN': 'zh-Hans',
		'zh-SG': 'zh-Hans',
		'zh-Hans': 'zh-Hans',
		'zh-TW': 'zh-Hant',
		'zh-HK': 'zh-Hant',
		'zh-MO': 'zh-Hant',
		'zh-Hant': 'zh-Hant'
	}
	return aliases[normalized] ?? 'en-US'
}

export function isJsonObject(value: unknown): value is JsonObject {
	return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

export function readObject(input: JsonObject | null | undefined, key: string): JsonObject | undefined {
	const value = input?.[key]
	return isJsonObject(value) ? value : undefined
}

export function readString(input: JsonObject | null | undefined, key: string): string | undefined {
	const value = input?.[key]
	return typeof value === 'string' ? value : undefined
}

export function readNumber(input: JsonObject | null | undefined, key: string): number | undefined {
	const value = input?.[key]
	return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

export function readBoolean(input: JsonObject | null | undefined, key: string): boolean | undefined {
	const value = input?.[key]
	return typeof value === 'boolean' ? value : undefined
}

export function readArray(input: JsonObject | null | undefined, key: string): JsonValue[] {
	const value = input?.[key]
	return Array.isArray(value) ? value : []
}

function readContext(message: JsonObject): RemoteContext {
	const debug = readObject(message, 'debug')
	return {
		manifest: readObject(message, 'manifest') ?? {},
		payload: readObject(message, 'payload') ?? {},
		initialQuery: readObject(message, 'initialQuery') ?? {},
		locale: readString(message, 'locale') ?? 'en-US',
		theme: message['theme'],
		debug: debug
			? {
					enabled: readBoolean(debug, 'enabled') ?? false,
					production: readBoolean(debug, 'production') ?? true
				}
			: undefined
	}
}

function readHostEvent(value: JsonValue | undefined): RemoteHostEvent | null {
	if (!isJsonObject(value)) {
		return null
	}
	return {
		id: readString(value, 'id'),
		type: readString(value, 'type'),
		source: readString(value, 'source'),
		toolName: readString(value, 'toolName'),
		data: readObject(value, 'data')
	}
}

function redactDebugData(data?: JsonObject) {
	if (!data) {
		return undefined
	}
	const output: JsonObject = {}
	for (const [key, value] of Object.entries(data)) {
		if (/token|credential|secret|tenant|organization/i.test(key)) {
			output[key] = '[redacted]'
		} else if (typeof value === 'string' && value.length > 300) {
			output[key] = `${value.slice(0, 300)}…`
		} else if (Array.isArray(value) && value.length > 20) {
			output[key] = `[${value.length} items]`
		} else {
			output[key] = value
		}
	}
	return output
}

function toKebabCase(value: string) {
	return value
		.replace(/([a-z0-9])([A-Z])/g, '$1-$2')
		.replace(/[\s_]+/g, '-')
		.toLowerCase()
}
