import * as nodemailer from 'nodemailer'
import { EmailToolCredentials, SendEmailToolParameters } from '../types'

export async function sendMail(params: SendEmailToolParameters & EmailToolCredentials): Promise<boolean> {
	const transporter = createTransporter(params)
	const mailOptions = {
		from: params.email_account,
		to: params.sender_to,
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

export function createTransporter(params: EmailToolCredentials) {
	const transporter = nodemailer.createTransport({
		host: params.smtp_server,
		port: params.smtp_port,
		secure: params.encrypt_method?.toUpperCase() === 'SSL', // true for 465, false for other ports
		auth: {
			user: params.email_account,
			pass: params.email_password
		},
		tls: {
			rejectUnauthorized: false
		}
	})

	return transporter
}

export async function verifyTransporter(params: EmailToolCredentials) {
	return new Promise((resolve, reject) => {
		try {
			const transporter = createTransporter(params)
			transporter.verify(function (error, success) {
				if (error) {
					console.log(error)
					reject(error)
				} else {
					resolve(true)
				}
			})
		} catch (error) {
			reject(error)
		}
	})
}
