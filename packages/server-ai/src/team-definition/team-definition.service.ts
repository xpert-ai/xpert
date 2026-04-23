import { createTeamId, createXpertId, ITeamDefinition, XpertTypeEnum } from '@xpert-ai/contracts'
import { Injectable, NotFoundException } from '@nestjs/common'
import { PublishedXpertAccessService } from '../xpert/published-xpert-access.service'
import { Xpert } from '../xpert/xpert.entity'

@Injectable()
export class TeamDefinitionService {
	constructor(private readonly publishedXpertAccessService: PublishedXpertAccessService) {}

	async findAll(): Promise<ITeamDefinition[]> {
		const xperts = await this.publishedXpertAccessService.findAccessiblePublishedXperts({
			where: {
				type: XpertTypeEnum.Agent,
				latest: true
			},
			relations: ['agents'],
			order: {
				createdAt: 'DESC'
			}
		})

		return xperts.map((xpert) => this.toTeamDefinition(xpert))
	}

	async findOne(id: ITeamDefinition['id'] | string): Promise<ITeamDefinition> {
		const xpert = await this.publishedXpertAccessService.getAccessiblePublishedXpert(id, {
			relations: ['agents']
		})

		if (xpert.type !== XpertTypeEnum.Agent || xpert.latest !== true) {
			throw new NotFoundException(`Team definition ${id} was not found`)
		}

		return this.toTeamDefinition(xpert)
	}

	private toTeamDefinition(xpert: Xpert): ITeamDefinition {
		return {
			id: createTeamId(xpert.id),
			tenantId: xpert.tenantId,
			organizationId: xpert.organizationId,
			createdAt: xpert.createdAt,
			updatedAt: xpert.updatedAt,
			deletedAt: xpert.deletedAt,
			createdById: xpert.createdById,
			updatedById: xpert.updatedById,
			name: xpert.name,
			description: xpert.description,
			avatar: xpert.avatar,
			source: 'xpert',
			memberCount: 1 + (xpert.agents?.length ?? 0),
			leadAssistantId: createXpertId(xpert.id)
		}
	}
}
