import { Injectable, OnModuleInit } from '@nestjs/common'
import { DataSource } from 'typeorm'
import { z } from 'zod/v3'

const scopedRelations = {
    binding: ['definition'],
    instance: ['definition'],
    run: ['instance', 'definition'],
    round: ['run'],
    node: ['round'],
    event: ['instance'],
    task_link: ['node', 'task'],
    operation: ['instance', 'run', 'round', 'node'],
    decision: ['node', 'round'],
    attention: ['instance', 'node', 'round'],
    provider_action: ['instance', 'run', 'node', 'round'],
    model_reservation: ['operation'],
    native_grant: ['action']
}
const entities = [
    'definition',
    'binding',
    'instance',
    'run',
    'round',
    'node',
    'event',
    'task_link',
    'refresh',
    'operation',
    'decision',
    'attention',
    'provider_action',
    'model_reservation',
    'native_grant'
]
const constraints = [
    ...entities.map((name) => ({ table: `xpert_project_pipeline_${name}`, name: `pipeline_${name}_project_fk` })),
    ...entities
        .filter((name) => name !== 'definition')
        .map((name) => ({ table: `xpert_project_pipeline_${name}`, name: `pipeline_${name}_values_check` })),
    ...Object.entries(scopedRelations).flatMap(([name, targets]) =>
        targets.map((target) => ({
            table: `xpert_project_pipeline_${name}`,
            name: `pipeline_${name}_${target}_scope_fk`
        }))
    ),
    { table: 'xpert_project_task', name: 'pipeline_task_instance_fk' },
    { table: 'xpert_project_task', name: 'pipeline_task_control_check' }
]
const resultSchema = z.array(z.object({ missing: z.string() }))

/** Refuse traffic and worker startup when ORM synchronization has removed migration-owned guarantees. */
@Injectable()
export class ProjectPipelineSchemaService implements OnModuleInit {
    constructor(private readonly db: DataSource) {}

    async onModuleInit() {
        const missing = resultSchema.parse(
            await this.db.query(
                `
            SELECT required.name AS missing
            FROM jsonb_to_recordset($1::jsonb) AS required("table" text, name text)
            WHERE NOT EXISTS (
                SELECT 1 FROM pg_constraint c
                WHERE c.conrelid=to_regclass(required."table") AND c.conname=required.name AND c.convalidated
            )
            UNION ALL
            SELECT required.name AS missing
            FROM (VALUES ('xpert_project_pipeline_native_grant', 'pipeline_native_grant_call'),
                ('xpert_project_pipeline_native_grant', 'pipeline_native_grant_execution')) AS required(table_name, name)
            WHERE NOT EXISTS (
                SELECT 1 FROM pg_index i JOIN pg_class c ON c.oid=i.indexrelid
                WHERE i.indrelid=to_regclass(required.table_name)
                    AND c.relname=required.name AND i.indisunique AND i.indisvalid
            )
            UNION ALL
            SELECT 'pipeline_operation_runtimeIntent' AS missing
            WHERE NOT EXISTS (
                SELECT 1 FROM pg_attribute
                WHERE attrelid=to_regclass('xpert_project_pipeline_operation')
                    AND attname='runtimeIntent' AND atttypid='jsonb'::regtype AND NOT attisdropped
            )
            UNION ALL
            SELECT 'pipeline_instance_nativeModelBudget' AS missing
            WHERE NOT EXISTS (
                SELECT 1 FROM pg_attribute WHERE attrelid=to_regclass('xpert_project_pipeline_instance')
                    AND attname='nativeModelBudget' AND atttypid='jsonb'::regtype AND NOT attisdropped
            )
            UNION ALL
            SELECT 'pipeline_one_active_run' AS missing
            WHERE NOT EXISTS (
                SELECT 1 FROM pg_index i JOIN pg_class c ON c.oid=i.indexrelid
                WHERE i.indrelid=to_regclass('xpert_project_pipeline_run')
                    AND c.relname='pipeline_one_active_run' AND i.indisunique AND i.indisvalid
                    AND i.indpred IS NOT NULL
            )
            UNION ALL
            SELECT 'pipeline_one_active_provider_action' AS missing
            WHERE NOT EXISTS (
                SELECT 1 FROM pg_index i JOIN pg_class c ON c.oid=i.indexrelid
                WHERE i.indrelid=to_regclass('xpert_project_pipeline_provider_action')
                    AND c.relname='pipeline_one_active_provider_action' AND i.indisunique AND i.indisvalid
                    AND i.indpred IS NOT NULL
            )`,
                [JSON.stringify(constraints)]
            )
        )
        if (missing.length) {
            throw new Error(
                'PIPELINE_SCHEMA_MIGRATION_REQUIRED: apply all project-pipeline SQL migrations after schema sync, ' +
                    'then start with DB_SCHEMA_SYNC_MODE=external. Missing: ' +
                    missing.map((item) => item.missing).join(', ')
            )
        }
    }
}
