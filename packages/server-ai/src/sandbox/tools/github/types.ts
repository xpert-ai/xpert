export enum GitHubToolsEnum {
    SWITCH_REPOSITORY = 'github_switch_repository',
    PUSH_FILES = 'github_push_files',
}

export type TGitHubToolCredentials = {
    integration: string
}