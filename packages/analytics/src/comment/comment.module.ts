import { SharedModule, UserModule } from '@metad/server-core'
import { forwardRef, Module } from '@nestjs/common'
import { CqrsModule } from '@nestjs/cqrs'
import { TypeOrmModule } from '@nestjs/typeorm'
import { RouterModule } from '@nestjs/core'
import { CommentController } from './comment.controller'
import { CommentService } from './comment.service'
import { Comment } from './comment.entity'

@Module({
	imports: [
		RouterModule.register([{ path: '/comment', module: CommentModule }]),
		TypeOrmModule.forFeature([Comment]),
		SharedModule,
		CqrsModule,
		UserModule
	],
	controllers: [CommentController],
	providers: [CommentService],
	exports: [CommentService]
})
export class CommentModule {}
