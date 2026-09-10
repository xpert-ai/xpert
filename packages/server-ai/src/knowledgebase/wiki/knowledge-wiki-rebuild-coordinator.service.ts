import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Not, Repository } from 'typeorm'
import { KnowledgeWikiJob } from './entities'
import { KnowledgeWikiPageSchedulerService } from './knowledge-wiki-page-scheduler.service'

@Injectable()
export class KnowledgeWikiRebuildCoordinatorService {
    constructor(
        @InjectRepository(KnowledgeWikiJob) private readonly jobs: Repository<KnowledgeWikiJob>,
        private readonly scheduler: KnowledgeWikiPageSchedulerService
    ) {}

    async scheduleAfterMap(root: KnowledgeWikiJob) {
        const pending = await this.jobs.count({
            where: {
                parentJobId: root.id,
                type: 'source_map',
                isCurrent: true,
                status: Not('succeeded')
            }
        })
        if (!pending) await this.scheduler.scheduleIdentity(root)
    }
}
