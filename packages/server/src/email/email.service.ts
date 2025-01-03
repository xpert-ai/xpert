import {
	EmailLanguageCodeMap,
	EmailTemplateEnum,
	IEmailTemplate,
	IInviteUserModel,
	IJoinEmployeeModel,
	IOrganization,
	IUser,
	LanguagesEnum,
} from '@metad/contracts';
import { forwardRef, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import * as Email from 'email-templates';
import * as Handlebars from 'handlebars';
import * as nodemailer from 'nodemailer';
import { Repository, IsNull } from 'typeorm';
import { environment as env } from '@metad/server-config';
import { ISMTPConfig } from '@metad/server-common';
import { TenantAwareCrudService } from './../core/crud';
import { Email as IEmail } from './email.entity';
import { Email as EmailEntity } from './email.entity';
import { RequestContext } from '../core/context';
import { EmailTemplate, Organization, User } from './../core/entities/internal';
import { CustomSmtpService } from '../custom-smtp/custom-smtp.service';

const DISALLOW_EMAIL_SERVER_DOMAIN: string[] = ['@example.com'];

@Injectable()
export class EmailService extends TenantAwareCrudService<IEmail> {
	private readonly logger = new Logger(EmailService.name)
	// private readonly email: Email;

	constructor(
		@InjectRepository(IEmail)
		private readonly emailRepository: Repository<IEmail>,

		@InjectRepository(EmailTemplate)
		private readonly emailTemplateRepository: Repository<EmailTemplate>,

		@InjectRepository(Organization)
		private readonly organizationRepository: Repository<Organization>,

		@Inject(forwardRef(() => CustomSmtpService))
		private readonly customSmtpService: CustomSmtpService,
	) {
		super(emailRepository);
		// const config: Email.EmailConfig<any> = {
		// 	message: {
		// 		from: env.smtpConfig.from
		// 	},

		// 	// if you want to send emails in development or test environments, set options.send to true.
		// 	send: true,
		// 	transport: this.createSMTPTransporter(),
		// 	i18n: {},
		// 	views: {
		// 		options: {
		// 			extension: 'hbs'
		// 		}
		// 	},
		// 	render: this.render
		// };

		// if (!env.production && !env.demo) {
		// 	// config.preview = {
		// 	// 	open: {
		// 	// 		app: 'firefox',
		// 	// 		wait: false
		// 	// 	}
		// 	// };
		// }

		// this.email = new Email(config);
	}

	/**
	 * GET email instance for tenant/organization
	 * 
	 * @param organizationId 
	 * @param tenantId 
	 * @returns 
	 */
	 private async getEmailInstance(
		organizationId?: string,
		tenantId?: string
	): Promise<Email<any>> {
		const currentTenantId = tenantId || RequestContext.currentTenantId();
		let smtpConfig: ISMTPConfig;

		try {
			const smtpTransporter = await this.customSmtpService.findOneByOptions({
				where: {
					tenantId: currentTenantId,
					organizationId
				}
			});
			smtpConfig = smtpTransporter.getSmtpTransporter() as ISMTPConfig;
		} catch (error) {
			try {
				if (error instanceof NotFoundException) {
					const smtpTransporter = await this.customSmtpService.findOneByOptions({
						where: {
							tenantId: currentTenantId,
							organizationId: IsNull()
						}
					});
					smtpConfig = smtpTransporter.getSmtpTransporter() as ISMTPConfig;
				}
			} catch (error) {
				this.logger.debug(`Can't found custom smtp, and use default smtp`)
				smtpConfig = this.customSmtpService.defaultSMTPTransporter() as ISMTPConfig;
			}
		}

		const config: Email.EmailConfig<any> = {
			message: {
				from: smtpConfig.auth.user || env.smtpConfig.from || 'no-reply@metad.com'
			},

			// if you want to send emails in development or test environments, set options.send to true.
			send: true,
			transport: smtpConfig || this.customSmtpService.defaultSMTPTransporter() as ISMTPConfig,
			i18n: {},
			views: {
				options: {
					extension: 'hbs'
				}
			},
			render: this.render
		};

		/* TODO: uncomment this after we figure out issues with dev / prod in the environment.*.ts */
		// if (!env.production && !env.demo) {
		// 	config.preview = {
		// 		open: {
		// 			app: 'firefox',
		// 			wait: false
		// 		}
		// 	};
		// }

		return new Email(config);
	}


	private render = (view, locals) => {
		return new Promise(async (resolve, reject) => {
			view = view.replace('\\', '/');
			
			const languageCode = EmailLanguageCodeMap[locals.locale] ?? locals.locale

			// Find email template for customized for given organization
			let emailTemplate: IEmailTemplate = await this.emailTemplateRepository.findOne({
				name: view,
				languageCode,
				organizationId: locals.organizationId,
				tenantId: locals.tenantId
			});

			// Try to find default language `en` template
			if (!emailTemplate) {
				emailTemplate = await this.emailTemplateRepository.findOne({
					name: view,
					languageCode: LanguagesEnum.English,
					organizationId: locals.organizationId,
					tenantId: locals.tenantId
				})
			}

			// if no email template present for given organization, use default email template
			if (!emailTemplate) {
				emailTemplate = await this.emailTemplateRepository.findOne({
					name: view,
					languageCode,
					organizationId: IsNull(),
					tenantId: locals.tenantId
				});
			}

			if (!emailTemplate) {
				emailTemplate = await this.emailTemplateRepository.findOne({
					name: view,
					languageCode: LanguagesEnum.English,
					organizationId: IsNull(),
					tenantId: locals.tenantId
				})
			}

			if (!emailTemplate) {
				return resolve('');
			}

			const template = Handlebars.compile(emailTemplate.hbs);
			const html = template(locals);
			return resolve(html);
		});
	};

	async sendAcceptInvitationEmail(joinEmployeeModel: IJoinEmployeeModel, originUrl?: string) {
		const { 
			email,
			employee,
			organization,
			languageCode,
		} = joinEmployeeModel;

		const { id: organizationId, tenantId } = organization;
		const sendOptions = {
			template: 'employee-join',
			message: {
				to: `${email}`
			},
			locals: {
				host: originUrl || env.clientBaseUrl,
				locale: languageCode,
				organizationName: organization.name,
				employeeName: employee.user.firstName,
			}
		};
		try {
			const body = {
				templateName: sendOptions.template,
				email: sendOptions.message.to,
				languageCode,
				message: '',
				organization,
			}
			const match = !!DISALLOW_EMAIL_SERVER_DOMAIN.find((server) => body.email.includes(server));
			if (!match) {
				try {
					const send = await (await this.getEmailInstance(organizationId, tenantId)).send(sendOptions);
					body['message'] = send.originalMessage;
				} catch (error) {
					console.error(error);
				}
			}
			await this.createEmailRecord(body);
		} catch (error) {
			console.error(error);
		}
	}

	async welcomeUser(
		user: IUser,
		languageCode: LanguagesEnum,
		organizationId?: string,
		originUrl?: string
	) {
		let organization: Organization;
		if (organizationId) {
			organization = await this.organizationRepository.findOne(
				organizationId
			);
		}
		const tenantId = (organization) ? organization.tenantId : RequestContext.currentTenantId();
		const sendOptions = {
			template: 'welcome-user',
			message: {
				to: `${user.email}`
			},
			locals: {
				locale: languageCode,
				email: user.email,
				host: originUrl || env.clientBaseUrl,
				organizationId: organizationId || IsNull(),
				tenantId
			}
		};
		try {
			const body = {
				templateName: sendOptions.template,
				email: sendOptions.message.to,
				languageCode,
				organization,
				message: '',
			}
			const match = !!DISALLOW_EMAIL_SERVER_DOMAIN.find((server) => body.email.includes(server));
			if (!match) {
				try {
					const send = await (await this.getEmailInstance(organizationId, tenantId)).send(sendOptions);
					body['message'] = send.originalMessage;
				} catch (error) {
					console.error(error);
				}
			}
			await this.createEmailRecord(body);
		} catch (error) {
			console.error(error);
		}
	}

	async sendVerifyEmailMail(
		user: IUser,
		languageCode: LanguagesEnum,
		url: string,
		organizationId?: string,
		originUrl?: string,
		) {
		let organization: Organization;
		if (organizationId) {
			organization = await this.organizationRepository.findOne(
				organizationId
			);
		}
		const tenantId = user.tenantId || RequestContext.currentTenantId();
		const sendOptions = {
			template: 'email-verification',
			message: {
				to: `${user.email}`
			},
			locals: {
				locale: languageCode,
				email: user.email,
				host: originUrl || env.clientBaseUrl,
				organizationId: organizationId || IsNull(),
				tenantId,
				generatedUrl: url
			}
		};

		try {
			const body = {
				templateName: sendOptions.template,
				email: sendOptions.message.to,
				languageCode,
				organization,
				message: '',
			}
			const match = !!DISALLOW_EMAIL_SERVER_DOMAIN.find((server) => body.email.includes(server));
			if (!match) {
				try {

					this.logger.debug(`try to send email:`, body)
					const email = await this.getEmailInstance(organizationId, tenantId)
					this.logger.debug(`Got email instance`)
					const send = await email.send(sendOptions);
					this.logger.debug(`Sent email`)
					body['message'] = send.originalMessage;
				} catch (error) {
					console.error(error);
				}
			}
			await this.createEmailRecord(body);

			this.logger.debug(`Created sent email record`)
		} catch (error) {
			console.error(error);
		}
	}

	async requestPassword(
		user: User,
		url: string,
		languageCode: LanguagesEnum,
		organizationId: string,
		originUrl?: string
	) {
		let organization: Organization;
		if (organizationId) {
			organization = await this.organizationRepository.findOne(
				organizationId
			);
		}
		const tenantId = (organization) ? organization.tenantId : RequestContext.currentTenantId();
		const sendOptions = {
			template: EmailTemplateEnum.PASSWORD_RESET,
			message: {
				to: `${user.email}`,
				subject: 'Forgotten Password'
			},
			locals: {
				locale: languageCode,
				generatedUrl: url,
				host: originUrl || env.clientBaseUrl,
				organizationId,
				tenantId
			}
		};

		try {
			const body = {
				templateName: sendOptions.template,
				email: sendOptions.message.to,
				languageCode,
				organization,
				message: '',
			}
			const match = !!DISALLOW_EMAIL_SERVER_DOMAIN.find((server) => body.email.includes(server));
			if (!match) {
				try {
					const send = await (await this.getEmailInstance(organizationId, tenantId)).send(sendOptions);
					body['message'] = send.originalMessage;
				} catch (error) {
					console.error(error);
				}
			}
			await this.createEmailRecord(body);
		} catch (error) {
			console.error(error);
		}
	}

	
	async inviteUser(inviteUserModel: IInviteUserModel) {
		const {
			email,
			role,
			organization,
			registerUrl,
			originUrl,
			languageCode,
			invitedBy
		} = inviteUserModel;
		const tenantId = RequestContext.currentTenantId();
		const { id: organizationId } = organization;
		const sendOptions = {
			template: 'invite-user',
			message: {
				to: `${email}`
			},
			locals: {
				locale: languageCode,
				role: role,
				organizationName: organization.name,
				organizationId,
				tenantId,
				generatedUrl: registerUrl,
				host: originUrl || env.clientBaseUrl
			}
		};
		try {
			const body = {
				templateName: sendOptions.template,
				email: sendOptions.message.to,
				languageCode,
				message: '',
				organization,
				user: invitedBy
			}
			const match = !!DISALLOW_EMAIL_SERVER_DOMAIN.find((server) => body.email.includes(server));
			if (!match) {
				try {
					const send = await (await this.getEmailInstance(organizationId, tenantId)).send(sendOptions);
					body['message'] = send.originalMessage;
				} catch (error) {
					console.error(error);
				}
			}
			await this.createEmailRecord(body);
		} catch (error) {
			console.error(error);
		}
	}

	private async createEmailRecord(createEmailOptions: {
		templateName: string;
		email: string;
		languageCode: LanguagesEnum;
		message: any;
		organization?: IOrganization;
		user?: IUser;
	}): Promise<IEmail> {
		const emailEntity = new EmailEntity();
		const {
			templateName: template,
			email,
			languageCode,
			message,
			organization,
			user
		} = createEmailOptions;
		const tenantId = (organization) ? organization.tenantId : RequestContext.currentTenantId();
		const emailTemplate = await this.emailTemplateRepository.findOne({
			name: template + '/html',
			languageCode
		});
		emailEntity.name = message.subject;
		emailEntity.email = email;
		emailEntity.content = message.html;
		emailEntity.emailTemplate = emailTemplate;
		emailEntity.tenantId = tenantId;
		emailEntity.organizationId = (organization) ? organization.id : null;
		if (user) {
			emailEntity.user = user;
		}
		return await this.emailRepository.save(emailEntity);
	}

	/*
	 * This example would connect to a SMTP server separately for every single message
	 */
	public createSMTPTransporter() {
		const smtp: ISMTPConfig = env.smtpConfig;
		return {
			host: smtp.host,
			port: smtp.port,
			secure: smtp.secure, // true for 465, false for other ports
			auth: {
				user: smtp.auth.user,
				pass: smtp.auth.pass
			}
		};
	}

	// tested e-mail send functionality
	private async nodemailerSendEmail(user: User, url: string) {
		const testAccount = await nodemailer.createTestAccount();
		const transporter = nodemailer.createTransport({
			host: 'smtp.ethereal.email',
			port: 587,
			secure: false, // true for 465, false for other ports
			auth: {
				user: testAccount.user,
				pass: testAccount.pass
			}
		});
		// Gmail example:
		// const transporter = nodemailer.createTransport({
		// 	service: 'gmail',
		// 	auth: {
		// 		user: 'user@gmail.com',
		// 		pass: 'password'
		// 	}
		// });
		const info = await transporter.sendMail({
			from: 'Peanut',
			to: user.email,
			subject: 'Forgotten Password',
			text: 'Forgot Password',
			html:
				'Hello! <br><br> We received a password change request.<br><br>If you requested to reset your password<br><br>' +
				'<a href=' +
				url +
				'>Click here</a>'
		});

		console.log('Message sent: %s', info.messageId);
		console.log('Preview URL: %s', nodemailer.getTestMessageUrl(info));
	}
}
