import z from 'zod'
import { ToolParameterValidationError } from '../../../../errors'
import { BuiltinTool } from '../../builtin-tool'
import { EmailToolset } from '../email'
import { SendEmailToolParameters } from '../types'

export class SendMailTool extends BuiltinTool {
	static lc_name(): string {
		return 'send_mail'
	}
	name = 'send_mail'
	description = 'A tool for sending email'

	schema = z.object({
		send_to: z.string().describe(`recipient email account`),
		subject: z.string().describe(`email subject`),
		email_content: z.string().describe(`email content`)
	})

	constructor(private toolset: EmailToolset) {
		super()
	}

	async _call(parameters: SendEmailToolParameters) {
		const emailRgx = /^[a-zA-Z0-9._-]+@[a-zA-Z0-9_-]+(\.[a-zA-Z0-9_-]+)+$/

		if (!emailRgx.test(parameters.send_to)) {
			throw new ToolParameterValidationError(`Email of sender to is invalid`)
		}

		return await this.toolset.sendMail(parameters)
	}
}
