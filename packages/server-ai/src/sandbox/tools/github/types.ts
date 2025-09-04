export enum GitHubToolsEnum {
    SWITCH_REPOSITORY = 'github_switch_repository',
    PUSH_FILES = 'github_push_files',
    CREATE_ISSUE = 'github_create_issue'
}

export type TGitHubToolCredentials = {
    integration: string
}