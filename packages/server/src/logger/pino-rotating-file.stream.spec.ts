import { existsSync, mkdtempSync, readFileSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import * as path from 'path'
import { RotatingFileStream, parseFileSize, parsePositiveInteger } from './pino-rotating-file.stream'

const writeAsync = (stream: RotatingFileStream, chunk: string) =>
	new Promise<void>((resolve, reject) => {
		stream.write(chunk, (error) => {
			if (error) {
				reject(error)
				return
			}

			resolve()
		})
	})

const endAsync = (stream: RotatingFileStream) =>
	new Promise<void>((resolve, reject) => {
		stream.once('error', reject)
		stream.end(() => resolve())
	})

describe('RotatingFileStream', () => {
	let tempDir: string

	beforeEach(() => {
		tempDir = mkdtempSync(path.join(tmpdir(), 'pino-rotation-'))
	})

	afterEach(() => {
		rmSync(tempDir, { recursive: true, force: true })
	})

	it('rotates files when the active log exceeds the configured size', async () => {
		const destination = path.join(tempDir, 'xpert-server.log')
		const stream = new RotatingFileStream({
			destination,
			mkdir: true,
			maxSize: 10,
			maxFiles: 3
		})

		await writeAsync(stream, 'line-1\n')
		await writeAsync(stream, 'line-2\n')
		await writeAsync(stream, 'line-3\n')
		await endAsync(stream)

		expect(readFileSync(destination, 'utf8')).toBe('line-3\n')
		expect(readFileSync(`${destination}.1`, 'utf8')).toBe('line-2\n')
		expect(readFileSync(`${destination}.2`, 'utf8')).toBe('line-1\n')
		expect(existsSync(`${destination}.3`)).toBe(false)
	})

	it('parses rotation settings from human-readable values', () => {
		expect(parseFileSize('2m')).toBe(2 * 1024 * 1024)
		expect(parsePositiveInteger('7')).toBe(7)
	})
})
