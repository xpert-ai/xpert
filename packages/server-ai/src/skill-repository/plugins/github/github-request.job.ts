import { Processor, Process } from '@nestjs/bull'
import { Logger } from '@nestjs/common'
import { Job } from 'bull'
import { GITHUB_REQUEST_QUEUE } from './github.constants'

export type GithubRequestInit = RequestInit & {
	responseType?: 'json' | 'arrayBuffer' | 'text'
}

export type GithubRequestJob = {
	url: string
	init?: GithubRequestInit
}

export type GithubResponse<T = any> = {
	ok: boolean
	status: number
	statusText: string
	headers: Record<string, string>
	data: T
}

@Processor(GITHUB_REQUEST_QUEUE)
export class GithubRequestProcessor {
	private readonly logger = new Logger(GithubRequestProcessor.name)

	@Process('request')
	async process(job: Job<GithubRequestJob>): Promise<GithubResponse> {
		const { url, init } = job.data
		const res = await fetch(url, init)
		const headers: Record<string, string> = {}
		res.headers.forEach((value, key) => {
			headers[key] = value
		})

		let data: any
		const responseType = init?.responseType ?? 'json'
		try {
			if (responseType === 'arrayBuffer') {
				data = Buffer.from(await res.arrayBuffer())
			} else if (responseType === 'text') {
				data = await res.text()
			} else {
				data = await res.json()
			}
		} catch (error) {
			this.logger.warn(`Failed to parse GitHub response for ${url}: ${error}`)
			data = null
		}

		return {
			ok: res.ok,
			status: res.status,
			statusText: res.statusText,
			headers,
			data
		}
	}
}
