## README for docker Deployment

Welcome to the `docker` directory for deploying XpertAI using Docker Compose. This README outlines the updates, deployment instructions, and migration details for existing users.

### Startup

#### Volume Permissions

Execute the following command in the *docker* directory to set the permissions for the binding folder:

- Create the directory if it doesn't exist
`mkdir -p ./volumes/api/public ./volumes/api/data`

- Set ownership to UID 1000:GID 1000 (default for node user)
`sudo chown -R 1000:1000 ./volumes/api/public ./volumes/api/data`

- Set permissions to allow read/write/execute for owner and group
`sudo chmod -R 775 ./volumes/api/public ./volumes/api/data`

#### Start up

Start up the Docker containers

`docker compose up -d`

f you need to enable multidimensional modeling capabilities for data analysis, please start the Docker containers using the `bi` profile

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

`XPERT_TEMPLATE_DIR` defaults to `/var/lib/xpert/data/xpert-template`. On the first API startup, missing baseline files are copied into that mounted directory and all future reads use the external directory only.

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
