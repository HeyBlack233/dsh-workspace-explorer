# dsh-workspace-explorer

A better workspace and session searching page for DSH Web.

## Purpose

The plugin adds a **Workspace Explorer** entry to the DSH Web sidebar. Clicking
the icon opens a dedicated `main` page that replaces the conversation view while
it is open; navigating back to the conversation (for example via the sidebar)
returns to it.

With an empty query the page browses everything:

- **Workspaces** — every registered Workspace in Host order
- **Sessions** — up to 20 most recent Sessions; archived, blank, and
  subagent-origin Sessions are excluded

Typing in the search box searches:

- **Workspace names** (title or directory basename) — matching Workspaces
  appear in the Workspaces group
- **Session titles** — matching Sessions appear in the Sessions group (title
  matching uses the stored session title)
- **Session content** — after a short debounce, content matches from the Host
  search arrive and are merged into the Sessions group; the Sessions group is
  capped at 20 results, with a narrow-your-search hint when more remain

Sessions that only match because their Workspace name matched never appear in
the Sessions group, and archived, blank, and subagent-origin Sessions are
hidden everywhere. Sessions
without a stored title are shown as **Untitled** and can still be found through
content search.

Clicking a Workspace opens its top pinned or most recent Session, or opens a new
Session in that Workspace when it has none. Clicking a Session opens it. In
either case the native workspace sidebar reveals the owning Workspace group
(including its ancestors in the Workspace-tree layout) and scrolls the target
Session row (or the Workspace row for a newly created Session) into view.

Every Workspace row also carries the same two trailing actions as the native
sidebar, always visible:

- an **ellipsis** that opens the native Workspace context menu (rename, delete,
  and any other registered Workspace actions) anchored below the button;
- a **New Session** button that starts a Session in that Workspace, expands the
  native Workspace group, and returns to the conversation view.

The **Workspaces** group header also carries the native sidebar's Add workspace
button at its right. It uses the same project-plus artwork and hit area, opens
the same native directory flow the sidebar's plus button uses (the composed
picker backend unchanged), registers the chosen directory as a Workspace, and
opens a new Session in it like the native action; a registration failure is
reported inline. The button is hidden when the composition has no directory
flow, matching the native sidebar.

Just left of the Add workspace button, the **Workspaces** group header also
carries a **View options** button — the same slider artwork as the native
sidebar's. It opens a menu with a single **Order by** group:

- **Manual** (default) — keeps the Host order
- **Last updated** — sorts by each Workspace's most recent visible Session's
  `updatedAt` in descending order (archived, blank, and subagent-origin
  Sessions excluded); Workspaces with no visible Session sort last, and ties
  fall back to the Host order

The choice affects only the Workspaces group (search results included); the
Sessions group keeps its own order. It is stored in the plugin's volatile
`orderBy` Config, so it survives page reloads and browser restarts, is shared by
every browser using the same profile, and applies live; it can also be edited
in the profile configuration.

## Requirement

- DSH Web with bundled client plugins enabled (the client module is loaded by
  the browser module loader; `dsh.client.inject` pulls in the required client
  packages).
- The DSH settings service from the base web composition, which persists the
  volatile `orderBy` Config.

## Installation

Install the plugin into the running DSH Web profile directly from the upstream
GitHub repository:

```sh
dsh plugin --profile web add github:HeyBlack233/dsh-workspace-explorer
```

pnpm fetches and installs the package from GitHub, and DSH adds its bundle to
the profile's layer stack; `cordis.patch.yml` inserts the
`dsh-workspace-explorer` plugin row. The package has one runtime npm
dependency, `@deepseek-ai/schemastery` (used by its Host Config schema), and no
build step, so no build-script approval is needed. Restart
DSH Web (or let its HMR watcher reload) to pick up the new bundle.

## Layout

- `index.js` — host half: declares the volatile `orderBy` Config; the client
  module owns all UI
- `client.js` — browser module-loader module: sidebar icon, search/browse page,
  pure view-derivation helpers, styles
- `test/client.test.js` — Node test suite for the pure helpers and module wiring
- `locale/en.json`, `locale/zh.json` — plugin-manager metadata
- `icon.svg` — sidebar icon artwork
- `cordis.patch.yml` — layer-stack patch

## License

[MIT](LICENSE)
