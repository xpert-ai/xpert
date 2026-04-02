import { IIntegration, IPagination } from "@metad/contracts"
import { Injectable } from "@nestjs/common"
import { ModuleRef } from "@nestjs/core"
import { IntegrationPermissionService } from "@xpert-ai/plugin-sdk"
import { FindManyOptions, FindOneOptions } from "typeorm"
import { IntegrationService } from "../../integration/integration.service"
import { Integration } from "../../core/entities/internal"

@Injectable()
export class PluginIntegrationPermissionService implements IntegrationPermissionService {
  constructor(private readonly moduleRef: ModuleRef) {}

  async read<TIntegration = IIntegration>(id: string, options?: FindOneOptions<Integration>): Promise<TIntegration | null> {
    if (!id) {
      return null
    }

		let integrationService: IntegrationService
		try {
			integrationService = this.moduleRef.get<IntegrationService>(IntegrationService, {
				strict: false,
			})
		} catch {
			return null
		}
		if (!integrationService) {
			return null
		}

    try {
      return (await integrationService.readOneById(id, options)) as TIntegration
    } catch {
      return null
    }
  }

  async findAll<TIntegration = IIntegration>(
    options?: FindManyOptions<Integration>
  ): Promise<IPagination<TIntegration>> {
    let integrationService: IntegrationService
    try {
      integrationService = this.moduleRef.get<IntegrationService>(IntegrationService, {
        strict: false,
      })
    } catch {
      return { items: [], total: 0 }
    }
    if (!integrationService) {
      return { items: [], total: 0 }
    }

    try {
      const result = await integrationService.findAll(options)
      return {
        items: (result?.items ?? []) as TIntegration[],
        total: result?.total ?? 0
      }
    } catch {
      return { items: [], total: 0 }
    }
  }
}
