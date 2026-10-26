import { AsyncLocalStorage } from 'node:async_hooks'
import type { TaskControlRef } from '@xpert-ai/plugin-sdk'

const context = new AsyncLocalStorage<{ reference: TaskControlRef; execution?: () => string | undefined }>()
export const currentTaskControl = () => context.getStore()?.reference
export const currentTaskExecution = () => context.getStore()?.execution?.()
export const withTaskControl = <T>(reference: TaskControlRef, work: () => T, execution?: () => string | undefined): T =>
	context.run({ reference, execution }, work)

export async function* taskControlledStream<T>(
	reference: TaskControlRef,
	source: () => AsyncIterable<T> | Promise<AsyncIterable<T>>,
	execution?: () => string | undefined
): AsyncGenerator<T> {
	const stream = await withTaskControl(reference, source, execution)
	const iterator = stream[Symbol.asyncIterator]()
	try {
		while (true) {
			const next = await withTaskControl(reference, () => iterator.next(), execution)
			if (next.done) return
			yield next.value
		}
	} finally {
		await withTaskControl(reference, () => iterator.return?.(), execution)
	}
}
