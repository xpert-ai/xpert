import { IMilvusConfig, IPGVectorConfig } from '@metad/server-common';
import { registerAs } from '@nestjs/config';

/**
 * @returns An object representing the pgvector store configuration.
 */
export default registerAs<IPGVectorConfig>('pgvector', () => ({
    PGVECTOR_HOST: process.env.PGVECTOR_HOST,
    PGVECTOR_PORT: process.env.PGVECTOR_PORT ? Number(process.env.PGVECTOR_PORT) : undefined,
    PGVECTOR_USER: process.env.PGVECTOR_USER,
    PGVECTOR_PASSWORD: process.env.PGVECTOR_PASSWORD,
    PGVECTOR_DATABASE: process.env.PGVECTOR_DATABASE,
    PGVECTOR_MIN_CONNECTION: process.env.PGVECTOR_MIN_CONNECTION ? Number(process.env.PGVECTOR_MIN_CONNECTION) : undefined,
    PGVECTOR_MAX_CONNECTION: process.env.PGVECTOR_MAX_CONNECTION ? Number(process.env.PGVECTOR_MAX_CONNECTION) : undefined,
    PGVECTOR_PG_BIGM: process.env.PGVECTOR_PG_BIGM ? process.env.PGVECTOR_PG_BIGM === 'true' : undefined,
}));
