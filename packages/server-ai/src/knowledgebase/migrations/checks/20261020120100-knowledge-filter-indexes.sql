SELECT 'extension:pg_trgm' AS missing WHERE NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname='pg_trgm')
UNION ALL
SELECT 'index:'||r.name FROM (VALUES
  ('IDX_knowledge_document_filter_boundary', 'CREATE INDEX "IDX_knowledge_document_filter_boundary" ON public.knowledge_document USING btree ("tenantId", "organizationId", "knowledgebaseId", disabled)'),
  ('IDX_knowledge_document_name_trgm', 'CREATE INDEX "IDX_knowledge_document_name_trgm" ON public.knowledge_document USING gin (name gin_trgm_ops)'),
  ('IDX_knowledge_document_folder_trgm', 'CREATE INDEX "IDX_knowledge_document_folder_trgm" ON public.knowledge_document USING gin (folder gin_trgm_ops)'),
  ('IDX_knowledge_document_folder_prefix', 'CREATE INDEX "IDX_knowledge_document_folder_prefix" ON public.knowledge_document USING btree (folder text_pattern_ops)'),
  ('IDX_knowledge_document_type_mime', 'CREATE INDEX "IDX_knowledge_document_type_mime" ON public.knowledge_document USING btree ("knowledgebaseId", type, "mimeType")'),
  ('IDX_knowledge_document_category_source', 'CREATE INDEX "IDX_knowledge_document_category_source" ON public.knowledge_document USING btree ("knowledgebaseId", category, "sourceType")'),
  ('IDX_knowledge_document_metadata_gin', 'CREATE INDEX "IDX_knowledge_document_metadata_gin" ON public.knowledge_document USING gin (metadata)'),
  ('IDX_knowledge_document_chunk_metadata_gin', 'CREATE INDEX "IDX_knowledge_document_chunk_metadata_gin" ON public.knowledge_document_chunk USING gin (metadata)')
) AS r(name,definition) WHERE NOT EXISTS (
 SELECT 1 FROM pg_index i WHERE i.indexrelid=to_regclass(quote_ident(r.name))
 AND i.indisvalid AND pg_get_indexdef(i.indexrelid)=r.definition
);
