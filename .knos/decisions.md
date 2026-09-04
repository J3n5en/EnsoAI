# Decisions and current work

<!-- Written by `knos export`. Commit this file. -->

A second clone reads this on its first question - it is one of the decision
records knos looks for. Nothing here is private: secrets and private paths
never reach it.


## Decisions

- **Biome replaces ESLint and Prettier** - Configuration lives in `biome.json`.  _(AGENTS.md, CONVENTIONS)_
- **components before hand-rolled UI** - Use `@coss/ui` components; do not hand-implement one that already exists.  _(CLAUDE.md)_
- **colours come from CSS variables** - `text-primary`, `bg-accent`, `text-muted-foreground` rather than literal values.  _(CLAUDE.md)_
- **fixed sizing scale** - Tab bar `h-9`, tree node `h-7`, small button `h-6`.  _(CLAUDE.md)_
- **fixed spacing scale** - Compact `gap-1`, standard `gap-2`, indent `depth * 12 + 8px`.  _(CLAUDE.md)_
- **session persistence per runtime** - Claude keeps session persistence; Codex and the other runtimes are configured alongside it rather than replacing it.  _(README.md)_

## Being worked on right now

_Nothing claimed._

---
<sub>knos export. Claims lapse after 30 minutes.</sub>
