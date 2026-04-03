import { LogLevel } from '@nestjs/common'
import { randomUUID } from 'crypto'
import { IncomingMessage, ServerResponse } from 'http'
import pino from 'pino'
import { LoggerModule as PinoLoggerModule } from 'nestjs-pino'
import { Params } from 'nestjs-pino'
import pretty from 'pino-pretty'
import * as path from 'path'
import { RotatingFileStream } from './pino-rotating-file.stream'

const SERVICE_NAME = 'xpert-server'

const ALL_NEST_LOG_LEVELS: LogLevel[] = ['verbose', 'debug', 'log', 'warn', 'error', 'fatal']
const PINO_LEVEL_LABELS: Record<number, string> = {
	10: 'TRACE',
	20: 'DEBUG',
	30: 'INFO',
	40: 'WARN',
	50: 'ERROR',
	60: 'FATAL'
}

const resolveEnv = (): string => process.env.NODE_ENV || 'development'

const resolveConfiguredLogLevel = (): string => process.env.LOG_LEVEL || 'log'
const resolveLogFileMaxSize = (): string => process.env.LOG_FILE_MAX_SIZE || '10m'
const resolveLogFileMaxFiles = (): number => {
	const parsed = Number.parseInt(process.env.LOG_FILE_MAX_FILES || '5', 10)
	return Number.isInteger(parsed) && parsed > 0 ? parsed : 5
}

export const resolvePinoLogLevel = (): string => {
	const level = resolveConfiguredLogLevel()
	// Map NestJS log levels to pino levels
	const levelMap: Record<string, string> = {
		verbose: 'trace',
		debug: 'debug',
		log: 'info',
		warn: 'warn',
		error: 'error',
		fatal: 'fatal'
	}
	return levelMap[level] || level
}

export const resolveNestLogLevels = (): LogLevel[] => {
	const level = resolvePinoLogLevel()

	switch (level) {
		case 'trace':
			return [...ALL_NEST_LOG_LEVELS]
		case 'debug':
			return ['debug', 'log', 'warn', 'error', 'fatal']
		case 'info':
			return ['log', 'warn', 'error', 'fatal']
		case 'warn':
			return ['warn', 'error', 'fatal']
		case 'error':
			return ['error', 'fatal']
		case 'fatal':
			return ['fatal']
		case 'silent':
			return []
		default:
			return ['log', 'warn', 'error', 'fatal']
	}
}

const resolveLogFilePath = (): string => {
	if (process.env.LOG_FILE_PATH) {
		return process.env.LOG_FILE_PATH
	}
	const dataPath = process.env.LOG_DIR || path.join(process.cwd(), 'logs')
	return path.join(dataPath, 'xpert-server.log')
}

const normalizeHeaderValue = (value: string | string[] | undefined): string | undefined => {
	if (Array.isArray(value)) {
		return value[0]
	}
	return value
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const isValidRequestId = (value: string | undefined): value is string => {
	return !!value && UUID_PATTERN.test(value)
}

const resolvePathname = (url?: string): string => {
	if (!url) {
		return '/'
	}
	const [pathname] = url.split('?')
	const normalized = pathname?.replace(/\/+$/, '')
	return normalized || '/'
}

const isHealthPath = (url?: string): boolean => {
	const pathname = resolvePathname(url)
	return pathname === '/health' || pathname === '/api/health'
}

const buildConsoleStream = (env: string) => {
	if (env === 'production') {
		return process.stdout
	}

	return pretty({
		colorize: true,
		singleLine: true,
		translateTime: 'SYS:standard',
		ignore: 'pid,hostname,levelLabel'
	})
}

const buildFileStream = () =>
	new RotatingFileStream({
		destination: resolveLogFilePath(),
		mkdir: true,
		append: true,
		maxSize: resolveLogFileMaxSize(),
		maxFiles: resolveLogFileMaxFiles()
	})

export function buildPinoLoggerParams(): Params {
	const env = resolveEnv()
	const logLevel = resolvePinoLogLevel()

	return {
		pinoHttp: {
			level: logLevel,
			timestamp: pino.stdTimeFunctions.isoTime,
			stream: pino.multistream([
				{ level: logLevel, stream: buildConsoleStream(env) },
				{ level: logLevel, stream: buildFileStream() }
			]),
			genReqId: (req: IncomingMessage, res: ServerResponse) => {
				const headerValue = normalizeHeaderValue(req.headers['x-request-id'])
				const requestId = isValidRequestId(headerValue) ? headerValue : randomUUID()
				res.setHeader('x-request-id', requestId)
				return requestId
			},
			customProps: (req: IncomingMessage) => ({
				service: SERVICE_NAME,
				env,
				traceparent: normalizeHeaderValue(req.headers.traceparent),
				tracestate: normalizeHeaderValue(req.headers.tracestate)
			}),
			mixin(_context, level) {
				return {
					levelLabel: PINO_LEVEL_LABELS[level] ?? String(level)
				}
			},
			autoLogging: {
				ignore: (req: IncomingMessage) => isHealthPath(req.url)
			},
			redact: {
				paths: [
					'req.headers.authorization',
					'req.headers.cookie',
					'req.headers["x-api-key"]',
					'req.body.password',
					'req.body.token',
					'req.body.accessToken',
					'req.body.refreshToken'
				],
				censor: '[Redacted]'
			}
		}
	}
}

export function providePinoLoggerModule() {
	return PinoLoggerModule.forRoot(buildPinoLoggerParams())
}
