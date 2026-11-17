SELECT name AS missing FROM (VALUES ('agent_output_message'), ('agent_output_preference'),
 ('agent_output_delivery'), ('agent_output_member'), ('uq_agent_output_message'), ('uq_agent_output_member'),
 ('ix_agent_output_batch'), ('uq_agent_output_preference'), ('ix_agent_output_members')) AS required(name)
WHERE to_regclass(name) IS NULL;
