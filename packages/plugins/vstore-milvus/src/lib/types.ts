export const Milvus = 'milvus'

export const MilvusTextFieldMaxLength = 10000

export interface IMilvusConfig {
    /**
     * URI for connecting to the Milvus server (e.g., 'http://localhost:19530' or 'https://milvus-instance.example.com:19530')
     */
    MILVUS_URI?: string; // default: "http://127.0.0.1:19530"

    /**
     * Authentication token for Milvus, if token-based authentication is enabled
     */
    MILVUS_TOKEN?: string | null;

    /**
     * Username for authenticating with Milvus, if username/password authentication is enabled
     */
    MILVUS_USER?: string | null;

    /**
     * Password for authenticating with Milvus, if username/password authentication is enabled
     */
    MILVUS_PASSWORD?: string | null;

    /**
     * Name of the Milvus database to connect to (default is 'default')
     */
    MILVUS_DATABASE: string; // default: "default"

    /**
     * Enable hybrid search features (requires Milvus >= 2.5.0). Set to false for compatibility with older versions
     */
    MILVUS_ENABLE_HYBRID_SEARCH: boolean; // default: true

    /**
     * Milvus text analyzer parameters, e.g., {"type": "chinese"} for Chinese segmentation support.
     */
    MILVUS_ANALYZER_PARAMS?: string | null;
}
