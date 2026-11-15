SELECT 'agent_evolution_execution_review unique index' AS missing
WHERE NOT EXISTS (SELECT 1 FROM pg_index WHERE indexrelid = to_regclass('"UQ_evolution_review_execution"') AND indisunique AND indisvalid);
