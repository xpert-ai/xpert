import milvus from './vstore/milvus'
import pgvector from './vstore/pgvector'

export { default as milvusConfig } from './vstore/milvus'
export { default as pgvectorConfig } from './vstore/pgvector'

export default [milvus, pgvector]
