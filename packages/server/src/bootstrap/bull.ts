import { BullModule } from '@nestjs/bull'
import { ConfigModule, ConfigService } from '@nestjs/config'

export function provideBullModule() {
    return BullModule.forRootAsync({
        imports: [ConfigModule],
        useFactory: async (configService: ConfigService) => {
            const host = configService.get('REDIS_HOST') || 'localhost'
            const port = configService.get('REDIS_PORT') || 6379
            const password = configService.get('REDIS_PASSWORD') || ''
            return {
                redis: {
                    host,
                    port,
                    password
                },
            }
        },
        inject: [ConfigService],
    })
}
