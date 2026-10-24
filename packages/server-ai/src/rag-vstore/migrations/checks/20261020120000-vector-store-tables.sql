WITH required(table_name,column_name,data_type) AS (
  VALUES
    ('copilot_store_vectors','prefix','text'), ('copilot_store_vectors','key','text'),
    ('copilot_store_vectors','field_name','text'), ('copilot_store_vectors','embedding','vector'),
    ('copilot_store_vectors','created_at','timestamp with time zone'), ('copilot_store_vectors','updated_at','timestamp with time zone'),
    ('copilot_knowledge_collection','uuid','uuid'), ('copilot_knowledge_collection','name','character varying'),
    ('copilot_knowledge_collection','cmetadata','jsonb'), ('knowledge_document_collection','uuid','uuid'),
    ('knowledge_document_collection','name','character varying'), ('knowledge_document_collection','cmetadata','jsonb'),
    ('copilot_knowledge_vector','id','uuid'), ('copilot_knowledge_vector','content','text'),
    ('copilot_knowledge_vector','metadata','jsonb'), ('copilot_knowledge_vector','vector','vector'),
    ('copilot_knowledge_vector','collection_id','uuid'), ('knowledge_document_vector','id','uuid'),
    ('knowledge_document_vector','content','text'), ('knowledge_document_vector','metadata','jsonb'),
    ('knowledge_document_vector','vector','vector'), ('knowledge_document_vector','collection_id','uuid')
), constraints(table_name,definition) AS (
  VALUES ('copilot_store_vectors','PRIMARY KEY (prefix, key, field_name)'),
    ('copilot_store_vectors','FOREIGN KEY (prefix, key) REFERENCES copilot_store(prefix, key) ON DELETE CASCADE'),
    ('copilot_knowledge_collection','PRIMARY KEY (uuid)'), ('knowledge_document_collection','PRIMARY KEY (uuid)'),
    ('copilot_knowledge_vector','PRIMARY KEY (id)'), ('knowledge_document_vector','PRIMARY KEY (id)'),
    ('copilot_knowledge_vector','FOREIGN KEY (collection_id) REFERENCES copilot_knowledge_collection(uuid) ON DELETE CASCADE'),
    ('knowledge_document_vector','FOREIGN KEY (collection_id) REFERENCES knowledge_document_collection(uuid) ON DELETE CASCADE')
)
SELECT 'column:'||r.table_name||'.'||r.column_name AS missing FROM required r
WHERE NOT EXISTS (SELECT 1 FROM pg_attribute a WHERE a.attrelid=to_regclass(r.table_name)
  AND a.attname=r.column_name AND format_type(a.atttypid,a.atttypmod)=r.data_type AND NOT a.attisdropped)
UNION ALL
SELECT 'constraint:'||r.table_name FROM constraints r WHERE NOT EXISTS (
  SELECT 1 FROM pg_constraint c WHERE c.conrelid=to_regclass(r.table_name)
  AND pg_get_constraintdef(c.oid)=r.definition AND c.convalidated
)
UNION ALL
SELECT 'index:'||r.name FROM (VALUES
  ('idx_copilot_knowledge_collection_name','CREATE INDEX idx_copilot_knowledge_collection_name ON public.copilot_knowledge_collection USING btree (name)'),
  ('idx_knowledge_document_collection_name','CREATE INDEX idx_knowledge_document_collection_name ON public.knowledge_document_collection USING btree (name)')
) AS r(name,definition) WHERE NOT EXISTS (
  SELECT 1 FROM pg_index i WHERE i.indexrelid=to_regclass(r.name)
    AND i.indisvalid AND pg_get_indexdef(i.indexrelid)=r.definition
);
