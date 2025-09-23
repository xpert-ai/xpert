/**
 * ===============================
 * Unified Permissions Definition
 * ===============================
 * Used by Agent / Plugin developers to declare required capabilities.
 * Core system will check and inject allowed resources accordingly.
 */

/**
 * Base Permission type
 */
export interface BasePermission {
  type: string; // Discriminator
  description?: string; // Optional description for UI
}

/**
 * 1. LLM Permission
 * Example: { type: 'llm', provider: 'openai', capability: 'vision' }
 */
export interface LLMPermission extends BasePermission {
  type: 'llm';
  provider: string; // e.g. "openai", "anthropic", "azure", "ollama"
  capability: 'text' | 'chat' | 'vision' | 'embedding';
  scope?: string[]; // Allowed model names, e.g. ["gpt-4", "gpt-4-vision-preview"]
  maxTokens?: number; // Maximum output tokens allowed
  rateLimit?: { rps: number }; // Rate limit per second
}

/**
 * 2. Vector Store Permission
 * Example: { type: 'vectorstore', provider: 'pinecone', operations: ['insert', 'query'] }
 */
export interface VectorStorePermission extends BasePermission {
  type: 'vectorstore';
  provider: string; // "pinecone" | "milvus" | "chromadb" | ...
  operations: Array<'insert' | 'query' | 'delete'>;
  scope?: string[]; // Restrict to index / collection
}

/**
 * 3. Knowledge Base Permission
 * Example: { type: 'knowledge', operations: ['read', 'write'], scope: ['kb_123'] }
 */
export interface KnowledgePermission extends BasePermission {
  type: 'knowledge';
  operations: Array<'read' | 'write' | 'update' | 'delete'>;
  scope?: string[]; // Restrict to certain KB IDs
}

/**
 * 4. File System Permission
 * Example: { type: 'filesystem', operations: ['read', 'write'], scope: ['/documents', '/images'] }
 */
export interface FileSystemPermission extends BasePermission {
  type: 'filesystem';
  operations: Array<'read' | 'write' | 'delete' | 'list'>;
  scope?: string[]; // Restrict to certain directories or file types
}

// /**
//  * 4. Document Permission
//  * Example: { type: 'document', formats: ['pdf'], operations: ['load', 'transform'] }
//  */
// export interface DocumentPermission extends BasePermission {
//   type: 'document';
//   formats: string[]; // ['pdf', 'pptx', 'docx', 'image', 'html', 'md']
//   operations: Array<'load' | 'transform' | 'ocr' | 'imageUnderstanding'>;
// }

// /**
//  * 5. External API Permission
//  * Example: { type: 'external', service: 'feishu', operations: ['read', 'write'] }
//  */
// export interface ExternalPermission extends BasePermission {
//   type: 'external';
//   service: string; // 'slack' | 'feishu' | 'jira' | 'sap' | ...
//   operations: Array<'read' | 'write' | 'update' | 'delete'>;
//   scope?: string[];
// }

/**
 * Union type for all permissions
 */
export type Permission =
  | LLMPermission
  | VectorStorePermission
  | KnowledgePermission
  | FileSystemPermission
//   | DocumentPermission
//   | ExternalPermission;

/**
 * Permissions array type
 */
export type Permissions = Permission[];
