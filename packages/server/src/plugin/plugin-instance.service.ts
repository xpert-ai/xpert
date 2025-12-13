import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PluginInstance } from './plugin-instance.entity';
import { TenantOrganizationAwareCrudService } from '../core/crud';


@Injectable()
export class PluginInstanceService extends TenantOrganizationAwareCrudService<PluginInstance> {
  constructor(
    @InjectRepository(PluginInstance)
    private repo: Repository<PluginInstance>,
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
}
