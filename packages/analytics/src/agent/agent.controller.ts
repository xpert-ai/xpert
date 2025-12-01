import { Controller, Get } from '@nestjs/common'
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger'
import { TENANT_AGENT_LOCAL_URL } from '@metad/contracts'
import { TenantSettingService } from '@metad/server-core'

@ApiTags('Agent')
@ApiBearerAuth()
@Controller('agent')
export class AgentController {
  constructor(private tenantSettingService: TenantSettingService) {}

  @Get()
  async get() {
    return await this.tenantSettingService.findOneOrFailByWhereOptions({
      name: TENANT_AGENT_LOCAL_URL
    })
  }
}
