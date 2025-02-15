import { Entity, Column, AfterLoad } from 'typeorm';
import { ApiProperty } from '@nestjs/swagger';
import { ICustomSmtp } from '@metad/contracts';
import { ISMTPConfig } from '@metad/server-common';
import { Exclude, Expose } from 'class-transformer';
import { IsBoolean, IsEmail, IsNotEmpty, IsNumber, IsOptional, IsString } from 'class-validator';
import { TenantOrganizationBaseEntity } from '../core/entities/internal';
import { IsSecret, WrapSecrets } from './../core/decorators';

@Entity('custom_smtp')
export class CustomSmtp
	extends TenantOrganizationBaseEntity
	implements ICustomSmtp {

	@ApiProperty({ type: () => String, examples: ['noreply@domain.com'] })
	@IsEmail()
	@Column({ nullable: true })
	fromAddress?: string
	
	@ApiProperty({ type: () => String })
	@IsString()
	@Column()
	host: string;

	@ApiProperty({ type: () => Number })
	@IsNumber()
	@Column()
	port: number;

	@ApiProperty({ type: () => Boolean })
	@IsBoolean()
	@Column()
	secure: boolean;

	@ApiProperty({ type: () => String })
	@IsNotEmpty()
	@Exclude({ toPlainOnly: true })
	@Column()
	username: string;

	@ApiProperty({ type: () => String })
	@IsNotEmpty()
	@Exclude({ toPlainOnly: true })
	@Column()
	password: string;

	@ApiProperty({ type: () => Boolean, default: false })
	@IsOptional()
	@IsBoolean()
	@Column({ default: false })
	isValidate?: boolean;

	@ApiProperty({ type: () => String })
	@Expose({ toPlainOnly: true, name: 'username' })
	@IsSecret()
	secretKey?: string;

	@ApiProperty({ type: () => String })
	@Expose({ toPlainOnly: true, name: 'password' })
	@IsSecret()
	secretPassword?: string;

	/**
    * Called after entity is loaded.
    */
	@AfterLoad()
	afterLoadEntity?() {
		this.secretKey = this.username;
		this.secretPassword = this.password;
		WrapSecrets(this, this);
	}

	/**
	 * Get SMTP transporter configuration
	 *
	 * @returns
	 */
	getSmtpTransporter?(): ISMTPConfig {
		return {
			fromAddress: this.fromAddress,
			host: this.host,
			port: this.port,
			secure: this.secure || false, // true for 465, false for other ports
			auth: {
				user: this.username,
				pass: this.password
			}
		} as ISMTPConfig;
	}
}
