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

## 中文维护说明

语言统一配置在 `docs.json` 的 `navigation.languages` 中。目录名和 URL 前缀必须与语言标识大小写一致，使用 `en` 和 `zh-Hans`。

中英文文档保持相同的相对路径，并分别加入对应语言的导航，Mintlify 即可在切换语言时保留当前文档。不要使用全小写的中文目录名，也不需要逐页添加语言链接字段或运行生成脚本。目标语言导航中没有对应译文时，会回退到该语言的入口页。

中文文档的 YAML frontmatter 必须提供中文 `title`，用于页面标题和侧栏名称；缺少时 Mintlify 会从英文文件名生成名称。翻译标题时保持文件名和 URL 不变。

设置 `title` 后，正文开头不再重复书写同名的 `#` 一级标题；直接写引言，章节从 `##` 二级标题开始。
