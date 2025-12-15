import { Inject, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { StrategyBus } from '@xpert-ai/plugin-sdk';
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { In, Repository } from 'typeorm';
import { PluginInstance } from './plugin-instance.entity';
import { TenantOrganizationAwareCrudService } from '../core/crud';
import { getOrganizationManifestPath, getOrganizationPluginPath } from './organization-plugin.store';
import { LOADED_PLUGINS, LoadedPluginRecord, normalizePluginName } from './types';


@Injectable()
export class PluginInstanceService extends TenantOrganizationAwareCrudService<PluginInstance> {

  private readonly logger = new Logger(PluginInstanceService.name)

  constructor(
    @InjectRepository(PluginInstance)
    private repo: Repository<PluginInstance>,
    @Inject(LOADED_PLUGINS)
    private readonly loadedPlugins: Array<LoadedPluginRecord>,
    private readonly strategyBus: StrategyBus,
  ) {
    super(repo);
  }

  async upsert(input: PluginInstance) {
    const existing = await this.repo.findOne({
      where: {
        organizationId: input.organizationId,
        pluginName: input.pluginName,
      },
    });

    if (existing) {
      existing.packageName = input.packageName;
      existing.version = input.version;
      existing.source = input.source;
      existing.config = input.config ?? {};
      existing.tenantId = input.tenantId ?? existing.tenantId;
      return this.repo.save(existing);
    }

    const entity = this.repo.create({
      tenantId: input.tenantId,
      organizationId: input.organizationId,
      pluginName: input.pluginName,
      packageName: input.packageName,
      version: input.version,
      source: input.source,
      config: input.config ?? {},
    });
    return this.create(entity);
  }

  /**
   * Uninstall plugins by names for a given tenant and organization. remove from DB, delete files, update manifest.
   * 
   * @param tenantId 
   * @param organizationId 
   * @param names Plugin names to uninstall
   */
  async uninstall(tenantId: string, organizationId: string, names: string[]) {
		const { items } = await this.findAll({
			where: {
				tenantId,
				organizationId,
				pluginName: In(names)
			}
		})
		const manifestPath = getOrganizationManifestPath(organizationId)
		const normalizedTargets = new Set(items.map((item) => normalizePluginName(item.packageName ?? item.pluginName)))

		await this.delete({
			tenantId,
			organizationId,
			pluginName: In(names)
		})

		for (const item of items) {
			this.strategyBus.remove(organizationId, item.pluginName)
			const pluginIndex = this.loadedPlugins.findIndex((plugin) => plugin.organizationId === organizationId && plugin.name === item.pluginName)
			if (pluginIndex !== -1) {
				this.loadedPlugins.splice(pluginIndex, 1)
			}

			const pluginDir = getOrganizationPluginPath(organizationId, item.packageName ?? item.pluginName)
			rmSync(pluginDir, { recursive: true, force: true })
		}

		if (existsSync(manifestPath)) {
			try {
				const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as string[]
				const filteredManifest = manifest.filter((entry) => !normalizedTargets.has(normalizePluginName(entry)))
				if (filteredManifest.length !== manifest.length) {
					writeFileSync(manifestPath, JSON.stringify(filteredManifest, null, 2))
				}
			} catch (error) {
				this.logger.warn(`Failed to update plugin manifest for org ${organizationId}`, error)
			}
		}
  }
}
