import { SocialAuthModule } from '@xpert-ai/server-auth'
import { SSOProviderRegistry } from '@xpert-ai/plugin-sdk'
import { forwardRef, Module } from '@nestjs/common'
import { CqrsModule } from '@nestjs/cqrs'
import { TypeOrmModule } from '@nestjs/typeorm'
import { DiscoveryModule, RouterModule } from '@nestjs/core'
import { RedisModule } from '../core'
import { AccountBindingModule } from '../account-binding'
import { EmailModule, EmailService } from '../email'
import { PasswordResetModule } from '../password-reset/password-reset.module'
import { RoleModule } from '../role/role.module'
import { TenantModule } from '../tenant/tenant.module'
import { UserModule } from '../user'
import { OrganizationModule } from '../organization'
import { UserOrganizationService } from '../user-organization/user-organization.services'
import { UserService } from '../user/user.service'
import { Organization, UserOrganization } from './../core/entities/internal'
import { AuthController } from './auth.controller'
import { AuthService } from './auth.service'
import { AuthSsoBindingService } from './sso/auth-sso-binding.service'
import { AuthSsoController } from './sso/auth-sso.controller'
import { AuthSsoDiscoveryService } from './sso/auth-sso-discovery.service'
import { PendingSsoBindingChallengeService } from './sso/pending-sso-binding-challenge.service'
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
			imports: [forwardRef(() => AuthModule)],
			useExisting: AuthService
		}),
		TypeOrmModule.forFeature([UserOrganization, Organization]),
		RedisModule,
		EmailModule,
		AccountBindingModule,
		TenantModule,
		RoleModule,
		OrganizationModule,
		UserModule,
		PasswordResetModule,
		CqrsModule,
		DiscoveryModule
	],
	controllers: [AuthController, AuthSsoController],
	providers: [
		...providers,
		AuthSsoDiscoveryService,
		AuthSsoBindingService,
		PendingSsoBindingChallengeService,
		SSOProviderRegistry,
		...CommandHandlers,
		BasicStrategy,
		JwtStrategy,
		RefreshTokenStrategy,
		WsJwtStrategy,
	],
	exports: [...providers, PendingSsoBindingChallengeService]
})
export class AuthModule {}
