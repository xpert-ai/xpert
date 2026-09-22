import { SetMetadata } from '@nestjs/common'
import path from 'path'
import { fileURLToPath } from 'node:url'
import { STRATEGY_META_KEY } from '../types'


export const AI_MODEL_PROVIDER = 'AI_MODEL_PROVIDER'

/**
 * Extracts a filesystem path from one V8 stack frame line.
 *
 * Frames differ by platform and module system:
 *   - `at file:///home/u/proj/a.js:1:2`                 (ESM, POSIX)
 *   - `at Object.<anonymous> (/home/u/proj/a.js:1:2)`   (CJS, POSIX)
 *   - `at file:///C:/proj/a.js:1:2`                     (ESM, Windows)
 *   - `at Object.<anonymous> (C:\proj\a.js:1:2)`        (CJS, Windows)
 *
 * The `:line:col` suffix is stripped *before* a file URL is converted, so the
 * position can never leak into the resolved path.
 */
export function resolveStackFramePath(callerLine?: string): string | undefined {
	const match =
		callerLine?.match(/\((file:\/\/\/[^\s)]+)\)/) || // case 1: file:///path...
		callerLine?.match(/\((\/[^\s)]+)\)/) || // case 2: (/Users/xxx)
		callerLine?.match(/at (file:\/\/\/[^\s]+)/) || // case 3: at file:///...
		callerLine?.match(/at (\/[^\s]+)/) || // case 4: at /Users/xxx
		// case 5/6: Windows frames carry a drive letter, e.g. (C:\proj\src\a.ts:1:2)
		callerLine?.match(/\(([A-Za-z]:[\\/][^\s)]+)\)/) ||
		callerLine?.match(/at ([A-Za-z]:[\\/][^\s]+)/)

	let file = match?.[1]?.replace(/:\d+:\d+$/, '')

	if (file?.startsWith('file://')) {
		// `fileURLToPath` drops the leading slash before a Windows drive letter and
		// decodes percent-escapes. A plain `replace('file://', '')` leaves "/C:/...",
		// which is not a valid Windows path.
		try {
			file = fileURLToPath(file)
		} catch {
			// Not a path this platform can map (e.g. a POSIX frame observed on Windows);
			// fall back to stripping the scheme so the directory is still usable.
			file = file.replace(/^file:\/\//, '')
		}
	} else if (file) {
		// Decode URL-encoded paths (e.g. Chinese characters: %E9%A1%B9%E7%9B%AE -> 项目)
		try {
			file = decodeURIComponent(file)
		} catch {
			// keep as-is if decode fails
		}
	}

	return file
}

export function AIModelProviderStrategy(provider: string) {
	const err = new Error()
	const stack = err.stack?.split('\n') ?? []

	// Find the current decorator function's position on the stack.
	const decoratorIndex = stack.findIndex((line) =>
		line.includes('AIModelProviderStrategy')
	)

	// The line that calls the decorator (the next line)
	const file = resolveStackFramePath(stack[decoratorIndex + 1])

	const dir = file ? path.dirname(file) : process.cwd()

	return function (target: any) {
		SetMetadata(STRATEGY_META_KEY, AI_MODEL_PROVIDER)(target)
		// Ensure NestJS is discoverable
		SetMetadata(AI_MODEL_PROVIDER, provider)(target)
		// Write custom path (does not affect Discovery)
		Reflect.defineMetadata(`${AI_MODEL_PROVIDER}_DIR`, dir, target)
	}
}
