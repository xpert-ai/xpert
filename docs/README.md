# Documentation development

This directory contains the Mintlify site. With the `mint` CLI available on `PATH`, start the preview from the repository root:

```sh
corepack pnpm start:docs
```

## Language navigation

Configure languages centrally in `docs.json` under `navigation.languages`. Keep each directory and URL prefix identical to its language identifier, including case: `en` and `zh-Hans`.

Translated pages must have the same relative route and appear in their respective language's navigation. For example:

```text
en/architecture/file-lifecycle-data-flow.md
zh-Hans/architecture/file-lifecycle-data-flow.md
```

Mintlify matches these routes when switching languages. The lowercase prefix `zh-hans` is not recognized by its language-path matcher and causes a fallback to the language entry page. No per-page language-link fields or generation scripts are needed. If a translation is absent from the target language's navigation, Mintlify falls back to that language's entry page.

Set a localized `title` in each page's YAML frontmatter. Mintlify uses it for the page heading and sidebar label; without it, the label is derived from the filename. Keep route filenames stable across languages.

When `title` is present, do not repeat it as an opening `#` heading in the body. Start with introductory text and use `##` for sections.

## Last modified dates

`metadata.timestamp: true` in `docs.json` enables Mintlify's last-modified date across all pages. For Git-backed projects, the date comes from the last commit that modified the page's source file. This is the last maintenance date, not the original writing date.

No per-page date is required. For imported content whose Git history does not reflect its actual update date, use a quoted `lastUpdatedDate: "YYYY-MM-DD"` frontmatter value. Mintlify prefers this explicit value, then the Git commit date, then the latest deployment timestamp. Use `timestamp: false` only on pages that should hide the date. See [Mintlify's timestamp documentation](https://www.mintlify.com/docs/organize/pages#last-modified-timestamp).

Local `mint dev` preview may not provide Git or deployment dates. In that case, enabling timestamps will not display a date until one is available. A temporary page with `lastUpdatedDate` can verify the rendering; remove the fixture afterward and verify automatic dates on the deployed site.

## 中文维护说明

语言统一配置在 `docs.json` 的 `navigation.languages` 中。目录名和 URL 前缀必须与语言标识大小写一致，使用 `en` 和 `zh-Hans`。

中英文文档保持相同的相对路径，并分别加入对应语言的导航，Mintlify 即可在切换语言时保留当前文档。不要使用全小写的中文目录名，也不需要逐页添加语言链接字段或运行生成脚本。目标语言导航中没有对应译文时，会回退到该语言的入口页。

中文文档的 YAML frontmatter 必须提供中文 `title`，用于页面标题和侧栏名称；缺少时 Mintlify 会从英文文件名生成名称。翻译标题时保持文件名和 URL 不变。

设置 `title` 后，正文开头不再重复书写同名的 `#` 一级标题；直接写引言，章节从 `##` 二级标题开始。

`docs.json` 中的 `metadata.timestamp: true` 全局开启最后更新日期，默认使用文档源文件最近一次 Git 提交的时间，表示最近维护时间，不是首次撰写日期，无需逐页填写。导入文档的 Git 历史与实际更新时间不符时，可以用带引号的 `lastUpdatedDate: "YYYY-MM-DD"` 覆盖。日期取值顺序为：该字段、Git 提交日期、最近部署时间。个别页面需要隐藏日期时使用 `timestamp: false`。

本地 `mint dev` 预览可能不提供 Git 或部署日期，此时即使开启配置也不会显示日期。可以用带 `lastUpdatedDate` 的临时页面验证渲染，验证后删除临时页面；自动日期仍需在部署站点确认。

## Artifacts Dashboard functional documentation

Current behavior is documented under `en/guides/artifacts-dashboard/` and
`zh-Hans/guides/artifacts-dashboard/`, with matching routes in both language menus.
Read these as feature documentation rather than a delivery plan:

| Page                       | Maintained content                                                    |
| -------------------------- | --------------------------------------------------------------------- |
| `overview`                 | User workflow, implemented capabilities and platform/plugin ownership |
| `data-and-rendering`       | Dataset/Binding, source providers, rendering and isolation            |
| `lifecycle-and-sharing`    | Save evidence, drafts, publication, cards and team viewing            |
| `configuration-and-limits` | Assistant/runtime setup, limits and verification scope                |

Keep historical plans and acceptance reports as dated evidence. Do not copy commit
batches, local machine context or future proposals into the current feature pages.
The separate product-docs repository maintains task-oriented instructions under
`{language}/ai/live-dashboard/`, in the standalone AI → Live Dashboard (实时看板)
section, and maintains its navigation order configuration.

## Project Pipeline functional documentation

Maintain implemented pipeline behavior in `en/guides/project-pipelines/` and
`zh-Hans/guides/project-pipelines/`, with matching navigation routes:

- `overview`: concepts, shared views, execution ownership, history, and analytics.
- `architecture`: data model, atomic projection, coordination, and plugin boundaries.
- `operations`: authorization, recovery, compatibility, and verification limits.

Keep plans and review evidence under `plans/project-pipeline/`; see its README for
current-document links. Documentation conversion does not close pending release or
business acceptance gates. The separate product-docs repository maintains user
instructions at `{language}/ai/projects/pipelines/` under Projects & Tasks.

## Database migration implementation plan

[统一数据库迁移执行机制：需求与实施计划](./plans/2026-10-20-unified-database-migrations.md)
describes the proposed migration manifest, runner, database baseline adoption,
deployment integration, plugin migration lifecycle, and acceptance criteria.
It is a delivery plan, not documentation of implemented behavior.

## Runtime Control architecture

Maintain the overall design in [中文架构与实施计划](./zh-Hans/architecture/runtime-control.md)
and [English architecture and implementation plan](./en/architecture/runtime-control.md).
These pages cover plugin convergence, admission monitoring, replica lifecycle,
ingress withdrawal and recovery, diagnostics, Desktop recovery, and remaining
ingress acknowledgement work. Keep implemented behavior separate from deployment
migration and proposed capabilities. Process cleanup details remain in the
existing graceful API shutdown guides.

## Conversation execution control

[会话执行控制：暂停、继续与终止](./execution-control.md) documents the implemented
ownership, durable control, local pause/resume and termination behavior. Append
completed stages there and update its capability and compatibility boundaries.
Keep future adapters and rollout proposals in the linked upgrade plan; implementation
status does not imply deployment acceptance.

## Announcements and realtime notifications

[公告与用户实时通知](./announcements-and-realtime-notifications.md) documents the
accepted Web/Bosi announcement workflow, permissions, durable delivery and SSE,
personal scheduled-task results, shared date/time controls, migration and verification.
The [completed plan index](./plans/2026-10-31-announcements-and-realtime-notifications.md)
retains the original planning link. Mobile Push and external messaging channels remain
future integrations; local acceptance does not imply a production release.
