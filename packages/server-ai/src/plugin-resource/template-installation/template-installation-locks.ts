import { Injectable, OnModuleDestroy } from '@nestjs/common'
import { DataSource } from 'typeorm'

/** Long-running session locks must not consume the pool used by import/publish and status reads. */
@Injectable()
export class TemplateInstallationLocks implements OnModuleDestroy {
    private pool?: Promise<DataSource>
    constructor(private readonly database: DataSource) {}

    async databaseForExecution(): Promise<DataSource> {
        if (!this.pool) {
            const options = this.database.options
            if (options.type !== 'postgres') throw new Error('Template installation requires PostgreSQL')
            const database = new DataSource({
                ...options,
                name: 'template-installation-locks',
                entities: [],
                subscribers: [],
                migrations: [],
                synchronize: false,
                migrationsRun: false,
                dropSchema: false,
                logging: false,
                poolSize: 4,
                extra: { ...options.extra, max: 4 }
            })
            this.pool = database.initialize().catch((error) => {
                this.pool = undefined
                throw error
            })
        }
        return this.pool
    }

    async onModuleDestroy() {
        const database = await this.pool
        if (database?.isInitialized) await database.destroy()
    }
}
