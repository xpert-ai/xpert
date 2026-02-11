import { ExecutionQueueService } from './execution-queue.service'

const DEFAULT_CLIENT_DISCONNECT_GRACE_MS = 30 * 1000

export function resolveClientDisconnectGraceMs(): number {
	const raw = parseInt(process.env.XPERT_CLIENT_DISCONNECT_GRACE_MS || '', 10)
	if (Number.isFinite(raw) && raw >= 0) {
		return raw
	}
	return DEFAULT_CLIENT_DISCONNECT_GRACE_MS
}

export function abortRunAfterDisconnectGrace(params: {
	executionQueue?: ExecutionQueueService
	executionRuntime?: ExecutionQueueService
	runId: string
	abortController: AbortController
	graceMs: number
	reason?: string
}): () => void {
	const executionQueue = params.executionQueue ?? params.executionRuntime
	const { runId, abortController, graceMs } = params
	const reason = params.reason || 'Client disconnected'
	if (!executionQueue) {
		return () => undefined
	}

	if (abortController.signal.aborted || !executionQueue.getRun(runId)) {
		return () => undefined
	}

	if (graceMs <= 0) {
		abortController.abort(reason)
		return () => undefined
	}

	let timer: NodeJS.Timeout | null = setTimeout(() => {
		if (!abortController.signal.aborted && executionQueue.getRun(runId)) {
			abortController.abort(`${reason} for ${graceMs}ms`)
		}
		cancel()
	}, graceMs)
	const onAbort = () => {
		if (timer) {
			clearTimeout(timer)
			timer = null
		}
	}
	const cancel = () => {
		onAbort()
		abortController.signal.removeEventListener('abort', onAbort)
	}

	abortController.signal.addEventListener('abort', onAbort, { once: true })
	timer.unref?.()
	return cancel
}
