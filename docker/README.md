## README for docker Deployment

Welcome to the `docker` directory for deploying XpertAI using Docker Compose. This README outlines the updates, deployment instructions, and migration details for existing users.

### Startup

#### Volume Permissions

Execute the following command in the _docker_ directory to set the permissions for the binding folder:

- Create the directory if it doesn't exist
  `mkdir -p ./volumes/api/public ./volumes/api/data`

- Set ownership to UID 1000:GID 1000 (default for node user)
  `sudo chown -R 1000:1000 ./volumes/api/public ./volumes/api/data`

- Set permissions to allow read/write/execute for owner and group
  `sudo chmod -R 775 ./volumes/api/public ./volumes/api/data`

#### Agent Plugin storage

Agent Plugin files default to `path.join(assetOptions.dataPath, 'agent-plugins')`. Docker/production config already sets `dataPath` to `/var/lib/xpert/data/`, so the resulting directory is `/var/lib/xpert/data/agent-plugins` under the existing `./volumes/api/data:/var/lib/xpert/data` mount. Compose needs no `XPERT_AGENT_PLUGIN_PATH` setting, separate plugin-files mount or host-path variable. Create the subdirectory with access for the API runtime UID/GID 1000 before running storage preflight. All API/execution replicas must see the same persistent data directory; multi-host installations need shared storage across hosts.

For an existing installation, the database's package `rootPath` is absolute: adopting the new default does not relocate existing files or records. Back up packages from **all old replicas** and the database, verify the copied files in `./volumes/api/data/agent-plugins`, then coordinate package path updates and the rollout of the new default in an authorized maintenance window. Keep package IDs, digests and bindings unchanged. Follow the [storage migration and replica/recreation verification procedure](../docs/agent-plugins/README.md#storage-and-deployment) before rollout. Neither startup nor the checker migrates package files or database records automatically.

#### Start up

Start up the Docker containers

`docker compose up -d`

If you need to enable multidimensional modeling capabilities for data analysis, please start the Docker containers using the `bi` profile

`docker compose --profile bi up -d`

#### Organization bootstrap

You can configure automatic organization initialization in `.env`:

```bash
ORG_DEFAULT_XPERT_TEMPLATE_KEYS=af7133cb-32b3-47ff-90c1-b144c4d4887e,af7133cb-32b3-47ff-90c1-b144c4d48872
ORG_ANALYTICS_BOOTSTRAP_MODE=semantic-only
XPERT_TEMPLATE_DIR=/var/lib/xpert/data/xpert-template
```

`ORG_DEFAULT_XPERT_TEMPLATE_KEYS` is a comma-separated list of template ids that will be imported into each new organization's default workspace.

`ORG_ANALYTICS_BOOTSTRAP_MODE` supports:

- `semantic-only` to create semantic-model prerequisites only
- `full-demo` to also import demo indicators and stories

User default workspace skills are configured in the external template asset directory:

```text
/var/lib/xpert/data/xpert-template/workspace-defaults.yaml
```

Tenant-level skill repositories are configured from:

```text
/var/lib/xpert/data/xpert-template/skill-repositories.yaml
```

Current YAML shape:

```yaml
repositories:
  - name: anthropics/skills
    provider: github
    options:
      url: https://github.com/anthropics/skills
      branch: main
      path: skills
  - name: clawhub/official
    provider: clawhub
    options:
      registryUrl: https://clawhub.ai
      officialOnly: true
      maxSkills: 500
```

Default user workspace skills YAML shape:

```yaml
userDefault:
  skills: []
```

Quick steps to initialize default skills before startup:

1. In `${XPERT_TEMPLATE_DIR}/skill-repositories.yaml`, declare the tenant-level repositories you want to sync.
2. In `${XPERT_TEMPLATE_DIR}/workspace-defaults.yaml`, list only skills that also exist in `skills-market.yaml`.
3. If a remote provider is unstable, create a folder under `${XPERT_TEMPLATE_DIR}/skill-packages/`, put the skill files in it, and add a `bundle.yaml` with `provider`, `repositoryName`, and `skillId`.
4. Start the API. Organization bootstrap will register the template-defined repositories, publish bundled folders into `workspace-public`, and new users will get the configured default skills in their personal default workspace.

If every default skill is provided through `skill-packages/*/`, `skill-repositories.yaml` can stay empty.

Minimal `bundle.yaml`:

```yaml
provider: github
repositoryName: anthropics/skills
skillId: skills/claude-api
```

A reference bundle is included at `skill-packages/examples/claude-api-bundle/`. Copy it to the first level under `skill-packages/` before using it.

