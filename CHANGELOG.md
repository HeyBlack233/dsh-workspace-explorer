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
  The native workspace sidebar expands the owning Workspace group — including
  its ancestors in the Workspace-tree layout — and scrolls the target Session
  row (or the Workspace row for a newly created Session) into view, matching
  the built-in search's reveal behavior.
- Every Workspace row carries the same two trailing actions as the native
  sidebar, always visible: an ellipsis that opens the native Workspace context
  menu (rename, delete, and any other registered Workspace actions) at the
  button's anchor, and a New Session button that starts a Session in that
  Workspace, expands the native Workspace group, and returns to the
  conversation view. The New Session button honors the Workspace's
  `session/create` access. The trailing actions share the row's full-width
  hover surface, so the row highlights as one unit.
- The **Workspaces** group header carries the native sidebar's Add workspace
  button at its right: the same project-plus artwork in a 28 px hit area, with
  no text and the localized `Add workspace` label. It opens the same native
  directory flow the sidebar's plus button uses (the composed picker backend
  unchanged), registers the chosen directory as a Workspace, then opens a new
  Session in it exactly like the native action, and reports a registration
  failure inline. When the composition has no directory flow, the button is
  hidden exactly like the native sidebar's.
- Search box with a clear button, auto-focus on open, a 500-code-unit limit, and
  a placeholder of `Search workspaces / sessions` (Chinese: `搜索工作区 / 会话`).
- Two collapsible result groups — **Workspaces** and **Sessions** — each showing
  its result count; an expanded empty group shows no note (the header still
  shows its count), and no no-match hint is shown when a query finds nothing.
- Page skeleton — column width, header/title/subtitle spacing, and the search
  box — aligned with the built-in Plugins and Automation tasks pages.
- Workspace and Session row icons are vertically centered within each entry.
- English and Chinese UI strings, with the built-in sidebar search left
  unchanged.
- Released under the MIT License (© 2026 HeyBlack233).
