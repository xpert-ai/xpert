import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { ApiKeyModule } from '../api-key/api-key.module'
import { UserModule } from '../user'
import { SecretToken } from './secret-token.entity'
import { SecretTokenService } from './secret-token.service'
import { CommandHandlers } from './commands/handlers'
import { SecretTokenStrategy } from './secret-token.strategy'

@Module({
	imports: [TypeOrmModule.forFeature([SecretToken]), ApiKeyModule, UserModule],
	providers: [SecretTokenService, SecretTokenStrategy, ...CommandHandlers],
	exports: [TypeOrmModule, SecretTokenService]
})
export class SecretTokenModule {}
