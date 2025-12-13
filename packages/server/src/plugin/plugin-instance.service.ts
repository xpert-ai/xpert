import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PluginInstance } from './plugin-instance.entity';
import { TenantOrganizationAwareCrudService } from '../core/crud';

export interface UpsertPluginInstanceInput {
  tenantId?: string;
  organizationId?: string;
  pluginName: string;
  packageName: string;
  version?: string;
  config?: Record<string, any>;
}

@Injectable()
export class PluginInstanceService extends TenantOrganizationAwareCrudService<PluginInstance> {
  constructor(
    @InjectRepository(PluginInstance)
    private repo: Repository<PluginInstance>,
  ) {
    super(repo);
  }

  async upsert(input: UpsertPluginInstanceInput) {
    const existing = await this.repo.findOne({
      where: {
        organizationId: input.organizationId,
        pluginName: input.pluginName,
      },
    });

    if (existing) {
      existing.packageName = input.packageName;
      existing.version = input.version;
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
      config: input.config ?? {},
    });
    return this.repo.save(entity);
  }
}
