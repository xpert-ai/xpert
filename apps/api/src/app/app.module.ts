import { Module } from '@nestjs/common'
import { SeederModule, ServerAppModule } from '@xpert-ai/server-core'

@Module({
  imports: [ServerAppModule, SeederModule],
  controllers: [],
  providers: []
})
export class AppModule {}
