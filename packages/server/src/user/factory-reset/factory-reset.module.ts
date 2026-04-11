import { forwardRef, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { getConfig } from '@xpert-ai/server-config';
import { FactoryResetService } from './factory-reset.service';
import { coreEntities } from '../../core/entities';

@Module({
	imports: [

	],
	providers: [
		FactoryResetService,
	],
	exports: [FactoryResetService]
})
export class FactoryResetModule { }
