---
name: bom
description: Summarize a small bill of materials or plan a BOM review.
---

# BOM commands

The first slash word in the user's task selects the operation inside this skill.
It is an argument, not a ChatKit command or an executable program.

- `/summary`: Extract each material, quantity, and unit price from the user input
  or attached content. Calculate each line total and the overall total. Ask for
  missing quantities/prices instead of inventing them. Respond in Chinese with
  a Markdown table and prefix the final total with `BOM_SUMMARY_RESULT:`.
- `/plan`: Return a short BOM review checklist. Begin with `BOM_PLAN_RESULT:`.
  Do not activate any platform plan mode.
- Without a slash argument, ask which of these operations the user wants.

No remote API, workspace modification, or extra authorization is needed.