#### External xpert templates

`XPERT_TEMPLATE_DIR` defaults to `/var/lib/xpert/data/xpert-template`. At API startup, bundled assets are synchronized into this mounted directory. Template reads use the external directory. No additional environment variable is required.

Update templates in the mounted volume instead of the repository source tree:

```text
./volumes/api/data/xpert-template/
  templates.json
  mcp-templates.json
  knowledge-pipelines.json
  skills-market.yaml
  skill-repositories.yaml
  workspace-defaults.yaml
  templates/*.yaml
  pipelines/*.yaml
  skill-packages/*/bundle.yaml
  skill-packages/*/SKILL.md
```

The synchronizer stores SHA-256 baselines in `.builtin-template-sync.json` inside this directory. It compares the current external content, the last synchronized content, and the content bundled with the running image:

| External content                                                 | Startup behavior                                   |
| ---------------------------------------------------------------- | -------------------------------------------------- |
| File missing                                                     | Copy the current bundled file and record its hash. |
| Matches the last synchronized hash                               | Replace it when the bundled hash changes.          |
| Already matches the bundled content                              | Record/adopt its hash without rewriting it.        |
| Differs from both hashes, or differs with no historical baseline | Preserve it and log a conflict for manual review.  |

`templates.json` is merged by locale and template ID, with separate hashes for descriptors, details, and other catalog properties. JSON object key order and formatting do not count as catalog edits. User-created entries, customized descriptors, and deliberately removed entries are retained. Other files are compared byte for byte, so formatting changes count as local changes. Files not shipped by the image are left untouched; assets removed from a later image are not automatically deleted.

**First upgrade of an existing installation:** old persisted files have no synchronization history. Identical content can be adopted automatically, but different content cannot safely be classified as an old official copy or a customization. It is preserved with a warning. Back up the volume, compare those files with the current image, and merge changes manually. To accept the bundled version of one file, stop all API replicas, back up and remove only that file, then restart the API. To accept a catalog descriptor, copy that descriptor from the bundled catalog into the external catalog. A restart adopts matching content so later upgrades can update it. Do not delete the whole directory or its synchronization manifest as an upgrade procedure: the directory can contain custom templates and configuration, and the manifest is needed to recognize unchanged copies.

Synchronization runs once per API process; deleting files while the API is running does not trigger a refresh. Restart after manual maintenance. It updates the source for subsequent template installations, not existing Assistant drafts or published graphs in the database.

Multiple API initializers and template-catalog exports use the same filesystem lock. File replacements use temporary files and atomic rename, with pending hashes recorded before publication so an interrupted update can resume. Assets are published before catalog descriptors. This is atomic per file, not a transaction over the whole directory. Use a persistent filesystem that supports atomic rename and shared lock visibility, and deploy the same image version to every replica sharing the directory. Hashes identify content, not release order: starting an older image can restore its bundled version of an unmodified asset. During manual maintenance or a version change requiring a consistent snapshot, stop all replicas, back up the directory, initialize one replica, inspect its logs, and then start the others with the same image.

Startup logs summarize added, updated, adopted, unchanged, and conflicted assets; debug logs identify individual successful actions and warnings identify conflicts. Synchronization failures are logged by template bootstrap and retried by later template requests. A healthy API alone does not confirm successful template synchronization. A process crash can leave a lock that becomes eligible for recovery after its two-minute stale interval; a request may time out waiting and need retrying. An invalid manifest fails closed: restore it together with the matching template backup. Symbolic links inside managed template paths are rejected.

### For Chinese users

遇到网络问题的中国用户可以使用以下命令部署：

`docker compose -f docker-compose.cn.yml up -d`

同时要启用数据分析平台的可以使用以下命令：

`docker compose -f docker-compose.cn.yml --profile bi up -d`

## Migration: Postgres

1. **Backup the existing Postgres database:**

Enter the `pg12` container and run the backup command:

```
pg_dump -U postgres -d ocap --exclude-schema=demo -Fc -f /var/lib/postgresql/data/pg12_backup.dump
```

Manually export the backup file to another location.

2. **Create a new Postgres database:**

If upgrading to pg15 in the same location, clear the `./volumes/db/data` folder.  
After starting the service, copy the `pg12_backup.dump` backup file into the `./volumes/db/data` folder.

Enter the `pg15` container and run the following command:

```
pg_restore -U postgres -d ocap --data-only --disable-triggers /var/lib/postgresql/data/pg12_backup.dump
```

Import the data.
