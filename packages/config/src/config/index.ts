import app from './app';
import setting from './setting';
import milvus from "./vstore/milvus";
import pgvector from "./vstore/pgvector";

export default [app, setting, milvus, pgvector]