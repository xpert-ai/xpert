import { createWriteStream, existsSync, mkdirSync, renameSync, rmSync, statSync, WriteStream } from 'fs'
import { dirname } from 'path'
import { Writable } from 'stream'

export interface RotatingFileStreamOptions {
	append?: boolean
	destination: string
	maxFiles?: number | string
	maxSize?: number | string
	mkdir?: boolean
}

const DEFAULT_MAX_SIZE_BYTES = 10 * 1024 * 1024
const DEFAULT_MAX_FILES = 5

const SIZE_MULTIPLIERS: Record<string, number> = {
	b: 1,
	k: 1024,
	kb: 1024,
	m: 1024 * 1024,
	mb: 1024 * 1024,
	g: 1024 * 1024 * 1024,
	gb: 1024 * 1024 * 1024
}

const asError = (error: unknown): Error => {
	if (error instanceof Error) {
		return error
	}

	return new Error(String(error))
}

const readFileSize = (filePath: string): number => {
	try {
		return statSync(filePath).size
	} catch {
		return 0
	}
}

const toBackupPath = (destination: string, index: number) => `${destination}.${index}`

export const parseFileSize = (value: number | string | undefined, fallback = DEFAULT_MAX_SIZE_BYTES): number => {
	if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
		return Math.floor(value)
	}

	if (typeof value !== 'string') {
		return fallback
	}

	const normalized = value.trim().toLowerCase()
	if (!normalized) {
		return fallback
	}

	const matched = normalized.match(/^(\d+(?:\.\d+)?)\s*([a-z]+)?$/)
	if (!matched) {
		return fallback
	}

	const amount = Number.parseFloat(matched[1])
	if (!Number.isFinite(amount) || amount <= 0) {
		return fallback
	}

	const unit = matched[2] ?? 'b'
	const multiplier = SIZE_MULTIPLIERS[unit]

	if (!multiplier) {
		return fallback
	}

	return Math.max(1, Math.floor(amount * multiplier))
}

export const parsePositiveInteger = (value: number | string | undefined, fallback = DEFAULT_MAX_FILES): number => {
	if (typeof value === 'number' && Number.isInteger(value) && value > 0) {
		return value
	}

	if (typeof value !== 'string') {
		return fallback
	}

	const parsed = Number.parseInt(value, 10)
	if (!Number.isInteger(parsed) || parsed <= 0) {
		return fallback
	}

	return parsed
}

export class RotatingFileStream extends Writable {
	private currentSize: number
	private readonly destination: string
	private fileStream: WriteStream
	private readonly maxBackupFiles: number
	private readonly maxSize: number

	constructor(options: RotatingFileStreamOptions) {
		super({ autoDestroy: true })

		this.destination = options.destination
		this.maxSize = parseFileSize(options.maxSize)
		this.maxBackupFiles = Math.max(parsePositiveInteger(options.maxFiles) - 1, 0)

		if (options.mkdir) {
			mkdirSync(dirname(this.destination), { recursive: true })
		}

		const append = options.append !== false
		this.currentSize = append ? readFileSize(this.destination) : 0
		this.fileStream = this.createStream(append ? 'a' : 'w')
	}

	override _destroy(error: Error | null, callback: (error?: Error | null) => void) {
		this.fileStream.destroy()
		callback(error)
	}

	override _final(callback: (error?: Error | null) => void) {
		this.fileStream.end(() => callback())
	}

	override _write(chunk: Buffer | string, encoding: BufferEncoding, callback: (error?: Error | null) => void) {
		const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk, encoding)
		const writeChunk = () => {
			this.fileStream.write(buffer, (error) => {
				if (error) {
					callback(asError(error))
					return
				}

				this.currentSize += buffer.byteLength
				callback()
			})
		}

		if (this.currentSize > 0 && this.currentSize + buffer.byteLength > this.maxSize) {
			this.rotate((error) => {
				if (error) {
					callback(error)
					return
				}

				writeChunk()
			})
			return
		}

		writeChunk()
	}

	private createStream(flags: 'a' | 'w'): WriteStream {
		const stream = createWriteStream(this.destination, { flags })
		stream.on('error', (error) => this.destroy(asError(error)))
		return stream
	}

	private rotate(callback: (error?: Error) => void) {
		this.fileStream.end(() => {
			try {
				this.rotateHistory()
				this.fileStream = this.createStream('w')
				this.currentSize = 0
				callback()
			} catch (error) {
				callback(asError(error))
			}
		})
	}

	private rotateHistory() {
		if (this.maxBackupFiles === 0) {
			rmSync(this.destination, { force: true })
			return
		}

		const oldestBackup = toBackupPath(this.destination, this.maxBackupFiles)
		rmSync(oldestBackup, { force: true })

		for (let index = this.maxBackupFiles - 1; index >= 1; index--) {
			const source = toBackupPath(this.destination, index)
			if (existsSync(source)) {
				renameSync(source, toBackupPath(this.destination, index + 1))
			}
		}

		if (existsSync(this.destination) && readFileSize(this.destination) > 0) {
			renameSync(this.destination, toBackupPath(this.destination, 1))
		}
	}
}
