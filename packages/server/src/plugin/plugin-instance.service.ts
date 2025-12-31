import { Inject, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { StrategyBus } from '@xpert-ai/plugin-sdk';
import { existsSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { In, Repository } from 'typeorm';
import { PluginInstance } from './plugin-instance.entity';
import { TenantOrganizationAwareCrudService } from '../core/crud';
import { getOrganizationManifestPath, getOrganizationPluginPath, getOrganizationPluginRoot } from './organization-plugin.store';
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
		await this.delete({
			tenantId,
			organizationId,
			pluginName: In(names)
		})

		await this.removePlugins(organizationId, names)
  }

	async uninstallByPackageName(tenantId: string, organizationId: string, packageName: string) {
		const normalized = normalizePluginName(packageName)
		const candidates = normalized === packageName ? [packageName] : [packageName, normalized]
		const items = await this.repo.find({
			where: {
				tenantId,
				organizationId,
				packageName: In(candidates)
			}
		})

		if (!items.length) {
			return
		}

		const names = items.map((item) => item.pluginName)
		await this.uninstall(tenantId, organizationId, names)
	}

  async removePlugins(organizationId: string, names: string[]) {
    const manifestPath = getOrganizationManifestPath(organizationId)
		const rootDir = getOrganizationPluginRoot(organizationId)
		const normalizedTargets = new Set(names.map((item) => normalizePluginName(item)))
    for (const pluginName of normalizedTargets) {
			this.strategyBus.remove(organizationId, pluginName)
			const pluginIndex = this.loadedPlugins.findIndex((plugin) => plugin.organizationId === organizationId && plugin.name === pluginName)
			if (pluginIndex !== -1) {
				this.loadedPlugins.splice(pluginIndex, 1)
			}

			const pluginDir = getOrganizationPluginPath(organizationId, pluginName)
			rmSync(pluginDir, { recursive: true, force: true })

			const segments = pluginName.split('/')
			// Remove versioned plugin directories (e.g., @scope/pkg@1.2.3 or pkg@1.2.3) under the org root.
			if (segments[0]?.startsWith('@') && segments[1]) {
				const scopeDir = join(rootDir, segments[0])
				if (existsSync(scopeDir)) {
					for (const entry of readdirSync(scopeDir, { withFileTypes: true })) {
						if (!entry.isDirectory()) continue
						if (entry.name === segments[1] || entry.name.startsWith(`${segments[1]}@`)) {
							rmSync(join(scopeDir, entry.name), { recursive: true, force: true })
						}
					}
				}
			} else if (existsSync(rootDir)) {
				for (const entry of readdirSync(rootDir, { withFileTypes: true })) {
					if (!entry.isDirectory()) continue
					if (entry.name === pluginName || entry.name.startsWith(`${pluginName}@`)) {
						rmSync(join(rootDir, entry.name), { recursive: true, force: true })
					}
				}
			}
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
