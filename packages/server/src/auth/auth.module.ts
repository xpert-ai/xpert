import { SocialAuthModule } from '@metad/server-auth'
import { Module } from '@nestjs/common'
import { CqrsModule } from '@nestjs/cqrs'
import { TypeOrmModule } from '@nestjs/typeorm'
import { RouterModule } from '@nestjs/core'
import { EmailModule, EmailService } from '../email'
import { PasswordResetModule } from '../password-reset/password-reset.module'
import { RoleModule } from '../role/role.module'
import { TenantModule } from '../tenant/tenant.module'
import { UserModule } from '../user'
import { UserOrganizationService } from '../user-organization/user-organization.services'
import { UserService } from '../user/user.service'
import { Organization, UserOrganization } from './../core/entities/internal'
import { AuthController } from './auth.controller'
import { AuthService } from './auth.service'
import { CommandHandlers } from './commands/handlers'
import { BasicStrategy, JwtStrategy, WsJwtStrategy, RefreshTokenStrategy } from './strategies'

const providers = [AuthService, UserService, UserOrganizationService, EmailService]

@Module({
	imports: [
		RouterModule.register([
			{
				path: '/auth',
				module: AuthModule,
				children: [{ path: '/', module: SocialAuthModule }]
			}
		]),
		SocialAuthModule.registerAsync({
			imports: [AuthModule, CqrsModule, TenantModule, UserModule, PasswordResetModule, RoleModule],
			useClass: AuthService
		}),
		TypeOrmModule.forFeature([UserOrganization, Organization]),
		EmailModule,
		TenantModule,
		RoleModule,
		UserModule,
		PasswordResetModule,
		CqrsModule,
	],
	controllers: [AuthController],
	providers: [
		...providers,
		...CommandHandlers,
		BasicStrategy,
		JwtStrategy,
		RefreshTokenStrategy,
		WsJwtStrategy,
	],
	exports: [...providers]
})
export class AuthModule {}
