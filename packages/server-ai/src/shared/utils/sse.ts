import { EventSource } from 'eventsource'

export type SSEGeneratorOptions = {
	url: string
	fetchOptionsBuilder: () => RequestInit
	completionCondition: (data: string) => boolean
	errorCondition: (data: string) => boolean
	parseData?: (data: string) => any
	signal?: AbortSignal
}

type SSEYieldValue =
	| { type: 'progress'; output: string }
	| { type: 'complete'; status: 'success' | 'fail'; result?: string; error?: string }
	| { type: 'error'; error: any }

export async function* createSSEGenerator(options: SSEGeneratorOptions): AsyncGenerator<SSEYieldValue, void> {
	const {
		url,
		fetchOptionsBuilder,
		completionCondition,
		errorCondition,
		parseData = (data) => data
	} = options

	const events: MessageEvent[] = []
	const errors: any[] = []
	// let result = ''

	const es = new EventSource(url, {
		fetch: async (input: RequestInfo, init?: RequestInit) => {
			return fetch(input, {
				...init,
				...fetchOptionsBuilder(),
				signal: options.signal
			})
		},
	} as any)

	const onMessage = (event: MessageEvent) => {
		// console.log('SSE Message:', event.data)
		events.push(event)
	}
	const onError = (error: any) => {
		console.log('SSE Error:', error)
		errors.push(error)
	}

	es.addEventListener('result', onMessage)
	// es.addEventListener('error', onError)
	es.onerror = (error: any) => {
		console.error('SSE onerror:', error)
		errors.push(error)
	}

	try {
		while (true) {
			await new Promise((resolve) => setTimeout(resolve, 50))
			if (options.signal?.aborted) {
				es.close()
				yield { type: 'error', error: new Error('Aborted') }
				return
			}

			while (errors.length > 0) {
				const error = errors.shift()
				es.close()
				yield { type: 'error', error }
				return
			}

			while (events.length > 0) {
				const event = events.shift()
				const rawData = event.data
				const data = parseData(rawData)

				if (errorCondition(data)) {
					yield { type: 'complete', status: 'fail', error: data }
					// es.close()
					return
				}

				if (completionCondition(data)) {
					yield { type: 'complete', status: 'success', result: data }
					// es.close()
					return
				}

				if (data != null) {
					// if (result) result += '\n'
					// result += data
					yield { type: 'progress', output: data }
				}
			}
		}
	} finally {
		es.removeEventListener('result', onMessage)
		es.removeEventListener('error', onError)
		es.close()
	}
}
