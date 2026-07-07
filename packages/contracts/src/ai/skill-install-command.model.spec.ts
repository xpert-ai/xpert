import { parseGithubSkillInstallCommand } from './skill-install-command.model'

describe('parseGithubSkillInstallCommand', () => {
  it('parses a full GitHub repository URL', () => {
    expect(parseGithubSkillInstallCommand('https://github.com/Leonxlnx/taste-skill')).toEqual({
      repositoryUrl: 'https://github.com/Leonxlnx/taste-skill',
      repositoryPath: '',
      branch: '',
      skills: [],
      installAll: false
    })
  })

  it('parses an owner/repo source', () => {
    expect(parseGithubSkillInstallCommand('Leonxlnx/taste-skill')).toEqual({
      repositoryUrl: 'https://github.com/Leonxlnx/taste-skill',
      repositoryPath: '',
      branch: '',
      skills: [],
      installAll: false
    })
  })

  it('parses npx skills add with ignored npx flags', () => {
    expect(parseGithubSkillInstallCommand('npx -y skills add Leonxlnx/taste-skill')).toEqual({
      repositoryUrl: 'https://github.com/Leonxlnx/taste-skill',
      repositoryPath: '',
      branch: '',
      skills: [],
      installAll: false
    })
  })

  it('parses quoted and repeated skill selectors', () => {
    expect(
      parseGithubSkillInstallCommand(
        'npx skills add Leonxlnx/taste-skill --skill "design-taste-frontend" -s docs-helper'
      )
    ).toEqual({
      repositoryUrl: 'https://github.com/Leonxlnx/taste-skill',
      repositoryPath: '',
      branch: '',
      skills: ['design-taste-frontend', 'docs-helper'],
      installAll: false
    })
  })

  it('parses branch and path flags', () => {
    expect(parseGithubSkillInstallCommand('skills add Leonxlnx/taste-skill --branch dev --path skills/ui')).toEqual({
      repositoryUrl: 'https://github.com/Leonxlnx/taste-skill',
      repositoryPath: 'skills/ui',
      branch: 'dev',
      skills: [],
      installAll: false
    })
  })

  it('parses GitHub tree URLs into branch and path', () => {
    expect(
      parseGithubSkillInstallCommand('npx skills add https://github.com/Leonxlnx/taste-skill/tree/main/skills/design')
    ).toEqual({
      repositoryUrl: 'https://github.com/Leonxlnx/taste-skill',
      repositoryPath: 'skills/design',
      branch: 'main',
      skills: [],
      installAll: false
    })
  })

  it('parses --all when no skill selectors are present', () => {
    expect(parseGithubSkillInstallCommand('npx skills add Leonxlnx/taste-skill --all')).toEqual({
      repositoryUrl: 'https://github.com/Leonxlnx/taste-skill',
      repositoryPath: '',
      branch: '',
      skills: [],
      installAll: true
    })
  })

  it('rejects unclosed quotes', () => {
    expect(() => parseGithubSkillInstallCommand('npx skills add Leonxlnx/taste-skill --skill "design')).toThrow(
      'Unclosed quote'
    )
  })

  it('rejects non-GitHub sources', () => {
    expect(() => parseGithubSkillInstallCommand('https://gitlab.com/Leonxlnx/taste-skill')).toThrow('Only github.com')
  })

  it('rejects list mode', () => {
    expect(() => parseGithubSkillInstallCommand('npx skills add Leonxlnx/taste-skill --list')).toThrow('not supported')
  })

  it('rejects unknown parameters', () => {
    expect(() => parseGithubSkillInstallCommand('npx skills add Leonxlnx/taste-skill --registry foo')).toThrow(
      'Unsupported option'
    )
  })

  it('rejects --all mixed with --skill', () => {
    expect(() => parseGithubSkillInstallCommand('npx skills add Leonxlnx/taste-skill --all --skill ui')).toThrow(
      '--all cannot be used with --skill'
    )
  })
})
