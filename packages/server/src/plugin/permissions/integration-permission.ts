import { IIntegration } from "@metad/contracts"
import { Injectable } from "@nestjs/common"
import { ModuleRef } from "@nestjs/core"
import { IntegrationPermissionService } from "@xpert-ai/plugin-sdk"
import { FindOneOptions } from "typeorm"
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
}