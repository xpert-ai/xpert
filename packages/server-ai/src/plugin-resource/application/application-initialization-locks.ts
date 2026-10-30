import { ConflictException, Injectable } from '@nestjs/common'
import { DataSource } from 'typeorm'
import { t } from 'i18next'

/** A session lock survives awaits and is released by PostgreSQL on process loss. Never steal by age. */
@Injectable()
export class ApplicationInitializationLocks {
  constructor(private readonly database: DataSource) {}
  async run<T>(identity: string, action: () => Promise<T>): Promise<T> {
    const connection = this.database.createQueryRunner()
    await connection.connect()
    let acquired = false
    try {
      const result: Array<{ locked: boolean }> = await connection.query(
        'SELECT pg_try_advisory_lock(hashtextextended($1, 0)) AS locked', [`application-initialize:${identity}`])
      acquired = result[0]?.locked === true
      if (!acquired) throw new ConflictException(t('server-ai:Error.ApplicationInitializationBusy', {
        defaultValue: 'Application preparation is already running.'
      }))
      return await action()
    } finally {
      if (acquired) await connection.query('SELECT pg_advisory_unlock(hashtextextended($1, 0))', [`application-initialize:${identity}`])
      await connection.release()
    }
  }
}
