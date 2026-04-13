import { IScreenshot } from '@xpert-ai/contracts'
import { TenantOrganizationAwareCrudService } from '@xpert-ai/server-core'
import { ForbiddenException, Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { DeleteQueryDTO } from './dto'
import { Screenshot } from './screenshot.entity'

@Injectable()
export class ScreenshotService extends TenantOrganizationAwareCrudService<Screenshot> {
	constructor(
		@InjectRepository(Screenshot)
		protected readonly screenshotRepository: Repository<Screenshot>
	) {
		super(screenshotRepository)
	}

	/**
	 * DELETE screenshot by ID
	 *
	 * @param criteria
	 * @param options
	 * @returns
	 */
	async deleteScreenshot(id: IScreenshot['id'], options?: DeleteQueryDTO<Screenshot>): Promise<IScreenshot> {
		try {
			const screenshot = await this.findOne(id)
			return await this.repository.remove(screenshot)
		} catch (error) {
			throw new ForbiddenException()
		}
	}
}
