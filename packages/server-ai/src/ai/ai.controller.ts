import {
	Body,
	Controller,
	ForbiddenException,
	Get,
	Headers,
	HttpException,
	HttpStatus,
	Logger,
	Param,
	Post,
	Res,
} from '@nestjs/common'
import { QueryBus } from '@nestjs/cqrs'
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger'
import { ServerResponse } from 'http'
import { CopilotService } from '../copilot'
import { AiService } from './ai.service'
import { GetAiProviderCredentialsQuery } from '../copilot-provider/queries'


@ApiTags('AI/Chat')
@ApiBearerAuth()
@Controller()
export class AIController {
	readonly #logger = new Logger(AIController.name)

	constructor(
		private readonly aiService: AiService,
		private readonly copilotService: CopilotService,
		private readonly queryBus: QueryBus
	) {}

	@Get('proxy/:copilotId/:m')
	async proxyGetModule(@Param('copilotId') copilotId: string, @Param('m') m: string, @Headers() headers) {
		const path = '/' + m
		const copilot = await this.aiService.getCopilot(copilotId)
		const copilotUrl = path // chatCompletionsUrl(copilot, path)
		try {
			const response = await fetch(copilotUrl, {
				method: 'GET',
				headers: {
					'content-type': 'application/json',
					authorization: `Bearer ${copilot.apiKey}`,
					accept: headers.accept
				}
			})
			// return response
			return await response.json()
		} catch (error) {
			this.#logger.error(`Try to call ai api '${copilotUrl}'
failed: ${error.message}`)
			throw new HttpException(error.message, HttpStatus.INTERNAL_SERVER_ERROR)
		}
	}
	
	@Post('proxy/:copilotId/:m')
	async proxyModule(
		@Param('copilotId') copilotId: string,
		@Param('m') m: string,
		@Headers() headers,
		@Body() body: any,
		@Res() resp: ServerResponse
	) {
		const path = '/' + m
		return await this.proxy(copilotId, path, headers, body, resp)
	}

	@Post('proxy/:copilotId/:m/:f')
	async proxyModuleFun(
		@Param('copilotId') copilotId: string,
		@Param('m') m: string,
		@Param('f') f: string,
		@Headers() headers,
		@Body() body: any,
		@Res() resp: ServerResponse
	) {
		const path = '/' + m + (f ? '/' + f : '')
		await this.proxy(copilotId, path, headers, body, resp)
	}

	async proxy(copilotId: string, path: string, headers: any, body: any, resp: ServerResponse) {
		let copilot = null
		let copilotUrl = null
		let _authorization = null
		try {
			copilot = await this.aiService.getCopilot(copilotId)
			const { baseURL, authorization } = await this.queryBus.execute(new GetAiProviderCredentialsQuery(copilot.modelProvider))
			copilotUrl = `${baseURL}${path}`
			_authorization = authorization
		} catch (err) {
			throw new ForbiddenException(err.message)
		}

		try {
			const response = await fetch(copilotUrl, {
				method: 'POST',
				body: JSON.stringify(body),
				headers: {
					'content-type': 'application/json',
					authorization: _authorization,
					accept: headers.accept
				}
			})

			if (!resp.headersSent) {
				const headers = {
					'content-type': response.headers.get('content-type'),
					'cache-control': 'no-cache',
					'connection': 'keep-alive',
				}
				if (response.headers.get('transfer-encoding')) {
					headers['transfer-encoding'] = response.headers.get('transfer-encoding')
				}
				if (response.headers.get('access-control-allow-origin')) {
					headers['access-control-allow-origin'] = response.headers.get('access-control-allow-origin')
				}

				resp.writeHead(response.status, headers)
			}
			const reader = response.body.getReader()

			const decoder = new TextDecoder()
			const read = async () => {
				const { done, value } = await reader.read()
				if (done) {
					resp.end()
					return
				}
				if (value) {
					const text = decoder.decode(value, { stream: true })
					resp.write(text)
				}
				await read()
			}
			await read()
		} catch (error) {
			this.#logger.error(`Try to call ai api '${copilotUrl}' with body:
\`\`\`
${JSON.stringify(body)}
\`\`\`
failed: ${error.message}`)
			throw new HttpException(error.message, HttpStatus.INTERNAL_SERVER_ERROR)
		}
	}
}
