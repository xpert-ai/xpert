import { forwardRef, Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SharedModule, TenantModule } from '@metad/server-core';
import { RouterModule } from '@nestjs/core';
import { DataSourceTypeController } from './data-source-type.controller';
import { DataSourceType } from './data-source-type.entity';
import { DataSourceTypeService } from './data-source-type.service';

@Module({
  imports: [
    RouterModule.register([
      { path: '/data-source-type', module: DataSourceTypeModule }
    ]),
    TypeOrmModule.forFeature([ DataSourceType ]),
    forwardRef(() => TenantModule),
    SharedModule,
    CqrsModule,
  ],
  controllers: [DataSourceTypeController],
  providers: [DataSourceTypeService],
  exports: [TypeOrmModule, DataSourceTypeService,]
})
export class DataSourceTypeModule {}
