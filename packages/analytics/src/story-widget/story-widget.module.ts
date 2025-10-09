import { forwardRef, Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SharedModule, TenantModule, UserModule } from '@metad/server-core';
import { RouterModule } from '@nestjs/core';
import { StoryWidgetController } from './story-widget.controller';
import { StoryWidget } from './story-widget.entity';
import { StoryWidgetService } from './story-widget.service';
import { BusinessAreaModule } from '../business-area';

@Module({
  imports: [
    RouterModule.register([
      { path: '/story-widget', module: StoryWidgetModule }
    ]),
    TypeOrmModule.forFeature([ StoryWidget ]),
    forwardRef(() => TenantModule),
    SharedModule,
    CqrsModule,
    UserModule,
    BusinessAreaModule
  ],
  controllers: [StoryWidgetController],
  providers: [StoryWidgetService],
  exports: [TypeOrmModule, StoryWidgetService]
})
export class StoryWidgetModule {}
