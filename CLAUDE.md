@AGENTS.md

## Claude Code

- Attribution is turned off in `.claude/settings.json`. Do not add a
  `Co-Authored-By` trailer, a "Generated with Claude Code" line or a session
  link by hand either. AGENTS.md rule 1 applies to every commit and pull
  request.
- If `git config core.hooksPath` does not print `.githooks`, set it before the
  first commit.
- Write comments to docs/STYLE.md. Before committing, check the diff against
  its "Habits coding agents fall into" list.
