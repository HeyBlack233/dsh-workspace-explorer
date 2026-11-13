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
    /** Profile entry id whose volatile Config carries the Workspaces order. */
    const SETTINGS_NS = 'dsh-workspace-explorer';

    // Runtime en/zh dictionaries. Every visible string goes through t().
    const en = {
      'panel.label': 'Workspace Explorer',
      'page.title': 'Workspace Explorer',
      'page.subtitle': 'Search sessions and browse workspaces in one place.',
      'search.placeholder': 'Search workspaces / sessions',
      'search.clear': 'Clear search',
      'search.hasMore': 'Showing the first {limit} results. Narrow your search.',
      'group.workspaces': 'Workspaces',
      'group.sessions': 'Sessions',
      'group.ungrouped': 'Ungrouped',
      'group.count': '{count}',
      'group.addWorkspace': 'Add workspace',
      'group.addWorkspaceFailed': 'Could not add workspace: {message}',
      'viewOptions.label': 'View options',
      'orderBy.label': 'Order by',
      'orderBy.manual': 'Manual',
      'orderBy.updated': 'Last updated',
      'state.loading': 'Loading…',
      'row.openWorkspace': 'Open workspace {name}',
      'row.openSession': 'Open session {title}',
      'row.workspaceMenu': 'Workspace actions for {name}',
      'row.newSession': 'New session in {name}',
      'session.untitled': 'Untitled',
    };
    const zh = {
      'panel.label': '工作区浏览器',
      'page.title': '工作区浏览器',
      'page.subtitle': '在一个页面中搜索会话、浏览工作区。',
      'search.placeholder': '搜索工作区 / 会话',
      'search.clear': '清除搜索',
      'search.hasMore': '仅显示前 {limit} 条结果，请缩小搜索范围。',
      'group.workspaces': '工作区',
      'group.sessions': '会话',
      'group.ungrouped': '未分组',
      'group.count': '{count}',
      'group.addWorkspace': '添加工作区',
      'group.addWorkspaceFailed': '无法添加工作区：{message}',
      'viewOptions.label': '视图选项',
      'orderBy.label': '排序方式',
      'orderBy.manual': '手动排序',
      'orderBy.updated': '最近更新',
      'state.loading': '加载中…',
      'row.openWorkspace': '打开工作区 {name}',
      'row.openSession': '打开会话 {title}',
      'row.workspaceMenu': '工作区 {name} 的操作',
      'row.newSession': '在 {name} 中新建会话',
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
     * Most recently updated visible Session of a Workspace, or undefined when
     * it has none. Only numeric `updatedAt` values count; archived, blank,
     * and subagent Sessions are invisible to the ordering.
     */
    function latestSessionUpdatedAt(workspace, list, archivedSessionIds) {
      const archived = new Set(archivedSessionIds ?? []);
      let latest;
      for (const sessionId of workspace.sessionIds ?? []) {
        const summary = list.byId[sessionId];
        if (!isVisibleSummary(summary, archived)) continue;
        if (typeof summary.updatedAt !== 'number') continue;
        if (latest === undefined || summary.updatedAt > latest) latest = summary.updatedAt;
      }
      return latest;
    }

    /**
     * Workspaces in Host order, or most-recently-updated first when `orderBy`
     * is 'updated'. Workspaces without visible Sessions trail behind; ties
     * keep the original Host order. Always returns a new array.
     */
    function orderWorkspaces(items, list, orderBy, archivedSessionIds) {
      if (orderBy !== 'updated') return items.slice();
      const latest = new Map();
      const index = new Map();
      items.forEach((workspace, i) => {
        latest.set(workspace, latestSessionUpdatedAt(workspace, list, archivedSessionIds));
        index.set(workspace, i);
      });
      return items.slice().sort((a, b) => {
        const la = latest.get(a);
        const lb = latest.get(b);
        if (la === lb) return index.get(a) - index.get(b);
        if (la === undefined) return 1;
        if (lb === undefined) return -1;
        return la > lb ? -1 : 1;
      });
    }

    /** Persisted Order-by value, or undefined for anything outside the contract. */
    function normalizeOrderBy(value) {
      return value === 'manual' || value === 'updated' ? value : undefined;
    }

    /**
     * Order-by value from a settings.describe() payload, or undefined when the
     * plugin namespace is absent or its field is missing/invalid.
     */
    function orderByFromSettings(describeValue) {
      const namespaces = describeValue?.namespaces;
      if (!Array.isArray(namespaces)) return undefined;
      const target = namespaces.find((entry) => entry?.ns === SETTINGS_NS);
      return normalizeOrderBy(target?.value?.orderBy);
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

    /** First Workspace owning the Session, matching the native sidebar's first-wins rule. */
    function owningWorkspace(session, workspaces) {
      return (workspaces ?? []).find((workspace) => workspace.sessionIds.includes(session.id));
    }

    /** Normalize separators for path comparison without treating POSIX backslashes as separators. */
    function folderPath(path) {
      if (typeof path !== 'string') return '';
      return (/^[A-Za-z]:[/\\]/.test(path) || path.startsWith('\\\\')
        ? path.replaceAll('\\', '/')
        : path).replace(/\/+$/, '');
    }

    /**
     * Nearest registered ancestor directory of a Workspace, excluding itself:
     * the longest other Workspace path that is its prefix, in Host spelling.
     */
    function owningParentFolder(path, parents) {
      const child = folderPath(path);
      let owner;
      let length = -1;
      for (const parent of parents) {
        const root = folderPath(parent);
        if (root.length > length && child !== root && child.startsWith(`${root}/`)) {
          owner = parent;
          length = root.length;
        }
      }
      return owner;
    }

    /**
     * Native sidebar group keys to expand for one Workspace: itself first,
     * then its ancestors for the Workspace-tree grouping mode. Sibling
     * grouping ignores the extra keys, so callers need not know the mode.
     */
    function groupKeysForWorkspace(workspace, workspaces) {
      const items = workspaces ?? [];
      const keys = [workspace.workspaceId];
      const seen = new Set(keys);
      const paths = items
        .map((item) => item.path)
        .filter((path) => typeof path === 'string' && path !== '');
      let current = workspace;
      while (true) {
        const parentPath = owningParentFolder(current.path, paths);
        if (parentPath === undefined) break;
        const parent = items.find((item) => item.path === parentPath);
        if (parent === undefined || seen.has(parent.workspaceId)) break;
        keys.push(parent.workspaceId);
        seen.add(parent.workspaceId);
        current = parent;
      }
      return keys;
    }

    /** Native sidebar group keys for a Session: its owning Workspace chain, else Ungrouped (''). */
    function groupKeysForSession(session, workspaces) {
      const owner = owningWorkspace(session, workspaces);
      return owner === undefined ? [''] : groupKeysForWorkspace(owner, workspaces);
    }

    /**
     * Row label for a Session: the title of the owning Workspace (first
     * workspace wins), else the basename of its cwd, else the ungrouped label.
     */
    function labelForSession(session, workspaces, ungroupedLabel) {
      const owner = owningWorkspace(session, workspaces);
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
    function deriveView({ list, workspaces, query, content, limit, orderBy = 'manual', ungroupedLabel = '', untitledLabel = 'Untitled' }) {
      const normalized = sanitizeQuery(query).trim();
      const items = workspaces.items ?? [];
      const archivedSessionIds = workspaces.archivedSessionIds ?? [];
      const pinnedSessionIds = workspaces.pinnedSessionIds ?? [];

      const workspaceRows = (input) => input.map((workspace) => ({
        workspaceId: workspace.workspaceId,
        title: workspaceName(workspace),
        path: workspace.path,
        groupKeys: groupKeysForWorkspace(workspace, items),
        topSessionId: selectTopSessionId(workspace, list, pinnedSessionIds, archivedSessionIds),
      }));

      const sessionRows = (summaries) => summaries.map((summary) => ({
        id: summary.id,
        title: sessionDisplayTitle(summary, untitledLabel),
        workspaceLabel: labelForSession(summary, items, ungroupedLabel),
        groupKeys: groupKeysForSession(summary, items),
        ...(summary.snippet !== undefined ? { snippet: summary.snippet } : {}),
        updatedAt: summary.updatedAt,
      }));

      if (normalized === '') {
        return {
          workspaces: workspaceRows(orderWorkspaces(items, list, orderBy, archivedSessionIds)),
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
        workspaces: workspaceRows(orderWorkspaces(
          items.filter((workspace) => workspaceName(workspace).toLowerCase().includes(q)),
          list,
          orderBy,
          archivedSessionIds,
        )),
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

    /**
     * The native Workspace browser's viewing-store actions, reached through
     * the `sidebar.workspaces` registration. Its store is the registration's
     * own handle (windowed here as the same shared instance), so expanding a
     * group updates the native sidebar rather than persisting it separately.
     * Ambiguity or absence degrades to no-op instead of breaking navigation.
     */
    function sidebarViewActions(slots) {
      let entries;
      try {
        // Prefer the rendering winners (the entry the outlet actually displays) over
        // shadowed registrations; entries() is the fallback on older slot layers.
        entries = typeof slots.entriesOfSlot === 'function'
          ? slots.entriesOfSlot('sidebar.workspaces')
          : slots.entries('sidebar.workspaces');
      } catch {
        return undefined;
      }
      for (const entry of entries ?? []) {
        const handle = entry?.store;
        if (handle === undefined || handle === null) continue;
        const view = typeof handle.create === 'function' ? handle.create() : handle;
        const actions = view?.actions;
        if (typeof actions?.setGroupExpanded === 'function') return actions;
      }
      return undefined;
    }

    /** Expand every native sidebar group key in order; returns false when the slot is unavailable. */
    function expandWorkspaceGroups(slots, groupKeys) {
      const actions = sidebarViewActions(slots);
      if (actions === undefined) return false;
      for (const key of groupKeys ?? []) {
        if (typeof key === 'string') actions.setGroupExpanded(key, true);
      }
      return true;
    }

    /** Scroll the first visible native sidebar row whose `data-row-key` is one of `rowKeys`. */
    function revealSidebarRow(doc, rowKeys) {
      if (doc === undefined || doc === null || typeof doc.querySelectorAll !== 'function') return false;
      let rows;
      try {
        rows = doc.querySelectorAll('[data-row-key]');
      } catch {
        return false;
      }
      for (const key of rowKeys ?? []) {
        for (const row of rows ?? []) {
          if (typeof row?.getAttribute !== 'function' || row.getAttribute('data-row-key') !== key) continue;
          if (typeof row.scrollIntoView === 'function') row.scrollIntoView({ block: 'nearest' });
          return true;
        }
      }
      return false;
    }

    /**
     * After one navigation, wait for the native sidebar to render the expanded
     * group and scroll its row into view. Retries a few frames because the
     * store write, the sidebar render, and an asynchronous Session creation
     * settle on different ticks.
     */
    function scheduleSidebarRowReveal(rowKeys) {
      if (typeof window === 'undefined' || typeof document === 'undefined') return;
      let attempts = 0;
      const tryReveal = () => {
        if (revealSidebarRow(document, rowKeys)) return;
        attempts++;
        if (attempts >= 10) return;
        if (typeof window.requestAnimationFrame === 'function') window.requestAnimationFrame(tryReveal);
        else window.setTimeout(tryReveal, 16);
      };
      if (typeof window.requestAnimationFrame === 'function') window.requestAnimationFrame(tryReveal);
      else window.setTimeout(tryReveal, 0);
    }

    /** Current main-view Session id from a Session list snapshot, or undefined. */
    function currentMainSessionId(list) {
      return Object.values(list?.byId ?? {}).find((summary) => (summary?.retainedBy?.mainView ?? 0) > 0)?.id;
    }

    /**
     * The native shared context-menu target for a Workspace. `contextMenus`
     * resolves this by `kind` and the menu contributions read the value,
     * exactly like the native sidebar's `{ kind: 'workspace', value: {...} }`.
     */
    function workspaceMenuTarget(workspaceId, path, displayTitle) {
      return { kind: 'workspace', value: { workspaceId, path, displayTitle } };
    }

    /**
     * The registered `sidebar.workspaces.directoryFlow` entry: the native
     * directory flow the sidebar's own Add workspace button renders. Read the
     * rendering winner first (the entry an outlet actually displays), then fall
     * back to all entries on older slot layers.
     */
    function directoryFlowEntry(slots) {
      if (slots === undefined || slots === null) return undefined;
      try {
        const entries = typeof slots.entriesOfSlot === 'function'
          ? slots.entriesOfSlot('sidebar.workspaces.directoryFlow')
          : slots.entries('sidebar.workspaces.directoryFlow');
        return entries?.[0];
      } catch {
        return undefined;
      }
    }

    /**
     * Component plus injected face of the native directory flow, or undefined
     * when the composition has no flow (the sidebar hides its button then too).
     * The flow entry's injection is plain props (native chooser `pick`, or the
     * browse flow's listing helpers and translator); an entry whose injection
     * needs render-time hook binding is left alone rather than rendered blind.
     */
    function directoryFlowFace(entry) {
      if (entry === undefined || entry === null || entry.component === undefined || entry.component === null) return undefined;
      if (typeof entry.inject !== 'function') return undefined;
      let face;
      try {
        face = entry.inject();
      } catch {
        return undefined;
      }
      if (face === null || typeof face !== 'object' || face.hooks !== undefined) return undefined;
      return { component: entry.component, props: face };
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

    // Ellipsis glyph for the per-workspace menu trigger, matching the native
    // sidebar button artwork (three filled dots, currentColor).
    const ellipsisGlyph = h('svg', {
      viewBox: '0 0 16 16',
      width: 16,
      height: 16,
      'aria-hidden': true,
      focusable: false,
    }, h('g', { fill: 'currentColor' }, [
      h('path', { d: 'M3 9C3.55228 9 4 8.55228 4 8C4 7.44772 3.55228 7 3 7C2.44772 7 2 7.44772 2 8C2 8.55228 2.44772 9 3 9Z' }),
      h('path', { d: 'M8 9C8.55228 9 9 8.55228 9 8C9 7.44772 8.55228 7 8 7C7.44772 7 7 7.44772 7 8C7 8.55228 7.44772 9 8 9Z' }),
      h('path', { d: 'M13 9C13.5523 9 14 8.55228 14 8C14 7.44772 13.5523 7 13 7C12.4477 7 12 7.44772 12 8C12 8.55228 12.4477 9 13 9Z' }),
    ]));

    // New-session glyph for the per-workspace create button, matching the
    // native sidebar button artwork (outlined bubble plus a plus sign).
    const newChatGlyph = h('svg', {
      viewBox: '0 0 16 16',
      width: 14,
      height: 14,
      'aria-hidden': true,
      focusable: false,
    }, h('g', {
      fill: 'none',
      stroke: 'currentColor',
      strokeWidth: 1,
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
    }, [
      h('path', { d: 'M2.37091 11.2501C1.58745 9.89288 1.32067 8.29835 1.61969 6.76006C1.91872 5.22177 2.76342 3.8433 3.99826 2.87846C5.2331 1.91362 6.77494 1.42737 8.33988 1.50925C9.90482 1.59113 11.3875 2.23562 12.5149 3.32406C13.6425 4.41269 14.3387 5.87206 14.4754 7.4334C14.612 8.99474 14.18 10.5529 13.2587 11.8209C12.3375 13.0888 10.9891 13.9813 9.46194 14.3337C8.18691 14.628 6.85895 14.5294 5.64989 14.0605C5.1712 13.8748 4.76962 13.4932 4.26534 13.3967C3.67413 13.2835 2.95257 13.5598 2.03794 14.3337' }),
      h('path', { d: 'M8 5V11' }),
      h('path', { d: 'M5 8H11' }),
    ]));

    // Add-workspace glyph for the Workspaces group header, matching the native
    // sidebar's plus button artwork: a filled folder outline with a plus sign.
    const projectAddGlyph = h('svg', {
      viewBox: '0 0 16 16',
      width: 16,
      height: 16,
      fill: 'none',
      strokeWidth: 1,
      'aria-hidden': true,
      focusable: false,
    }, [
      h('path', {
        key: 'project-add-folder',
        d: 'M5.54492 2.06738C5.91034 2.06754 6.26318 2.20149 6.53711 2.44336L7.94043 3.68164V4.7998C7.71462 4.74105 7.50367 4.63139 7.32617 4.47461L5.87598 3.19238C5.78477 3.11185 5.66658 3.06754 5.54492 3.06738H2.94922C2.67322 3.06738 2.44946 3.29145 2.44922 3.56738V12.4326C2.44927 12.7087 2.67311 12.9326 2.94922 12.9326H12.9326C13.2086 12.9325 13.4326 12.7086 13.4326 12.4326V8.53613H14.4326V12.4326C14.4326 13.2609 13.7609 13.9325 12.9326 13.9326H2.94922C2.12083 13.9326 1.44927 13.261 1.44922 12.4326V3.56738C1.44946 2.73916 2.12094 2.06738 2.94922 2.06738H5.54492Z',
        fill: 'currentColor',
      }),
      h('path', { key: 'project-add-horizontal', d: 'M9.75977 4.50208H14.5509', stroke: 'currentColor' }),
      h('path', { key: 'project-add-vertical', d: 'M12.1492 6.89758L12.1492 2.10642', stroke: 'currentColor' }),
    ]);

    // View options trigger artwork for the Workspaces group header, matching
    // the native sidebar's sliders icon: two horizontal tracks with a knob
    // each, currentColor.
    const viewOptionsGlyph = h('svg', {
      viewBox: '0 0 16 16',
      width: 16,
      height: 16,
      fill: 'none',
      stroke: 'currentColor',
      strokeWidth: 1,
      strokeLinecap: 'round',
      'aria-hidden': true,
      focusable: false,
    }, [
      h('path', { d: 'M2.3 5h5.85M12.05 5h1.65' }),
      h('circle', { cx: 9.95, cy: 5, r: 1.45 }),
      h('path', { d: 'M2.3 11h1.65M7.85 11h5.85' }),
      h('circle', { cx: 5.75, cy: 11, r: 1.45 }),
    ]);

    // Order-by menu item artwork, matching the native sidebar: Manual uses a
    // chevrons glyph, Last updated a clock.
    const orderByManualGlyph = h('svg', {
      viewBox: '0 0 16 16',
      width: 16,
      height: 16,
      fill: 'none',
      stroke: 'currentColor',
      strokeWidth: 1,
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
      'aria-hidden': true,
      focusable: false,
    }, [
      h('path', { d: 'M5.1 6L8 3.1L10.9 6' }),
      h('path', { d: 'M5.1 10L8 12.9L10.9 10' }),
    ]);

    const orderByUpdatedGlyph = h('svg', {
      viewBox: '0 0 16 16',
      width: 16,
      height: 16,
      fill: 'none',
      stroke: 'currentColor',
      strokeWidth: 1,
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
      'aria-hidden': true,
      focusable: false,
    }, [
      h('path', { d: 'M8 14C11.3137 14 14 11.3137 14 8C14 4.68629 11.3137 2 8 2C4.68629 2 2 4.68629 2 8C2 11.3137 4.68629 14 8 14Z' }),
      h('path', { d: 'M8 4.31V8.46L11 10.08' }),
    ]);

    // Check mark on the selected Order-by item.
    const viewMenuCheckGlyph = h('svg', {
      viewBox: '0 0 16 16',
      width: 14,
      height: 14,
      fill: 'none',
      stroke: 'currentColor',
      strokeWidth: 1,
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
      'aria-hidden': true,
      focusable: false,
    }, [
      h('path', { d: 'M2.25 8.5L5.49732 11.7473C5.90519 12.1552 6.57263 12.1344 6.95426 11.7018L13.75 4' }),
    ]);

    // ---------------------------------------------------------------------
    // Workspaces group header: native Add workspace action.
    // ---------------------------------------------------------------------

    /**
     * State and nodes for the Workspaces group header's Add workspace action.
     * The button and the directory flow it opens are borrowed from the same
     * native `sidebar.workspaces.directoryFlow` registration the sidebar's own
     * plus button uses: whichever picker backend the composition mounted
     * (native OS chooser or in-app browse dialog) renders unchanged. With no
     * flow registration the action is absent, matching the native sidebar.
     */
    function useAddWorkspace({ t, useDirectoryFlow, createWorkspace, startSession }) {
      const entry = typeof useDirectoryFlow === 'function' ? useDirectoryFlow((value) => value) : undefined;
      const flow = React.useMemo(() => directoryFlowFace(entry), [entry]);
      const [open, setOpen] = React.useState(false);
      const [busy, setBusy] = React.useState(false);
      const [error, setError] = React.useState(null);

      const close = () => {
        setOpen(false);
        setBusy(false);
      };
      const fail = (message) => {
        setOpen(false);
        setBusy(false);
        setError(t('group.addWorkspaceFailed', { message }));
      };
      const onPicked = (path) => {
        if (typeof path !== 'string' || path === '') {
          close();
          return;
        }
        setBusy(true);
        Promise.resolve()
          .then(() => createWorkspace(path))
          .then((workspace) => {
            setOpen(false);
            setBusy(false);
            setError(null);
            // The native sidebar's Add workspace action starts a new Session in
            // the adopted Workspace before leaving the picker; match it here.
            const workspaceId = workspace?.workspaceId;
            if (typeof workspaceId === 'string' && workspaceId !== '') {
              try {
                startSession(workspaceId);
              } catch (reason) {
                console.warn('workspace explorer: open new workspace Session failed', reason);
              }
            }
          })
          .catch((reason) => fail(reason instanceof Error ? reason.message : String(reason)));
      };

      const button = flow === undefined
        ? null
        : h('button', {
            type: 'button',
            className: 'dwe-group-add',
            'aria-label': t('group.addWorkspace'),
            title: t('group.addWorkspace'),
            disabled: busy,
            onClick: (event) => {
              event.stopPropagation();
              setError(null);
              setOpen(true);
            },
          }, projectAddGlyph);

      const overlay = flow === undefined
        ? null
        : h(flow.component, {
            ...flow.props,
            open,
            busy,
            onPicked,
            onCancel: close,
            onError: (message) => fail(typeof message === 'string' ? message : String(message)),
          });

      const notice = error === null
        ? null
        : h('p', { className: 'dwe-group-notice', role: 'alert' }, error);

      return { button, overlay, notice };
    }

    // ---------------------------------------------------------------------
    // Workspaces group header: View options (Order by) menu.
    // ---------------------------------------------------------------------

    // Order-by choices, in display order. `manual` keeps the Host order;
    // `updated` re-sorts by each Workspace's newest visible Session.
    const ORDER_BY_OPTIONS = [
      { value: 'manual', labelKey: 'orderBy.manual' },
      { value: 'updated', labelKey: 'orderBy.updated' },
    ];

    /**
     * View options trigger shown left of the Add workspace button. It opens a
     * small Order-by menu; the selection lives in page state and resets when
     * the page remounts. Outside pointerdown, Escape, and focus leaving the
     * wrapper close the menu; ArrowUp/Down cycle the two items.
     */
    function ViewOptionsMenu({ t, orderBy, onPick }) {
      const [open, setOpen] = React.useState(false);
      const wrapRef = React.useRef(null);
      const triggerRef = React.useRef(null);

      const close = () => setOpen(false);

      const pick = (value) => {
        if (typeof onPick === 'function') onPick(value);
        close();
        if (triggerRef.current !== null && typeof triggerRef.current.focus === 'function') {
          triggerRef.current.focus();
        }
      };

      const toggle = (event) => {
        event.stopPropagation();
        setOpen((prev) => !prev);
      };

      // While open, close on outside pointerdown and on Escape. Both listeners
      // are removed when the menu closes or the component unmounts.
      React.useEffect(() => {
        if (!open) return;
        const onPointerDown = (event) => {
          const wrap = wrapRef.current;
          if (wrap !== null && typeof wrap.contains === 'function' && wrap.contains(event.target)) return;
          setOpen(false);
        };
        const onKeyDown = (event) => {
          if (event.key !== 'Escape') return;
          event.preventDefault();
          event.stopPropagation();
          setOpen(false);
          if (triggerRef.current !== null && typeof triggerRef.current.focus === 'function') {
            triggerRef.current.focus();
          }
        };
        document.addEventListener('pointerdown', onPointerDown);
        document.addEventListener('keydown', onKeyDown);
        return () => {
          document.removeEventListener('pointerdown', onPointerDown);
          document.removeEventListener('keydown', onKeyDown);
        };
      }, [open]);

      // Focus the selected item (first item as a fallback) when the menu opens.
      React.useEffect(() => {
        if (!open) return;
        const wrap = wrapRef.current;
        const menu = wrap === null ? null : wrap.querySelector('.dwe-view-menu');
        if (menu === null) return;
        let target = menu.querySelector('[data-order-by][aria-checked="true"]');
        if (target === null) target = menu.querySelector('[data-order-by]');
        if (target !== null && typeof target.focus === 'function') target.focus();
      }, [open]);

      const onMenuKeyDown = (event) => {
        const wrap = wrapRef.current;
        const menu = wrap === null ? null : wrap.querySelector('.dwe-view-menu');
        if (menu === null) return;
        const items = Array.from(menu.querySelectorAll('[data-order-by]'));
        if (items.length === 0) return;
        const current = items.findIndex((item) => item === document.activeElement);
        let next = current;
        if (event.key === 'ArrowDown') next = current === -1 ? 0 : (current + 1) % items.length;
        else if (event.key === 'ArrowUp') next = current === -1 ? items.length - 1 : (current - 1 + items.length) % items.length;
        else if (event.key === 'Home') next = 0;
        else if (event.key === 'End') next = items.length - 1;
        else return;
        event.preventDefault();
        items[next].focus();
      };

      // Focus leaving the wrapper (Tab away) closes the menu; focus moves
      // between the trigger and the items stay inside, so they are unaffected.
      const onWrapBlur = (event) => {
        if (!open) return;
        const wrap = wrapRef.current;
        const next = event.relatedTarget;
        if (wrap !== null && (next === null || typeof wrap.contains !== 'function' || !wrap.contains(next))) {
          setOpen(false);
        }
      };

      return h('div', { ref: wrapRef, className: 'dwe-group-view-wrap', onBlur: onWrapBlur },
        h('button', {
          ref: triggerRef,
          type: 'button',
          className: 'dwe-group-view',
          'aria-label': t('viewOptions.label'),
          title: t('viewOptions.label'),
          'aria-haspopup': 'menu',
          'aria-expanded': open,
          'data-view-options-trigger': '',
          onClick: toggle,
        }, viewOptionsGlyph),
        !open ? null : h('div', {
          className: 'dwe-view-menu',
          role: 'menu',
          'aria-label': t('orderBy.label'),
          onKeyDown: onMenuKeyDown,
        },
          h('div', { className: 'dwe-view-menu-label' }, t('orderBy.label')),
          ORDER_BY_OPTIONS.map((option) => {
            const selected = orderBy === option.value;
            return h('button', {
              key: option.value,
              type: 'button',
              role: 'menuitemradio',
              'aria-checked': selected,
              className: 'dwe-view-menu-item',
              'data-order-by': option.value,
              onClick: () => pick(option.value),
            },
              h('span', { className: 'dwe-view-menu-item-icon', 'aria-hidden': true },
                option.value === 'manual' ? orderByManualGlyph : orderByUpdatedGlyph),
              h('span', { className: 'dwe-view-menu-item-label' }, t(option.labelKey)),
              selected
                ? h('span', { className: 'dwe-view-menu-check', 'aria-hidden': true }, viewMenuCheckGlyph)
                : null,
            );
          }),
        ),
      );
    }

    // ---------------------------------------------------------------------
    // Persisted Workspaces ordering (volatile Host plugin Config).
    // ---------------------------------------------------------------------

    /**
     * Controlled Order-by state backed by the plugin's volatile Config: load
     * the saved value once on mount, then save every pick. A pick made before
     * the initial read resolves wins; an unavailable or read-only settings
     * service degrades to page memory.
     */
    function useOrderByPreference(preference) {
      const [orderBy, setOrderBy] = React.useState('manual');
      const touched = React.useRef(false);
      const load = preference?.load;
      const save = preference?.save;

      React.useEffect(() => {
        if (typeof load !== 'function') return;
        let cancelled = false;
        Promise.resolve().then(load).then((value) => {
          if (cancelled || touched.current) return;
          const normalized = normalizeOrderBy(value);
          if (normalized !== undefined) setOrderBy(normalized);
        }).catch((reason) => {
          console.warn('workspace explorer: load order preference failed', reason);
        });
        return () => { cancelled = true; };
      }, [load]);

      const pick = (value) => {
        const normalized = normalizeOrderBy(value);
        if (normalized === undefined) return;
        touched.current = true;
        setOrderBy(normalized);
        if (typeof save !== 'function') return;
        Promise.resolve().then(() => save(normalized)).then((saved) => {
          if (saved === false) console.warn('workspace explorer: order preference was not persisted');
        }).catch((reason) => {
          console.warn('workspace explorer: save order preference failed', reason);
        });
      };

      return [orderBy, pick];
    }

    // ---------------------------------------------------------------------
    // Page.
    // ---------------------------------------------------------------------

    // The `main` slot passes the standard `useSessions` / `useWorkspaces` /
    // `useWorkspaceAccess` hooks, `t`, and the `inject` face ({ searchSessions,
    // searchResultLimit, openSession, openWorkspace, startSession,
    // openWorkspaceMenu, closeWorkspaceMenu, useWorkspaceMenuOpen,
    // useDirectoryFlow, createWorkspace, orderByPreference }) as props.
    function ExplorerPage({ t, useSessions, useWorkspaces, useWorkspaceAccess, searchSessions, searchResultLimit = 20, openSession, openWorkspace, startSession, openWorkspaceMenu, closeWorkspaceMenu, useWorkspaceMenuOpen, useDirectoryFlow, createWorkspace, orderByPreference }) {
      const list = useSessions((s) => s);
      const ws = useWorkspaces((s) => s);
      const [query, setQuery] = React.useState('');
      const [remote, setRemote] = React.useState({ query: '', status: 'idle', items: [], hasMore: false });
      // Workspaces group ordering; persisted in the plugin's volatile Config.
      const [orderBy, setOrderBy] = useOrderByPreference(orderByPreference);
      // Expansion overrides keyed by the normalized query; {} means auto:
      // a group is expanded iff it has items, unless the user toggled it for
      // the current query. Re-derived per query, not frozen at mount.
      const [expandedByQuery, setExpandedByQuery] = React.useState({});
      const inputRef = React.useRef(null);
      const addWorkspace = useAddWorkspace({ t, useDirectoryFlow, createWorkspace, startSession });

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
        orderBy,
        ungroupedLabel,
        untitledLabel,
      }), [list, ws, query, content, searchResultLimit, orderBy, ungroupedLabel, untitledLabel]);

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
          action: addWorkspace,
          leadingAction: h(ViewOptionsMenu, { t, orderBy, onPick: setOrderBy }),
          renderRow: (row) => h(WorkspaceRow, { key: row.workspaceId, row, t, openSession, openWorkspace, startSession, openWorkspaceMenu, closeWorkspaceMenu, useWorkspaceMenuOpen, useWorkspaceAccess }),
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
              action: group.action,
              leadingAction: group.leadingAction,
              renderRow: group.renderRow,
            })),
            view.hasMore
              ? h('p', { className: 'dwe-status' }, t('search.hasMore', { limit: searchResultLimit }))
              : null,
          ),
        ),
      );
    }

    // One collapsible group: header row (chevron, label, count) + optional
    // leading and trailing actions + body of rows. The action's overlay/notice
    // render as siblings of the row so its dialog never participates in row
    // layout. `leadingAction` (e.g. View options) sits left of the trailing
    // action (e.g. Add workspace).
    function GroupSection({ group, t, expanded, onToggle, renderRow, action, leadingAction }) {
      const count = group.items.length;
      const actionButton = action?.button ?? null;
      const hasActions = (leadingAction !== undefined && leadingAction !== null) || actionButton !== null;
      return h('section', { className: 'dwe-group' },
        h('div', {
          className: hasActions ? 'dwe-group-head dwe-group-head-with-action' : 'dwe-group-head',
        },
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
          !hasActions
            ? null
            : h('div', { className: 'dwe-group-actions' },
                leadingAction === undefined || leadingAction === null ? null : leadingAction,
                actionButton,
              ),
        ),
        action?.notice ?? null,
        action?.overlay ?? null,
        expanded && count > 0
          ? h('div', { className: 'dwe-group-body' },
              h('ul', { className: 'dwe-group-list' }, group.items.map((item, index) => renderRow(item, index))),
            )
          : null,
      );
    }

    // A Workspace row: clicking opens its top pinned/recent Session, or a new
    // Session in the Workspace when it has none. `groupKeys` makes the native
    // sidebar reveal the owning Workspace before the Session appears. Two
    // always-visible action buttons follow the native sidebar row: a
    // shared-context-menu trigger (ellipsis) and a New Session button.
    function WorkspaceRow({ row, t, openSession, openWorkspace, startSession, openWorkspaceMenu, closeWorkspaceMenu, useWorkspaceMenuOpen, useWorkspaceAccess }) {
      // Hooks run unconditionally at the top of the component.
      const canCreate = useWorkspaceAccess(row.workspaceId, 'session/create');
      const menuOpen = useWorkspaceMenuOpen(row.workspaceId);
      const menuButtonId = `dwe-workspace-menu:${row.workspaceId}`;
      const onClick = () => {
        if (row.topSessionId !== undefined) openSession(row.topSessionId, row.groupKeys);
        else openWorkspace(row.workspaceId, row.groupKeys);
      };
      const onMenuClick = (event) => {
        event.stopPropagation();
        event.currentTarget.focus({ preventScroll: true });
        if (menuOpen) { closeWorkspaceMenu(); return; }
        const rect = event.currentTarget.getBoundingClientRect();
        openWorkspaceMenu(row.workspaceId, row.path, row.title, { x: rect.left, y: rect.bottom }, menuButtonId);
      };
      const onNewSessionClick = (event) => {
        event.stopPropagation();
        startSession(row.workspaceId, row.groupKeys);
      };
      const hasPath = typeof row.path === 'string' && row.path !== '';
      return h('li', { className: 'dwe-row dwe-row-with-actions' },
        h('button', {
          type: 'button',
          className: 'dwe-row-main',
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
        h('div', { className: 'dwe-row-actions' },
          hasPath
            ? h('button', {
                type: 'button',
                id: menuButtonId,
                className: 'dwe-row-action',
                'data-context-menu-trigger': '',
                'aria-label': t('row.workspaceMenu', { name: row.title }),
                title: t('row.workspaceMenu', { name: row.title }),
                'aria-haspopup': 'menu',
                'aria-expanded': menuOpen,
                onPointerDown: (event) => { event.stopPropagation(); },
                onClick: onMenuClick,
              }, ellipsisGlyph)
            : null,
          canCreate
            ? h('button', {
                type: 'button',
                className: 'dwe-row-action',
                'aria-label': t('row.newSession', { name: row.title }),
                title: t('row.newSession', { name: row.title }),
                onClick: onNewSessionClick,
              }, newChatGlyph)
            : null,
        ),
      );
    }

    // A Session row: title, workspace label, and a clamped content snippet when present.
    function SessionRow({ row, t, openSession }) {
      return h('li', { className: 'dwe-row' },
        h('button', {
          type: 'button',
          className: 'dwe-row-main',
          title: row.title,
          'aria-label': t('row.openSession', { title: row.title }),
          onClick: () => openSession(row.id, row.groupKeys),
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
      .dwe-group-head {
        display: flex;
        align-items: center;
        border-radius: var(--dsw-radius-sm, 4px);
      }
      .dwe-group-head:hover {
        background: var(--dsw-alias-interactive-bg-hover, transparent);
      }
      .dwe-group-header {
        flex: 1 1 auto;
        min-width: 0;
        display: flex;
        align-items: center;
        gap: 8px;
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
      .dwe-group-head-with-action .dwe-group-header {
        padding-right: 72px;
      }
      .dwe-group-actions {
        flex: none;
        display: inline-flex;
        align-items: center;
        gap: 4px;
        padding: 0 4px 0 0;
      }
      /* Native sidebar header-button geometry: 28px hit area, 16px artwork,
         label-secondary colour, subtle hover fill. The View options trigger
         shares the same geometry. */
      .dwe-group-add,
      .dwe-group-view {
        flex: none;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 28px;
        height: 28px;
        padding: 0;
        border: none;
        border-radius: var(--dsw-radius-sm, 4px);
        background: transparent;
        color: var(--dsw-alias-label-secondary, currentColor);
        cursor: pointer;
      }
      .dwe-group-add:hover,
      .dwe-group-view:hover {
        background: var(--dsw-alias-interactive-bg-hover, transparent);
        color: var(--dsw-alias-label-primary, inherit);
      }
      .dwe-group-add:disabled {
        opacity: 0.55;
        cursor: default;
      }
      .dwe-group-view-wrap {
        position: relative;
        display: inline-flex;
      }
      .dwe-view-menu {
        position: absolute;
        top: calc(100% + 4px);
        right: 0;
        z-index: 40;
        min-width: 176px;
        box-sizing: border-box;
        padding: 4px;
        border: .5px solid var(--dsw-alias-border-l3, transparent);
        border-radius: var(--dsw-radius-md, 8px);
        background: var(--dsw-alias-bg-overlay, var(--dsw-alias-bg-layer-1, transparent));
        box-shadow:
          0 0 0 .5px color-mix(in srgb, var(--dsw-static-neutral-500, #000) 4%, transparent),
          0 3px 8px color-mix(in srgb, var(--dsw-static-neutral-500, #000) 4%, transparent),
          0 0 20px color-mix(in srgb, var(--dsw-static-neutral-500, #000) 5%, transparent);
      }
      .dwe-view-menu-label {
        padding: 3px 8px;
        font: var(--dsw-font-xxs-12);
        color: var(--dsw-alias-label-secondary, currentColor);
        cursor: default;
      }
      .dwe-view-menu-item {
        display: flex;
        align-items: center;
        gap: 8px;
        box-sizing: border-box;
        width: 100%;
        height: 30px;
        padding: 4px 8px;
        border: none;
        border-radius: var(--dsw-radius-sm, 8px);
        background: transparent;
        color: var(--dsw-alias-label-primary, inherit);
        font: var(--dsw-font-s-14);
        text-align: left;
        cursor: pointer;
      }
      .dwe-view-menu-item:hover {
        background: var(--dsw-alias-interactive-bg-hover, transparent);
      }
      .dwe-view-menu-item:focus-visible {
        outline: 2px solid var(--dsw-alias-state-business-primary);
        outline-offset: -2px;
      }
      .dwe-view-menu-item-icon {
        flex: none;
        display: inline-flex;
        align-items: center;
        color: var(--dsw-alias-label-secondary, currentColor);
      }
      .dwe-view-menu-item-label {
        flex: 1 1 auto;
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .dwe-view-menu-check {
        flex: none;
        display: inline-flex;
        align-items: center;
        margin-left: auto;
        color: var(--dsw-alias-state-business-primary, currentColor);
      }
      .dwe-group-notice {
        margin: 0 4px 10px;
        color: var(--dsw-alias-state-error-primary, var(--dsw-alias-label-secondary, currentColor));
        font: var(--dsw-font-xxs-12);
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
        position: relative;
        display: flex;
        align-items: center;
        gap: 2px;
        min-width: 0;
        border-radius: var(--dsw-radius-sm, 4px);
      }
      .dwe-row:hover {
        background: var(--dsw-alias-interactive-bg-hover, transparent);
      }
      /* The glass theme glows any button whose class contains "button". Keep
         that hover halo on the whole row instead of letting it stop where the
         trailing actions begin. */
      [data-dsh-glass-float] .dwe-row:hover {
        box-shadow: 0 0 12px color-mix(in srgb, var(--dsw-alias-brand-primary-new-color, var(--dsw-alias-state-business-primary)) 20%, transparent);
      }
      .dwe-row-main {
        flex: 1 1 auto;
        min-width: 0;
        display: flex;
        align-items: flex-start;
        gap: 10px;
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
      .dwe-row-with-actions .dwe-row-main {
        padding-right: 70px;
      }
      .dwe-row-actions {
        position: absolute;
        top: 50%;
        right: 0;
        transform: translateY(-50%);
        display: inline-flex;
        align-items: center;
        gap: 2px;
        padding: 0 6px 0 2px;
        pointer-events: none;
      }
      .dwe-row-action {
        flex: none;
        pointer-events: auto;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 24px;
        height: 24px;
        padding: 0;
        border: none;
        border-radius: var(--dsw-radius-xs, 4px);
        background: transparent;
        color: var(--dsw-alias-label-tertiary, currentColor);
        cursor: pointer;
      }
      .dwe-row-action:hover {
        color: var(--dsw-alias-label-primary, inherit);
      }
      .dwe-row-glyph {
        flex: none;
        display: flex;
        align-self: center;
        align-items: center;
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
      .dwe-row-main:focus-visible {
        outline: 2px solid var(--dsw-alias-state-business-primary);
        outline-offset: 2px;
      }
      .dwe-row-action:focus-visible,
      .dwe-group-add:focus-visible,
      .dwe-group-view:focus-visible {
        outline: 2px solid var(--dsw-alias-state-business-primary);
        outline-offset: -2px;
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
      // Read/write the persisted Workspaces order through the Host's settings
      // Remote. The Config field is volatile, so a write updates in place; a
      // failed read or write leaves the page on its in-memory selection.
      const orderByPreference = {
        load: async () => {
          const result = await ctx.remote.settings.describe();
          if (!result.ok) throw new Error(result.error.message);
          return orderByFromSettings(result.value);
        },
        save: async (value) => {
          const normalized = normalizeOrderBy(value);
          if (normalized === undefined) return false;
          const described = await ctx.remote.settings.describe();
          if (!described.ok) throw new Error(described.error.message);
          const target = (described.value?.namespaces ?? []).find((entry) => entry?.ns === SETTINGS_NS);
          if (target === undefined) return false;
          const result = await ctx.remote.settings.update(SETTINGS_NS, { orderBy: normalized }, target.revision);
          if (!result.ok) throw new Error(result.error.message);
          return true;
        },
      };
      ctx.slots.inject('main', () => ctx.slots.register({
        name: 'main',
        key: PANEL_ID,
        locale: NS,
        inject: () => ({
          orderByPreference,
          searchSessions: async (query, signal) => {
            const result = await ctx.sessions.search(query, signal);
            if (!result.ok) throw new Error(result.error.message);
            return result.value; // { items: { sessionId, snippet }[], hasMore: boolean }
          },
          searchResultLimit: ctx.sessions.searchResultLimit, // 20
          openSession: (sessionId, groupKeys) => {
            expandWorkspaceGroups(ctx.slots, groupKeys);
            ctx.uiWorkspace.openSession(sessionId);
            scheduleSidebarRowReveal([`session:${sessionId}`, ...(groupKeys?.[0] ? [`workspace:${groupKeys[0]}`] : [])]);
          },
          openWorkspace: (workspaceId, groupKeys) => {
            expandWorkspaceGroups(ctx.slots, groupKeys ?? [workspaceId]);
            const before = currentMainSessionId(ctx.sessions.list.getSnapshot());
            // fire-and-forget: the service already shows a create-failure notice
            Promise.resolve(ctx.uiWorkspace.openWorkspace(workspaceId)).then(() => {
              const after = currentMainSessionId(ctx.sessions.list.getSnapshot());
              scheduleSidebarRowReveal([
                ...(after === undefined || after === before ? [] : [`session:${after}`]),
                `workspace:${workspaceId}`,
              ]);
            }).catch((reason) =>
              console.warn('workspace explorer: open workspace failed', reason));
          },
          startSession: (workspaceId, groupKeys) => {
            expandWorkspaceGroups(ctx.slots, groupKeys ?? [workspaceId]);
            const before = currentMainSessionId(ctx.sessions.list.getSnapshot());
            // Synchronous failures (e.g. a missing Workspace) propagate to the
            // caller; the reveal chain is fire-and-forget.
            ctx.uiWorkspace.startSession(workspaceId);
            Promise.resolve().then(() => {
              const after = currentMainSessionId(ctx.sessions.list.getSnapshot());
              scheduleSidebarRowReveal([
                ...(after === undefined || after === before ? [] : [`session:${after}`]),
                `workspace:${workspaceId}`,
              ]);
            }).catch(() => {});
          },
          openWorkspaceMenu: (workspaceId, path, displayTitle, point, buttonId) =>
            ctx.contextMenus.open(workspaceMenuTarget(workspaceId, path, displayTitle), point, { button: buttonId }),
          closeWorkspaceMenu: () => ctx.contextMenus.close(),
          useWorkspaceMenuOpen: (workspaceId) => {
            const target = React.useSyncExternalStore(
              ctx.contextMenus.active.subscribe,
              ctx.contextMenus.active.getSnapshot,
            );
            return target !== null && target.kind === 'workspace' && target.value.workspaceId === workspaceId;
          },
          createWorkspace: (path) => ctx.workspaces.create({ path }),
          hooks: {
            // The native directory flow the sidebar's own Add workspace button
            // uses. Re-read on slot changes so the header action appears when
            // the picker backend mounts and disappears when it unmounts.
            directoryFlow: {
              getSnapshot: () => directoryFlowEntry(ctx.slots),
              subscribe: (listener) => {
                if (typeof ctx.slots.subscribe !== 'function') return () => {};
                try {
                  return ctx.slots.subscribe('sidebar.workspaces.directoryFlow', listener);
                } catch {
                  return () => {};
                }
              },
            },
          },
        }),
      }, ExplorerPage));
    }

    return {
      inject: ['slots', 'locale', 'sessions', 'uiWorkspace', 'contextMenus', 'workspaces', 'remote', 'remote.settings'],
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
        latestSessionUpdatedAt,
        orderWorkspaces,
        normalizeOrderBy,
        orderByFromSettings,
        selectTopSessionId,
        deriveView,
        nextExpansion,
        resolveExpanded,
        owningWorkspace,
        owningParentFolder,
        groupKeysForWorkspace,
        groupKeysForSession,
        sidebarViewActions,
        expandWorkspaceGroups,
        revealSidebarRow,
        currentMainSessionId,
        workspaceMenuTarget,
        directoryFlowEntry,
        directoryFlowFace,
        locales: { en, zh },
      },
    };
  },
});
