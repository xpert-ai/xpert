import { Module } from '@nestjs/common'
import { DefaultProjectReviewEnvironment } from './default-project-review.environment'
import { ProjectReviewEnvironment } from './project-review.environment'

@Module({
    providers: [{ provide: ProjectReviewEnvironment, useClass: DefaultProjectReviewEnvironment }],
    exports: [ProjectReviewEnvironment]
})
export class ProjectReviewModule {}
