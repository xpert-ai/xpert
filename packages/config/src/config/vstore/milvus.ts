import { IMilvusConfig } from '@metad/server-common';
import { registerAs } from '@nestjs/config';

/**
 * @returns An object representing the milvus vector store configuration.
 */
export default registerAs<IMilvusConfig>('milvus', () => ({
    /**
     * URI for connecting to the Milvus server (e.g., 'http://localhost:19530' or 'https://milvus-instance.example.com:19530')
     */
    MILVUS_URI: process.env.MILVUS_URI || 'http://127.0.0.1:19530',

    /**
     * Authentication token for Milvus, if token-based authentication is enabled
     */
    MILVUS_TOKEN: process.env.MILVUS_TOKEN || null,

    /**
     * Username for authenticating with Milvus, if username/password authentication is enabled
     */
    MILVUS_USER: process.env.MILVUS_USER || null,

    /**
     * Password for authenticating with Milvus, if username/password authentication is enabled
     */
    MILVUS_PASSWORD: process.env.MILVUS_PASSWORD || null,

    /**
     * Name of the Milvus database to connect to (default is 'default')
     */
    MILVUS_DATABASE: process.env.MILVUS_DATABASE || 'default',

    /**
     * Enable hybrid search features (requires Milvus >= 2.5.0). Set to false for compatibility with older versions
     */
    MILVUS_ENABLE_HYBRID_SEARCH: process.env.MILVUS_ENABLE_HYBRID_SEARCH !== 'false',

    /**
     * Milvus text analyzer parameters, e.g., {"type": "chinese"} for Chinese segmentation support.
     */
    MILVUS_ANALYZER_PARAMS: process.env.MILVUS_ANALYZER_PARAMS || null,
}));