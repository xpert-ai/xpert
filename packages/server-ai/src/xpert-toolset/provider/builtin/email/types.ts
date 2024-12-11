import { TToolCredentials } from '@metad/contracts'

export type EmailToolCredentials = TToolCredentials & {
	email_account: string
	email_password: string
	smtp_port: string
	smtp_server: string
	encrypt_method: string
}

export type SendEmailToolParameters = {
	send_to: string
	subject: string
	email_content: string
}
