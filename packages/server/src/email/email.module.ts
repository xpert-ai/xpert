import { forwardRef, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RouterModule } from '@nestjs/core';
import { EmailTemplate, EmailTemplateModule } from '../email-template';
import { Email } from './email.entity';
import { EmailService } from './email.service';
import { EmailController } from './email.controller';
import { Organization } from '../organization/organization.entity';
import { TenantModule } from '../tenant/tenant.module';
import { CustomSmtpModule } from '../custom-smtp/custom-smtp.module';

@Module({
	imports: [
		RouterModule.register([{ path: '/email', module: EmailModule }]),
		TypeOrmModule.forFeature([Email, Organization]),
		forwardRef(() => TenantModule),
		forwardRef(() => EmailTemplateModule),
		forwardRef(() => CustomSmtpModule)
	],
	controllers: [EmailController],
	providers: [EmailService],
	exports: [
		TypeOrmModule,
		EmailTemplateModule,
		CustomSmtpModule,
		EmailService
	]
})
export class EmailModule {}
