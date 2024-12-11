import z from 'zod'
import { ToolParameterValidationError } from '../../../../errors'
import { BuiltinTool } from '../../builtin-tool'
import { EmailToolset } from '../email'
import { SendEmailToolParameters } from '../types'

export class SendMailBatchTool extends BuiltinTool {

	static lc_name(): string {
		return 'send_mail_batch'
	}
	name = 'send-mail-batch'
	description = 'A tool for sending email to multiple recipients'

	schema = z.object({
		send_to: z.array(z.string()).describe(`recipient email account(json list: string array)`),
		subject: z.string().describe(`email subject`),
		email_content: z.string().describe(`email content`)
	})

	constructor(private toolset: EmailToolset) {
		super()
	}

	async _call(parameters: SendEmailToolParameters) {
		const emailRgx = /^[a-zA-Z0-9._-]+@[a-zA-Z0-9_-]+(\.[a-zA-Z0-9_-]+)+$/

		const receiversEmail = JSON.parse(parameters.send_to) as string[]
		receiversEmail.forEach((receiver) => {
			if (!emailRgx.test(receiver)) {
				throw new ToolParameterValidationError(`Email of sender to '${receiver}' is invalid`)
			}
		})

		for await (const receiver of receiversEmail) {
			await this.toolset.sendMail({
				...parameters,
				send_to: receiver
			})
		}
	}
}
