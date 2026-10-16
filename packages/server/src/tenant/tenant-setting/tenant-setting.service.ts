import {
	COPILOT_CHECKPOINT_RETENTION_DAYS_SETTING,
	COPILOT_CHECKPOINT_RETENTION_ENABLED_SETTING,
	ITenantSetting,
	MODEL_GATEWAY_CALL_RETENTION_DAYS_SETTING,
	MODEL_GATEWAY_CALL_RETENTION_ENABLED_SETTING,
	RolesEnum
} from '@xpert-ai/contracts'
import { ForbiddenException, Injectable } from '@nestjs/common'
import { getDefaultTenantId, RequestContext } from '@xpert-ai/plugin-sdk'
import { t } from 'i18next'
import { InjectRepository } from '@nestjs/typeorm'
import { FindManyOptions, In, Repository } from 'typeorm'
import { indexBy, keys, object, pluck } from 'underscore'
import { TenantAwareCrudService } from './../../core/crud'
import { TenantSetting } from './tenant-setting.entity'

const retentionSettingNames = [
	COPILOT_CHECKPOINT_RETENTION_ENABLED_SETTING,
	COPILOT_CHECKPOINT_RETENTION_DAYS_SETTING,
	MODEL_GATEWAY_CALL_RETENTION_ENABLED_SETTING,
	MODEL_GATEWAY_CALL_RETENTION_DAYS_SETTING
]

@Injectable()
export class TenantSettingService extends TenantAwareCrudService<TenantSetting> {
	constructor(
		@InjectRepository(TenantSetting)
		private tenantSettingRepository: Repository<TenantSetting>
	) {
		super(tenantSettingRepository)
	}

	/**
	 * Retrieves tenant settings from the database based on the ORM type being used.
	 *
	 * @param {FindManyOptions} [request] - Optional query options for filtering settings.
	 * @returns {Promise<Record<string, any>>} - A key-value pair object where keys are setting names and values are setting values.
	 *
	 * @throws {Error} - Throws an error if the ORM type is not implemented.
	 */
	async getSettings(request?: FindManyOptions<TenantSetting>): Promise<Record<string, any>> {
		const settings: TenantSetting[] = await this.repository.find(request)

		return object(pluck(settings, 'name'), pluck(settings, 'value'))
	}

	async get(request?: FindManyOptions) {
		const settings: TenantSetting[] = await this.tenantSettingRepository.find(request)
		return object(pluck(settings, 'name'), pluck(settings, 'value'))
	}

	async saveSettngs(input: ITenantSetting, tenantId: string): Promise<ITenantSetting> {
		this.assertRetentionSettingsAccess(Object.keys(input), tenantId)

		const settingsName = keys(input)
		const settings: TenantSetting[] = await this.tenantSettingRepository.find({
			where: {
				name: In(settingsName),
				tenantId
			}
		})

		const settingsByName = indexBy(settings, 'name')
		const saveInput = []
		for (const key in input) {
			if (Object.prototype.hasOwnProperty.call(input, key)) {
				const setting = settingsByName[key]
				if (setting !== undefined) {
					setting.value = input[key]
					saveInput.push(setting)
				} else {
					saveInput.push(
						new TenantSetting({
							value: input[key],
							name: key,
							tenantId
						})
					)
				}
			}
		}

		await this.tenantSettingRepository.save(saveInput)
		return object(pluck(saveInput, 'name'), pluck(saveInput, 'value'))
	}

	canManageRetention(): boolean {
		const defaultTenantId = getDefaultTenantId()
		return (
			!!defaultTenantId &&
			RequestContext.currentTenantId() === defaultTenantId &&
			RequestContext.hasRole(RolesEnum.SUPER_ADMIN)
		)
	}

	assertRetentionSettingsAccess(names: string[], tenantId: string): void {
		if (
			names.some((name) => retentionSettingNames.includes(name)) &&
			(!this.canManageRetention() || tenantId !== getDefaultTenantId())
		) {
			throw new ForbiddenException(
				t('server-ai:Error.RetentionDefaultTenantRequired', {
					defaultValue: 'Only a SuperAdmin in the default tenant can configure retention for all tenants.'
				})
			)
		}
	}
}
