export interface IPGVectorConfig {
    /**
     * Hostname or IP address of the PostgreSQL server with PGVector extension (e.g., 'localhost')
     */
    PGVECTOR_HOST?: string;

    /**
     * Port number on which the PostgreSQL server is listening (default is 5433)
     */
    PGVECTOR_PORT?: number;

    /**
     * Username for authenticating with the PostgreSQL database
     */
    PGVECTOR_USER?: string;

    /**
     * Password for authenticating with the PostgreSQL database
     */
    PGVECTOR_PASSWORD?: string;

    /**
     * Name of the PostgreSQL database to connect to
     */
    PGVECTOR_DATABASE?: string;

    /**
     * Min connection of the PostgreSQL database
     */
    PGVECTOR_MIN_CONNECTION?: number;

    /**
     * Max connection of the PostgreSQL database
     */
    PGVECTOR_MAX_CONNECTION?: number;

    /**
     * Whether to use pg_bigm module for full text search
     */
    PGVECTOR_PG_BIGM?: boolean;
}
