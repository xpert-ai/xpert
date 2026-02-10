import { Injectable } from '@nestjs/common'
import { ModuleRef } from '@nestjs/core'
import { IntegrationPermissionService, UserPermissionService } from '@xpert-ai/plugin-sdk'
import { IntegrationService } from '../integration'
import { UserService } from '../user'

@Injectable()
export class PluginIntegrationPermissionService implements IntegrationPermissionService {
  constructor(private readonly moduleRef: ModuleRef) {}

  async read<TIntegration = any>(id: string, options?: Record<string, any>): Promise<TIntegration | null> {
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
      return (await integrationService.findOne(id, options as any)) as TIntegration
    } catch {
      return null
    }
  }
}

@Injectable()
export class PluginUserPermissionService implements UserPermissionService {
  constructor(private readonly moduleRef: ModuleRef) {}

  async read<TUser = any>(criteria: Record<string, any>): Promise<TUser | null> {
    if (!criteria || typeof criteria !== 'object') {
      return null
    }

		let userService: UserService
		try {
			userService = this.moduleRef.get<UserService>(UserService, {
				strict: false,
			})
		} catch {
			return null
		}
		if (!userService) {
			return null
		}

    try {
      return (await userService.findOneByWhereOptions(criteria as any)) as TUser
    } catch {
      return null
    }
  }
}
