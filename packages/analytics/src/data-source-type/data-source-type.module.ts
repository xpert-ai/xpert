import { forwardRef, Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SharedModule, TenantModule } from '@metad/server-core';
import { DiscoveryModule, RouterModule } from '@nestjs/core';
import { DataSourceStrategyRegistry } from '@xpert-ai/plugin-sdk';
import { DataSourceTypeController } from './data-source-type.controller';
import { DataSourceType } from './data-source-type.entity';
import { DataSourceTypeService } from './data-source-type.service';

@Module({
  imports: [
    RouterModule.register([
      { path: '/data-source-type', module: DataSourceTypeModule }
    ]),
    TypeOrmModule.forFeature([ DataSourceType ]),
    DiscoveryModule,
    forwardRef(() => TenantModule),
    SharedModule,
    CqrsModule,
  ],
  controllers: [DataSourceTypeController],
  providers: [
    DataSourceTypeService,
    DataSourceStrategyRegistry
  ],
  exports: [TypeOrmModule, DataSourceTypeService, DataSourceStrategyRegistry]
})
export class DataSourceTypeModule {}
