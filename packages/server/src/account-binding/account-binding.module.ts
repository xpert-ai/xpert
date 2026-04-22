import { Module } from '@nestjs/common'
import { RouterModule } from '@nestjs/core'
import { TypeOrmModule } from '@nestjs/typeorm'
import { User } from '../user/user.entity'
import { AccountBindingController } from './account-binding.controller'
import { AccountBindingService } from './account-binding.service'
import { ExternalIdentityBinding } from './external-identity-binding.entity'

@Module({
	imports: [
		RouterModule.register([{ path: '/account-binding', module: AccountBindingModule }]),
		TypeOrmModule.forFeature([ExternalIdentityBinding, User])
	],
	controllers: [AccountBindingController],
	providers: [AccountBindingService],
	exports: [AccountBindingService, TypeOrmModule]
})
export class AccountBindingModule {}
