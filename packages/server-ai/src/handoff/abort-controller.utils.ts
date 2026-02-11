export function createForwardingController(
	signals: Array<AbortSignal | null | undefined>
): AbortController {
	const controller = new AbortController()
	const activeSignals = signals.filter((signal): signal is AbortSignal => !!signal)

	if (!activeSignals.length) {
		return controller
	}

	const listeners: Array<{ signal: AbortSignal; handler: () => void }> = []

	const clearListeners = () => {
		for (const { signal, handler } of listeners) {
			signal.removeEventListener('abort', handler)
		}
		listeners.length = 0
	}

	const forwardAbort = (upstream: AbortSignal) => {
		if (!controller.signal.aborted) {
			controller.abort(upstream.reason)
		}
		clearListeners()
	}

	for (const signal of activeSignals) {
		if (signal.aborted) {
			forwardAbort(signal)
			return controller
		}

		const handler = () => forwardAbort(signal)
		listeners.push({ signal, handler })
		signal.addEventListener('abort', handler, { once: true })
	}

	controller.signal.addEventListener('abort', clearListeners, { once: true })

	return controller
}
