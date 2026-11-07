window.__ModuleLoader__.load({
  id: 'dsh-workspace-explorer',
  factory(require) {
    const React = require('react');
    const h = React.createElement;
    const NS = 'dsh-workspace-explorer';
    const PANEL_ID = 'dsh-workspace-explorer';

    /** `session.search` wire bound, measured in JavaScript UTF-16 code units. */
    const SEARCH_QUERY_MAX_CODE_UNITS = 500;
    /** Pause between the latest keystroke and a Host content-search request. */
    const SEARCH_DEBOUNCE_MS = 250;

    // Runtime en/zh dictionaries. Every visible string goes through t().
    const en = {
      'panel.label': 'Workspace Explorer',
      'page.title': 'Workspace Explorer',
      'page.subtitle': 'Search sessions and browse workspaces in one place.',
      'search.placeholder': 'Search sessions / workspaces',
      'search.clear': 'Clear search',
      'search.hasMore': 'Showing the first {limit} results. Narrow your search.',
      'group.workspaces': 'Workspaces',
      'group.sessions': 'Sessions',
      'group.ungrouped': 'Ungrouped',
      'group.count': '{count}',
      'state.loading': 'Loading…',
      'row.openWorkspace': 'Open workspace {name}',
      'row.openSession': 'Open session {title}',
      'session.untitled': 'Untitled',
    };
    const zh = {
      'panel.label': '工作区浏览器',
      'page.title': '工作区浏览器',
      'page.subtitle': '在一个页面中搜索会话、浏览工作区。',
      'search.placeholder': '搜索会话 / 工作区',
      'search.clear': '清除搜索',
      'search.hasMore': '仅显示前 {limit} 条结果，请缩小搜索范围。',
      'group.workspaces': '工作区',
      'group.sessions': '会话',
      'group.ungrouped': '未分组',
      'group.count': '{count}',
      'state.loading': '加载中…',
      'row.openWorkspace': '打开工作区 {name}',
      'row.openSession': '打开会话 {title}',
      'session.untitled': '未命名',
    };

    // ---------------------------------------------------------------------
    // Pure view helpers (module scope; exported for tests via __test).
    // ---------------------------------------------------------------------

    /** Keep controlled input and RPC payload inside the session.search wire contract. */
    function sanitizeQuery(value) {
      const withoutNul = String(value ?? '').replaceAll('\0', '');
      if (withoutNul.length <= SEARCH_QUERY_MAX_CODE_UNITS) return withoutNul;
      let end = SEARCH_QUERY_MAX_CODE_UNITS;
      const last = withoutNul.charCodeAt(end - 1);
      const next = withoutNul.charCodeAt(end);
      if (last >= 0xd800 && last <= 0xdbff && next >= 0xdc00 && next <= 0xdfff) end--;
      return withoutNul.slice(0, end);
    }

    /** Final path segment; accepts POSIX and Windows separators and strips trailing separators. */
    function basename(path) {
      if (path === undefined || path === null || path === '') return '';
      const trimmed = String(path).replace(/[/\\]+$/, '');
      const separator = Math.max(trimmed.lastIndexOf('/'), trimmed.lastIndexOf('\\'));
      return trimmed.slice(separator + 1);
    }

    /** Display name of a Workspace: its title, or the basename of its directory. */
    function workspaceName(workspace) {
      return workspace.title || basename(workspace.path);
    }

    /** Stored durable Session title used for matching; trimmed, empty when untitled. */
    function sessionMatchTitle(summary) {
      return (summary.title ?? '').trim();
    }

    /** Row title: the stored title, or the localized untitled label. */
    function sessionDisplayTitle(summary, untitledLabel) {
      return sessionMatchTitle(summary) || untitledLabel;
    }

    /** A Session row is worth showing only when it exists, is not blank, is not a subagent child, and is not archived. */
    function isVisibleSummary(summary, archivedSet) {
      if (summary === undefined || summary === null) return false;
      if (summary.blank) return false;
      if (summary.origin === 'subagent') return false;
      if (archivedSet && archivedSet.has(summary.id)) return false;
      return true;
    }

    /** Recency order: updatedAt descending, session id ascending as tie-break. */
    function compareByRecency(a, b) {
      if (a.updatedAt !== b.updatedAt) return a.updatedAt > b.updatedAt ? -1 : 1;
      if (a.id < b.id) return -1;
      if (a.id > b.id) return 1;
      return 0;
    }

    /** Visible Sessions whose stored title contains the lowercased query, newest first. Workspace names are not matched here, and an empty title never matches. */
    function localSessionMatches(list, normalizedQuery, archivedSessionIds) {
      const q = normalizedQuery.toLowerCase();
      const archived = new Set(archivedSessionIds ?? []);
      const matches = [];
      for (const id of list.ids) {
        const summary = list.byId[id];
        if (!isVisibleSummary(summary, archived)) continue;
        const title = sessionMatchTitle(summary);
        if (title !== '' && title.toLowerCase().includes(q)) matches.push(summary);
      }
      matches.sort(compareByRecency);
      return matches;
    }

    /**
     * Merge local title matches (already recency-ordered) with ranked Host
     * content matches: local rows lead, content-only rows keep backend order,
     * a session present in both appears once with the backend snippet attached.
     * Returns the full merged array; the caller caps it at the result limit.
     */
    function mergeSessionResults(localSummaries, contentItems, list, archivedSessionIds) {
      const archived = new Set(archivedSessionIds ?? []);
      const contentBySession = new Map();
      for (const item of contentItems ?? []) {
        if (!contentBySession.has(item.sessionId)) contentBySession.set(item.sessionId, item);
      }
      const merged = [];
      const included = new Set();
      const include = (summary) => {
        if (included.has(summary.id)) return;
        included.add(summary.id);
        const item = contentBySession.get(summary.id);
        merged.push(item === undefined ? summary : { ...summary, snippet: item.snippet });
      };
      for (const summary of localSummaries ?? []) include(summary);
      for (const item of contentItems ?? []) {
        const summary = list.byId[item.sessionId];
        if (summary === undefined || !isVisibleSummary(summary, archived)) continue;
        include(summary);
      }
      return merged;
    }

    /** Visible Sessions sorted by recency, capped at `limit`. */
    function recentSessions(list, archivedSessionIds, limit) {
      const archived = new Set(archivedSessionIds ?? []);
      const visible = [];
      for (const id of list.ids) {
        const summary = list.byId[id];
        if (isVisibleSummary(summary, archived)) visible.push(summary);
      }
      visible.sort(compareByRecency);
      return visible.slice(0, limit);
    }

    /**
     * Top Session of a Workspace: among its visible members, pinned Sessions
     * first by their index in `pinnedSessionIds` (most recently pinned first),
     * then by recency; `undefined` when no visible member exists.
     */
    function selectTopSessionId(workspace, list, pinnedSessionIds, archivedSessionIds) {
      const archived = new Set(archivedSessionIds ?? []);
      const pinRank = new Map((pinnedSessionIds ?? []).map((id, index) => [id, index]));
      const members = [];
      for (const sessionId of workspace.sessionIds) {
        const summary = list.byId[sessionId];
        if (isVisibleSummary(summary, archived)) members.push(summary);
      }
      if (members.length === 0) return undefined;
      members.sort((a, b) => {
        const pa = pinRank.has(a.id) ? pinRank.get(a.id) : Infinity;
        const pb = pinRank.has(b.id) ? pinRank.get(b.id) : Infinity;
        if (pa !== pb) return pa - pb;
        return compareByRecency(a, b);
      });
      return members[0].id;
    }

    /**
     * Row label for a Session: the title of the owning Workspace (first
     * workspace wins), else the basename of its cwd, else the ungrouped label.
     */
    function labelForSession(session, workspaces, ungroupedLabel) {
      const owner = (workspaces ?? []).find((workspace) => workspace.sessionIds.includes(session.id));
      if (owner !== undefined) return workspaceName(owner);
      if (session.cwd !== undefined && session.cwd !== '') {
        const base = basename(session.cwd);
        if (base !== '') return base;
      }
      return ungroupedLabel;
    }

    /**
     * Derive the whole page view. Empty query: every Workspace in Host order
     * plus the most recent Sessions. Non-empty query: Workspaces whose name
     * contains the query, and Sessions from local title matches merged with
     * Host content matches — never a session that matched only by workspace name.
     */
    function deriveView({ list, workspaces, query, content, limit, ungroupedLabel = '', untitledLabel = 'Untitled' }) {
      const normalized = sanitizeQuery(query).trim();
      const items = workspaces.items ?? [];
      const archivedSessionIds = workspaces.archivedSessionIds ?? [];
      const pinnedSessionIds = workspaces.pinnedSessionIds ?? [];

      const workspaceRows = (input) => input.map((workspace) => ({
        workspaceId: workspace.workspaceId,
        title: workspaceName(workspace),
        path: workspace.path,
        topSessionId: selectTopSessionId(workspace, list, pinnedSessionIds, archivedSessionIds),
      }));

      const sessionRows = (summaries) => summaries.map((summary) => ({
        id: summary.id,
        title: sessionDisplayTitle(summary, untitledLabel),
        workspaceLabel: labelForSession(summary, items, ungroupedLabel),
        ...(summary.snippet !== undefined ? { snippet: summary.snippet } : {}),
        updatedAt: summary.updatedAt,
      }));

      if (normalized === '') {
        return {
          workspaces: workspaceRows(items),
          sessions: sessionRows(recentSessions(list, archivedSessionIds, limit)),
          hasMore: false,
        };
      }

      const q = normalized.toLowerCase();
      const merged = mergeSessionResults(
        localSessionMatches(list, normalized, archivedSessionIds),
        content.items ?? [],
        list,
        archivedSessionIds,
      );
      const capped = merged.slice(0, limit);
      return {
        workspaces: workspaceRows(items.filter((workspace) => workspaceName(workspace).toLowerCase().includes(q))),
        sessions: sessionRows(capped),
        hasMore: content.hasMore === true || merged.length > limit,
      };
    }

    /**
     * Next expansion-override map: only the toggled group is written, so the
     * other group keeps following its auto default until it is toggled too.
     */
    function nextExpansion(overrides, queryKey, key, autoExpanded) {
      const current = overrides[queryKey] ?? {};
      const wasExpanded = current[key] ?? (autoExpanded[key] === true);
      return { ...overrides, [queryKey]: { ...current, [key]: !wasExpanded } };
    }

    /**
     * Effective expansion per group: explicit per-query toggles win, absent
     * keys keep following the auto default (never undefined/falsy).
     */
    function resolveExpanded(overrides, queryKey, autoExpanded) {
      return { ...autoExpanded, ...(overrides[queryKey] ?? {}) };
    }

    // ---------------------------------------------------------------------
    // Icons (own artwork, currentColor).
    // ---------------------------------------------------------------------

    // Own sidebar icon: a magnifier over a small stacked list, currentColor.
    // `active` is accepted for future state-driven styling; the host already
    // colors the active entry via currentColor.
    function PanelIcon({ size = 24, active = false }) {
      return h('svg', {
        viewBox: '0 0 64 64',
        width: size,
        height: size,
        'aria-hidden': true,
        focusable: false,
        style: { display: 'block', pointerEvents: 'none' },
      }, h('g', {
        fill: 'none',
        stroke: 'currentColor',
        strokeWidth: 6,
        strokeLinecap: 'round',
        strokeLinejoin: 'round',
      }, [
        h('line', { x1: 10, y1: 16, x2: 34, y2: 16 }),
        h('line', { x1: 10, y1: 28, x2: 34, y2: 28 }),
        h('line', { x1: 10, y1: 40, x2: 34, y2: 40 }),
        h('circle', { cx: 41, cy: 41, r: 13 }),
        h('line', { x1: 50, y1: 50, x2: 58, y2: 58 }),
      ]));
    }

    // Small inline glyphs used inside the page.
    const searchGlyph = h('svg', {
      viewBox: '0 0 16 16',
      width: 14,
      height: 14,
      'aria-hidden': true,
      focusable: false,
    }, h('g', {
      fill: 'none',
      stroke: 'currentColor',
      strokeWidth: 1.5,
      strokeLinecap: 'round',
    }, [
      h('circle', { cx: 7, cy: 7, r: 4.5 }),
      h('line', { x1: 10.5, y1: 10.5, x2: 14, y2: 14 }),
    ]));

    const clearGlyph = h('svg', {
      viewBox: '0 0 16 16',
      width: 12,
      height: 12,
      'aria-hidden': true,
      focusable: false,
    }, h('g', {
      fill: 'none',
      stroke: 'currentColor',
      strokeWidth: 1.8,
      strokeLinecap: 'round',
    }, [
      h('line', { x1: 4, y1: 4, x2: 12, y2: 12 }),
      h('line', { x1: 12, y1: 4, x2: 4, y2: 12 }),
    ]));

    const folderGlyph = h('svg', {
      viewBox: '0 0 16 16',
      width: 14,
      height: 14,
      'aria-hidden': true,
      focusable: false,
    }, h('g', {
      fill: 'none',
      stroke: 'currentColor',
      strokeWidth: 1.5,
      strokeLinejoin: 'round',
    }, [
      h('path', { d: 'M1.5 3.5h5l1.5 2h6.5v7h-13z' }),
    ]));

    const chatGlyph = h('svg', {
      viewBox: '0 0 16 16',
      width: 14,
      height: 14,
      'aria-hidden': true,
      focusable: false,
    }, h('g', {
      fill: 'none',
      stroke: 'currentColor',
      strokeWidth: 1.5,
      strokeLinejoin: 'round',
    }, [
      h('path', { d: 'M2.5 4.5h11a1 1 0 0 1 1 1v5a1 1 0 0 1-1 1H8.2L4.5 13.5V11.5H2.5a1 1 0 0 1-1-1v-5a1 1 0 0 1 1-1z' }),
    ]));

    // ---------------------------------------------------------------------
    // Page.
    // ---------------------------------------------------------------------

    // The `main` slot passes the standard `useSessions` / `useWorkspaces`
    // hooks, `t`, and the `inject` face ({ searchSessions, searchResultLimit,
    // openSession, openWorkspace }) as props.
    function ExplorerPage({ t, useSessions, useWorkspaces, searchSessions, searchResultLimit = 20, openSession, openWorkspace }) {
      const list = useSessions((s) => s);
      const ws = useWorkspaces((s) => s);
      const [query, setQuery] = React.useState('');
      const [remote, setRemote] = React.useState({ query: '', status: 'idle', items: [], hasMore: false });
      // Expansion overrides keyed by the normalized query; {} means auto:
      // a group is expanded iff it has items, unless the user toggled it for
      // the current query. Re-derived per query, not frozen at mount.
      const [expandedByQuery, setExpandedByQuery] = React.useState({});
      const inputRef = React.useRef(null);

      React.useEffect(() => {
        if (inputRef.current) inputRef.current.focus();
      }, []);

      const normalized = sanitizeQuery(query).trim();

      React.useEffect(() => {
        if (normalized === '') {
          setRemote({ query: '', status: 'idle', items: [], hasMore: false });
          return;
        }
        const controller = new AbortController();
        setRemote({ query: normalized, status: 'loading', items: [], hasMore: false });
        const timer = window.setTimeout(() => {
          searchSessions(normalized, controller.signal)
            .then((result) => {
              if (controller.signal.aborted) return;
              setRemote({ query: normalized, status: 'ready', items: result.items, hasMore: result.hasMore });
            })
            .catch((reason) => {
              if (controller.signal.aborted) return;
              // Silent content failure: local title matches stay visible.
              console.warn('workspace explorer: content search failed', reason);
              setRemote({ query: normalized, status: 'error', items: [], hasMore: false });
            });
        }, SEARCH_DEBOUNCE_MS);
        return () => {
          window.clearTimeout(timer);
          controller.abort();
        };
      }, [normalized, searchSessions]);

      // Treat content as empty/loading until it answers the current query.
      const content = remote.query === normalized
        ? { items: remote.items, hasMore: remote.hasMore }
        : { items: [], hasMore: false };

      // Locale labels resolved outside the memo so a language switch while the
      // page is open recomputes the view (labels are memo deps, not `t`).
      const ungroupedLabel = t('group.ungrouped');
      const untitledLabel = t('session.untitled');
      const view = React.useMemo(() => deriveView({
        list,
        workspaces: ws,
        query,
        content,
        limit: searchResultLimit,
        ungroupedLabel,
        untitledLabel,
      }), [list, ws, query, content, searchResultLimit, ungroupedLabel, untitledLabel]);

      const autoExpanded = {
        workspaces: view.workspaces.length > 0,
        sessions: view.sessions.length > 0,
      };
      const expanded = resolveExpanded(expandedByQuery, normalized, autoExpanded);

      function toggleGroup(key) {
        setExpandedByQuery((prev) => nextExpansion(prev, normalized, key, autoExpanded));
      }

      function clearQuery() {
        setQuery('');
        if (inputRef.current) inputRef.current.focus();
      }

      const groups = [
        {
          key: 'workspaces',
          label: t('group.workspaces'),
          items: view.workspaces,
          renderRow: (row) => h(WorkspaceRow, { key: row.workspaceId, row, t, openSession, openWorkspace }),
        },
        {
          key: 'sessions',
          label: t('group.sessions'),
          items: view.sessions,
          renderRow: (row) => h(SessionRow, { key: row.id, row, t, openSession }),
        },
      ];

      return h('div', { className: 'dwe-page' },
        h('style', { dangerouslySetInnerHTML: { __html: CSS } }),
        h('div', { className: 'dwe-column' },
          h('header', { className: 'dwe-header' },
            h('h1', { className: 'dwe-title' }, t('page.title')),
            h('p', { className: 'dwe-subtitle' }, t('page.subtitle')),
          ),
          h('div', { className: 'dwe-search' },
            h('span', { className: 'dwe-search-icon', 'aria-hidden': true }, searchGlyph),
            h('input', {
              ref: inputRef,
              className: 'dwe-search-input',
              type: 'text',
              value: query,
              maxLength: SEARCH_QUERY_MAX_CODE_UNITS,
              autoComplete: 'off',
              spellCheck: false,
              placeholder: t('search.placeholder'),
              'aria-label': t('search.placeholder'),
              onChange: (event) => setQuery(sanitizeQuery(event.target.value)),
            }),
            query.length > 0
              ? h('button', {
                  type: 'button',
                  className: 'dwe-search-clear',
                  'aria-label': t('search.clear'),
                  title: t('search.clear'),
                  onClick: clearQuery,
                }, clearGlyph)
              : null,
          ),
          h('div', { className: 'dwe-groups' },
            groups.map((group) => h(GroupSection, {
              key: group.key,
              group,
              t,
              expanded: expanded[group.key],
              onToggle: () => toggleGroup(group.key),
              renderRow: group.renderRow,
            })),
            view.hasMore
              ? h('p', { className: 'dwe-status' }, t('search.hasMore', { limit: searchResultLimit }))
              : null,
          ),
        ),
      );
    }

    // One collapsible group: header button (chevron, label, count) + body of rows.
    function GroupSection({ group, t, expanded, onToggle, renderRow }) {
      const count = group.items.length;
      return h('section', { className: 'dwe-group' },
        h('button', {
          type: 'button',
          className: 'dwe-group-header',
          'aria-expanded': expanded,
          'aria-label': `${group.label}, ${t('group.count', { count })}`,
          onClick: onToggle,
        },
          h('span', { className: 'dwe-group-chevron', 'aria-hidden': true },
            h('svg', { viewBox: '0 0 16 16', width: 16, height: 16, focusable: false },
              h('path', {
                d: 'M5 6.5l3 3 3-3',
                fill: 'none',
                stroke: 'currentColor',
                strokeWidth: 1.8,
                strokeLinecap: 'round',
                strokeLinejoin: 'round',
              }),
            ),
          ),
          h('span', { className: 'dwe-group-label' }, group.label),
          h('span', { className: 'dwe-group-count' }, t('group.count', { count })),
        ),
        expanded && count > 0
          ? h('div', { className: 'dwe-group-body' },
              h('ul', { className: 'dwe-group-list' }, group.items.map((item, index) => renderRow(item, index))),
            )
          : null,
      );
    }

    // A Workspace row: clicking opens its top pinned/recent Session, or a new
    // Session in the Workspace when it has none.
    function WorkspaceRow({ row, t, openSession, openWorkspace }) {
      const onClick = () => {
        if (row.topSessionId !== undefined) openSession(row.topSessionId);
        else openWorkspace(row.workspaceId);
      };
      return h('li', { className: 'dwe-row' },
        h('button', {
          type: 'button',
          className: 'dwe-row-button',
          title: row.path,
          'aria-label': t('row.openWorkspace', { name: row.title }),
          onClick,
        },
          h('span', { className: 'dwe-row-glyph', 'aria-hidden': true }, folderGlyph),
          h('span', { className: 'dwe-row-text' },
            h('span', { className: 'dwe-row-title' }, row.title),
            h('span', { className: 'dwe-row-secondary' }, row.path),
          ),
        ),
      );
    }

    // A Session row: title, workspace label, and a clamped content snippet when present.
    function SessionRow({ row, t, openSession }) {
      return h('li', { className: 'dwe-row' },
        h('button', {
          type: 'button',
          className: 'dwe-row-button',
          title: row.title,
          'aria-label': t('row.openSession', { title: row.title }),
          onClick: () => openSession(row.id),
        },
          h('span', { className: 'dwe-row-glyph', 'aria-hidden': true }, chatGlyph),
          h('span', { className: 'dwe-row-text' },
            h('span', { className: 'dwe-row-title' }, row.title),
            h('span', { className: 'dwe-row-secondary' }, row.workspaceLabel),
            row.snippet !== undefined
              ? h('span', { className: 'dwe-row-snippet' }, row.snippet)
              : null,
          ),
        ),
      );
    }

    // All page styles. Only theme tokens (--dsw-* / --dsh-*), no hardcoded
    // colors; every token carries a neutral fallback so the page degrades
    // gracefully if a token is missing.
    const CSS = `
      .dwe-page {
        box-sizing: border-box;
        height: 100%;
        min-height: 0;
        overflow-y: auto;
        padding: 0 clamp(24px, 4vw, 48px) 48px;
        color: var(--dsw-alias-label-primary, inherit);
        background: transparent;
      }
      .dwe-column {
        box-sizing: border-box;
        width: 100%;
        max-width: 960px;
        margin: 0 auto;
        padding: 0;
      }
      .dwe-header {
        padding-top: 28px;
        margin: 0 0 24px;
      }
      [data-platform='darwin'] .dwe-header {
        padding-top: calc(28px + var(--dsh-frame-top-clearance, 0px));
      }
      .dwe-title {
        margin: 0;
        font-size: 20px;
        font-weight: 500;
        line-height: 28px;
        color: var(--dsw-alias-label-primary, inherit);
      }
      .dwe-subtitle {
        margin: 4px 0 0;
        font-size: 13px;
        line-height: 20px;
        color: var(--dsw-alias-label-secondary, inherit);
      }
      .dwe-search {
        display: flex;
        align-items: center;
        gap: 8px;
        box-sizing: border-box;
        height: 36px;
        margin: 0 0 16px;
        padding: 0 10px;
        border: .5px solid var(--dsw-alias-border-l3, transparent);
        border-radius: 12px;
        background: transparent;
        transition: border-color .15s;
      }
      .dwe-search:hover {
        border-color: var(--dsw-alias-border-l2, transparent);
      }
      .dwe-search:focus-within {
        border-color: var(--dsw-alias-state-business-primary, transparent);
      }
      .dwe-search-icon {
        flex: none;
        display: flex;
        align-items: center;
        color: var(--dsw-alias-label-tertiary, currentColor);
      }
      .dwe-search-input {
        flex: 1 1 auto;
        min-width: 0;
        box-sizing: border-box;
        height: 100%;
        padding: 0;
        border: none;
        outline: none;
        background: transparent;
        color: var(--dsw-alias-label-primary, inherit);
        font: var(--dsw-font-s-14);
      }
      .dwe-search-input::placeholder {
        color: var(--dsw-alias-label-tertiary, currentColor);
        opacity: 1;
      }
      .dwe-search-clear {
        flex: none;
        display: flex;
        align-items: center;
        justify-content: center;
        width: 28px;
        height: 28px;
        margin-right: -6px;
        padding: 0;
        border: none;
        border-radius: var(--dsw-radius-sm, 4px);
        background: transparent;
        color: var(--dsw-alias-label-tertiary, currentColor);
        cursor: pointer;
      }
      .dwe-search-clear:hover {
        background: var(--dsw-alias-interactive-bg-hover, transparent);
        color: var(--dsw-alias-label-primary, inherit);
      }
      .dwe-status {
        margin: 0 0 16px;
        font: var(--dsw-font-s-14);
        color: var(--dsw-alias-label-tertiary, currentColor);
      }
      .dwe-groups {
        display: flex;
        flex-direction: column;
        gap: 12px;
      }
      .dwe-group {
        border-bottom: 1px solid var(--dsw-alias-border-l1, transparent);
      }
      .dwe-group-header {
        display: flex;
        align-items: center;
        gap: 8px;
        width: 100%;
        box-sizing: border-box;
        padding: 12px 4px;
        border: none;
        border-radius: var(--dsw-radius-sm, 4px);
        background: transparent;
        color: var(--dsw-alias-label-primary, inherit);
        font: var(--dsw-font-base-16);
        text-align: left;
        cursor: pointer;
      }
      .dwe-group-header:hover {
        background: var(--dsw-alias-interactive-bg-hover, transparent);
      }
      .dwe-group-chevron {
        flex: none;
        display: flex;
        align-items: center;
        color: var(--dsw-alias-label-tertiary, currentColor);
        transition: transform 0.15s ease;
      }
      .dwe-group-header[aria-expanded='false'] .dwe-group-chevron {
        transform: rotate(-90deg);
      }
      .dwe-group-label {
        flex: 0 0 auto;
      }
      .dwe-group-count {
        flex: none;
        padding: 2px 8px;
        border-radius: var(--dsw-radius-lg, 999px);
        background: var(--dsw-alias-bg-layer-1, transparent);
        color: var(--dsw-alias-label-tertiary, currentColor);
        font: var(--dsw-font-xxs-12);
      }
      .dwe-group-body {
        padding: 0 4px 14px;
      }
      .dwe-group-list {
        display: flex;
        flex-direction: column;
        gap: 4px;
        margin: 0;
        padding: 0;
        list-style: none;
      }
      .dwe-row {
        min-width: 0;
      }
      .dwe-row-button {
        display: flex;
        align-items: flex-start;
        gap: 10px;
        width: 100%;
        box-sizing: border-box;
        padding: 10px;
        border: none;
        border-radius: var(--dsw-radius-sm, 4px);
        background: transparent;
        color: var(--dsw-alias-label-primary, inherit);
        font: var(--dsw-font-s-14);
        text-align: left;
        cursor: pointer;
      }
      .dwe-row-button:hover {
        background: var(--dsw-alias-interactive-bg-hover, transparent);
      }
      .dwe-row-glyph {
        flex: none;
        display: flex;
        align-items: center;
        margin-top: 1px;
        color: var(--dsw-alias-label-tertiary, currentColor);
      }
      .dwe-row-text {
        flex: 1 1 auto;
        min-width: 0;
        display: flex;
        flex-direction: column;
        gap: 2px;
      }
      .dwe-row-title {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        color: var(--dsw-alias-label-primary, inherit);
      }
      .dwe-row-secondary {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        font: var(--dsw-font-xxs-12);
        color: var(--dsw-alias-label-secondary, currentColor);
      }
      .dwe-row-snippet {
        overflow: hidden;
        display: -webkit-box;
        -webkit-box-orient: vertical;
        -webkit-line-clamp: 1;
        font: var(--dsw-font-xxs-12);
        color: var(--dsw-alias-label-tertiary, currentColor);
      }
      .dwe-search-input:focus-visible {
        outline: none;
      }
      .dwe-search-clear:focus-visible,
      .dwe-group-header:focus-visible,
      .dwe-row-button:focus-visible {
        outline: 2px solid var(--dsw-alias-state-business-primary);
        outline-offset: 2px;
      }
      @media (prefers-reduced-motion: reduce) {
        .dwe-group-chevron {
          transition: none;
        }
      }
    `;

    function apply(ctx) {
      const t = ctx.locale.bind(NS);
      ctx.effect(() => ctx.locale.register(NS, { en, zh }), 'dsh-workspace-explorer: dictionaries');
      ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({
        name: 'sidebar.panellist',
        id: PANEL_ID,
        order: 2,
        locale: NS,
        label: () => t('panel.label'),
      }, PanelIcon));
      ctx.slots.inject('main', () => ctx.slots.register({
        name: 'main',
        key: PANEL_ID,
        locale: NS,
        inject: () => ({
          searchSessions: async (query, signal) => {
            const result = await ctx.sessions.search(query, signal);
            if (!result.ok) throw new Error(result.error.message);
            return result.value; // { items: { sessionId, snippet }[], hasMore: boolean }
          },
          searchResultLimit: ctx.sessions.searchResultLimit, // 20
          openSession: (sessionId) => ctx.uiWorkspace.openSession(sessionId),
          openWorkspace: (workspaceId) => {
            // fire-and-forget: the service already shows a create-failure notice
            Promise.resolve(ctx.uiWorkspace.openWorkspace(workspaceId)).catch((reason) =>
              console.warn('workspace explorer: open workspace failed', reason));
          },
        }),
      }, ExplorerPage));
    }

    return {
      inject: ['slots', 'locale', 'sessions', 'uiWorkspace'],
      apply,
      __test: {
        sanitizeQuery,
        basename,
        workspaceName,
        sessionMatchTitle,
        sessionDisplayTitle,
        isVisibleSummary,
        localSessionMatches,
        mergeSessionResults,
        recentSessions,
        selectTopSessionId,
        deriveView,
        nextExpansion,
        resolveExpanded,
        locales: { en, zh },
      },
    };
  },
});
