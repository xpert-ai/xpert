import { IXpertToolset } from '@metad/contracts'
import { BuiltinToolset } from '../builtin-toolset'
import { createTransporter, verifyTransporter } from './tools/send'
import { EmailToolCredentials, SendEmailToolParameters } from './types'
import { SendMailTool } from './tools/send_mail'
import { SendMailBatchTool } from './tools/send_mail_batch'

export class EmailToolset extends BuiltinToolset {
	static provider = 'email'

	constructor(protected toolset?: IXpertToolset) {
		super(EmailToolset.provider, toolset)

		this.tools = []
		toolset?.tools.forEach((tool) => {
			switch(tool.name) {
				case 'send_mail': {
					this.tools.push(new SendMailTool(this))
					break
				}
				case 'send_mail_batch': {
					this.tools.push(new SendMailBatchTool(this))
					break
				}
			}
		})
	}

	async _validateCredentials(credentials: EmailToolCredentials): Promise<void> {
		await verifyTransporter(credentials)
	}

	public async sendMail(params: SendEmailToolParameters): Promise<boolean> {
		const transporter = createTransporter(this.toolset.credentials as EmailToolCredentials)
		const mailOptions = {
			from: this.toolset.credentials.email_account,
			to: params.send_to,
			subject: params.subject,
			text: params.email_content,
			html: params.email_content
		}

		try {
			await transporter.sendMail(mailOptions)
			return true
		} catch (error) {
			this.logger.error('send email failed', error.stack)
			return false
		}
	}
}
