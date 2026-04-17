---
name: Claude API Accelerator
description: A reference skill bundle that shows the expected template bundle layout.
version: 1.0.0
license: MIT
tags:
  - api
  - reference
---

# Claude API Accelerator

Use this example to understand how a template skill bundle should be structured.

## What This Bundle Demonstrates

- `bundle.yaml` declares the external skill ref used by `workspace-defaults.yaml` and `skills-market.yaml`
- `SKILL.md` carries the normal skill frontmatter and content
- any extra markdown, prompts, scripts, or assets can live beside `SKILL.md`

## Suggested Customization

1. Copy this directory to the first level under `skill-packages/`
2. Update `bundle.yaml` to your target `provider`, `repositoryName`, and `skillId`
3. Replace this file with your real skill instructions
4. Add any supporting resources in the same folder
