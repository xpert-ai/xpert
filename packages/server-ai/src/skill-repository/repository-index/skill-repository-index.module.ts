import { TenantModule } from '@metad/server-core'
import { forwardRef, Module } from '@nestjs/common'
import { CqrsModule } from '@nestjs/cqrs'
import { TypeOrmModule } from '@nestjs/typeorm'
import { SkillRepositoryIndexController } from './skill-repository-index.controller'
import { SkillRepositoryIndex } from './skill-repository-index.entity'
import { SkillRepositoryIndexService } from './skill-repository-index.service'
import { SkillRepositoryModule } from '../skill-repository.module'

@Module({
	imports: [TypeOrmModule.forFeature([SkillRepositoryIndex]), TenantModule, CqrsModule, forwardRef(() => SkillRepositoryModule)],
	controllers: [SkillRepositoryIndexController],
	providers: [SkillRepositoryIndexService],
	exports: [SkillRepositoryIndexService]
})
export class SkillRepositoryIndexModule {}
