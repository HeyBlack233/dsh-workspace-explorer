# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/),
and this project adheres to [Semantic Versioning](https://semver.org/).

## [0.0.0] - Unreleased

Release Date: TBD

### Highlights

- Placeholder — filled at release time.

### Details

- New **Workspace Explorer** entry in the DSH Web sidebar; clicking it opens a
  dedicated search/browse page in the `main` column. The page replaces the
  conversation view while open, and navigation returns to the conversation.
- Empty-query browse: every Workspace in Host order plus the most recent
  Sessions (capped at 20); archived, blank, and subagent Sessions are excluded
  everywhere.
- Search matches Workspace names (title or directory basename), Session titles
  (the stored session title), and — after a 250 ms debounce — Session content
  via the Host search, merged into the Sessions group. The Sessions group is
  capped at 20 results, with a narrow-your-search hint when more remain.
- Sessions without a stored title are shown as **Untitled** and can still be
  found through content search.
- A Session that matches only because its Workspace name matched never appears
  in the Sessions group.
- Clicking a Workspace opens its top pinned or most recent Session, or opens a
  new Session in that Workspace when it has none; clicking a Session opens it.
- Search box with a clear button, auto-focus on open, a 500-code-unit limit, and
  a placeholder of `Search sessions / workspaces` (Chinese: `搜索会话 / 工作区`).
- Two collapsible result groups — **Workspaces** and **Sessions** — each showing
  its result count; an expanded empty group shows no note (the header still
  shows its count), and no no-match hint is shown when a query finds nothing.
- Page skeleton — column width, header/title/subtitle spacing, and the search
  box — aligned with the built-in Plugins and Automation tasks pages.
- English and Chinese UI strings, with the built-in sidebar search left
  unchanged.
