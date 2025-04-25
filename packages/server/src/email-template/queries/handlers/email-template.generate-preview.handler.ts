import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { ConfigService } from '@metad/server-config';
import Handlebars from 'handlebars';
import mjml2html from 'mjml';
import { EmailTemplateService } from '../../email-template.service';
import { EmailTemplateGeneratePreviewQuery } from '../email-template.generate-preview.query';


@QueryHandler(EmailTemplateGeneratePreviewQuery)
export class EmailTemplateGeneratePreviewHandler
	implements IQueryHandler<EmailTemplateGeneratePreviewQuery> {
	constructor(
		private readonly emailTemplateService: EmailTemplateService,
		private readonly configService: ConfigService
	) {}

	public async execute(
		command: EmailTemplateGeneratePreviewQuery
	): Promise<{ html: string }> {
		const { input } = command;
		let textToHtml = input;

		try {
			const mjmlTohtml = mjml2html(input);
			textToHtml = mjmlTohtml.errors.length ? input : mjmlTohtml.html;
		} catch (error) {
			// ignore mjml conversion errors for non-mjml text such as subject
		}

		const clientBaseUrl = this.configService.get('clientBaseUrl');
		const host = this.configService.get('host');

		const handlebarsTemplate = Handlebars.compile(textToHtml);
		const html = handlebarsTemplate({
			organizationName: 'Organization',
			email: 'user@domain.com',
			name: 'John Doe',
			role: 'USER_ROLE',
			host: clientBaseUrl || host,
			hostEmail: '(alish@gmail.com)',
			agenda: 'This booking is for metad call',
			description: 'This is a test appointment booking',
			participantEmails: 'i.tiwen.wang@gmail.com,testmail@hotmail.com',
			location: 'zoom.us',
			duration: 'Fri, Jul 24, 2020 6:00 AM - Fri, Jul 24, 2020 6:15 AM',
			candidateName: 'Alex',
			date: 'Thursday, August 27, 2020',
			interviewerName: 'John Doe',
			total_hours: '16',
			average_activates: '25',
			log_type: 'tracked',
			projects: ['Metad Web Site', 'Metad Platform'],
			project: 'Metad Web Site',
			timesheet_action: 'APPROVE/REJECT',
			equipment_status: 'APPROVE/REJECT',
			reason: 'reason for this',
			equipment_name: 'Fiat Freemont',
			equipment_type: 'Car',
			equipment_serial_number: 'CB0950AT',
			manufactured_year: '2015',
			initial_cost: '40000',
			currency: 'BGN',
			max_share_period: '5',
			autoApproveShare: false,
			generatedUrl: 'https://app.mtda.cloud/xxxxxxxxxxxxxxxxx'
		});
		return { html };
	}
}
