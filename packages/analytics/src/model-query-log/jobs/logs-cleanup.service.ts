import { Injectable, Logger } from '@nestjs/common'
import { Cron } from '@nestjs/schedule'
import { InjectRepository } from '@nestjs/typeorm'
import { LessThan, Repository } from 'typeorm'
import { SemanticModelQueryLog } from '../log.entity'

@Injectable()
export class QueryLogsCleanupService {
	private readonly logger = new Logger(QueryLogsCleanupService.name)

	constructor(
		@InjectRepository(SemanticModelQueryLog)
		private readonly queryLogRepository: Repository<SemanticModelQueryLog>
	) {}

	// 每天凌晨 2:00 运行清理任务
	@Cron('0 2 * * *')
	async cleanupOldLogs() {
		const thirtyDaysAgo = new Date()
		thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

		this.logger.log(`Cleaning up OLAP Query Logs older than: ${thirtyDaysAgo.toISOString()}`)
		const oldLogs = await this.queryLogRepository.find({
			where: { createdAt: LessThan(thirtyDaysAgo) },
			select: ['id']
		})

		const idsToDelete = oldLogs.map((log) => log.id)

    if (idsToDelete.length) {
		 const deleteResult = await this.queryLogRepository.delete(idsToDelete)
  		this.logger.log(`Deleted ${deleteResult.affected} OLAP Query Logs.`)
    }
	}
}
