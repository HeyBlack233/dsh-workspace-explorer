import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let definition;
globalThis.window = { __ModuleLoader__: { load(def) { definition = def; } } };
await import(pathToFileURL(path.join(root, 'client.js')).href);
const ReactStub = { createElement() { return {}; }, useState() {}, useEffect() {}, useRef() {}, useMemo() {}, Fragment: Symbol('fragment') };
const mod = definition.factory((id) => {
  if (id === 'react') return ReactStub;
  throw new Error('unexpected require: ' + id);
});

const clientSource = readFileSync(path.join(root, 'client.js'), 'utf8');

// ---------------------------------------------------------------------------
// Module wiring
// ---------------------------------------------------------------------------

test('module registers the expected inject array and apply', () => {
  assert.deepEqual(mod.inject, ['slots', 'locale', 'sessions', 'uiWorkspace']);
  assert.equal(typeof mod.apply, 'function');
  assert.ok(mod.__test, '__test export present');
});

test('static source: module id, slot ids, placeholders, imports', () => {
  assert.equal(definition.id, 'dsh-workspace-explorer');
  assert.match(clientSource, /sidebar\.panellist/);
  assert.match(clientSource, /name: ['"]main['"]/);
  assert.match(clientSource, /key: PANEL_ID/);
  assert.ok(clientSource.includes('Search workspaces / sessions'), 'en placeholder');
  assert.ok(clientSource.includes('搜索工作区 / 会话'), 'zh placeholder');
  assert.ok(!clientSource.includes('@deepseek-ai'), 'no @deepseek-ai imports');
  const requires = [...clientSource.matchAll(/require\(\s*['"]([^'"]+)['"]\s*\)/g)].map((m) => m[1]);
  assert.deepEqual(requires, ['react']);
});

test('static source: hint strings removed, hasMore and layout CSS kept', () => {
  for (const gone of [
    'Searching…',
    'No results match your search.',
    'No workspaces found.',
    'No sessions found.',
    'dwe-group-empty',
  ]) {
    assert.ok(!clientSource.includes(gone), `${gone} removed from client.js`);
  }
  assert.ok(clientSource.includes('search.hasMore'), 'search.hasMore hint kept');
  for (const kept of [
    'max-width: 960px',
    'clamp(24px, 4vw, 48px)',
    'height: 36px',
    'border-radius: 12px',
  ]) {
    assert.ok(clientSource.includes(kept), `CSS contains ${kept}`);
  }
  assert.ok(clientSource.includes('SEARCH_DEBOUNCE_MS = 250'), '250 ms debounce kept');
  assert.match(clientSource, /\.dwe-search-input:focus-visible\s*\{\s*outline:\s*none;\s*\}/, 'search input focus-visible outline disabled');
  assert.ok(clientSource.includes('.dwe-search-clear:focus-visible'), 'clear button keeps its focus-visible outline');
});

test('static source: row elements carry list keys', () => {
  assert.match(clientSource, /h\(WorkspaceRow, \{ key: row\.workspaceId,/);
  assert.match(clientSource, /h\(SessionRow, \{ key: row\.id,/);
});

test('package.json: version, bundle patch, client flags, no dependencies, scripts', () => {
  const pkg = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));
  assert.equal(pkg.version, '0.0.0');
  assert.equal(pkg.dsh.bundle.patch, './cordis.patch.yml');
  assert.equal(pkg.dsh.client.platform, 'web');
  assert.equal(pkg.dsh.client.immediately, true);
  for (const key of ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies']) {
    assert.equal(pkg[key], undefined, `no ${key}`);
  }
  assert.equal(typeof pkg.scripts, 'object');
  assert.equal(pkg.scripts.check, 'node --check index.js && node --check client.js');
  assert.equal(pkg.scripts.test, 'node --test test/*.test.js');
});

test('locale metadata files parse and carry meta', () => {
  for (const name of ['en', 'zh']) {
    const parsed = JSON.parse(readFileSync(path.join(root, 'locale', `${name}.json`), 'utf8'));
    assert.equal(typeof parsed.meta.title, 'string');
    assert.equal(typeof parsed.meta.description, 'string');
  }
});

test('cordis.patch.yml contains the plugin row id/name', () => {
  const yaml = readFileSync(path.join(root, 'cordis.patch.yml'), 'utf8');
  assert.ok(yaml.includes('dsh-workspace-explorer'), 'row id present');
});

test('en/zh dictionaries have identical keys and the required new keys', () => {
  const { en, zh } = mod.__test.locales;
  assert.deepEqual(Object.keys(en).sort(), Object.keys(zh).sort());
  for (const key of ['group.ungrouped', 'row.openWorkspace', 'row.openSession', 'search.hasMore', 'session.untitled']) {
    assert.ok(key in en, `en has ${key}`);
    assert.ok(key in zh, `zh has ${key}`);
  }
  assert.ok(en['row.openWorkspace'].includes('{name}'));
  assert.ok(en['row.openSession'].includes('{title}'));
  assert.ok(en['search.hasMore'].includes('{limit}'));
  assert.equal(en['group.count'], '{count}', 'count pill is a bare number');
  assert.equal(zh['group.count'], '{count}');
  assert.equal(en['search.placeholder'], 'Search workspaces / sessions');
  assert.equal(zh['search.placeholder'], '搜索工作区 / 会话');
});

test('__test exposes the pure helpers as functions', () => {
  for (const name of [
    'sanitizeQuery', 'deriveView', 'selectTopSessionId', 'recentSessions',
    'mergeSessionResults', 'localSessionMatches', 'nextExpansion', 'resolveExpanded',
    'sessionMatchTitle', 'sessionDisplayTitle', 'owningWorkspace', 'owningParentFolder',
    'groupKeysForWorkspace', 'groupKeysForSession', 'sidebarViewActions',
    'expandWorkspaceGroups', 'revealSidebarRow', 'currentMainSessionId',
  ]) {
    assert.equal(typeof mod.__test[name], 'function', `${name} is a function`);
  }
});

// ---------------------------------------------------------------------------
// Fake data fixture
// ---------------------------------------------------------------------------

// Matching happens on the stored durable `title` (like the shipped sidebar),
// never on displayTitle or cwd. s7 has no stored title and a cwd whose
// basename contains "alpha" — it must not match locally and must render as
// the untitled label.
const summaries = {
  s1: { id: 's1', title: 'Alpha planning', blank: false, updatedAt: 200 },
  s2: { id: 's2', title: 'Random notes', blank: false, updatedAt: 300 },
  s3: { id: 's3', title: 'Archived alpha doc', blank: false, updatedAt: 150 },
  s4: { id: 's4', title: 'Weekly sync', blank: false, updatedAt: 100 },
  s5: { id: 's5', title: 'New draft', blank: true, updatedAt: 400 },
  s6: { id: 's6', title: 'Alpha subtask', blank: false, origin: 'subagent', updatedAt: 90 },
  s7: { id: 's7', cwd: '/work/alpha', blank: false, updatedAt: 50 },
};
const list = { ids: ['s1', 's2', 's3', 's4', 's5', 's6', 's7'], byId: summaries };
const workspaces = {
  items: [
    { workspaceId: 'w1', path: '/work/alpha', title: 'Alpha Workspace', sessionIds: ['s1', 's2', 's3'], createdAt: '2026-01-01', updatedAt: '2026-01-02' },
    { workspaceId: 'w2', path: '/work/beta', title: '', sessionIds: ['s4', 's5', 's6'], createdAt: '2026-01-01', updatedAt: '2026-01-02' },
  ],
  pinnedSessionIds: ['s1'],
  archivedSessionIds: ['s3'],
};
const alphaContent = {
  items: [
    { sessionId: 's1', snippet: 'alpha snippet s1' },
    { sessionId: 's4', snippet: 'alpha snippet s4' },
    { sessionId: 's7', snippet: 'alpha snippet s7' },
  ],
  hasMore: false,
};
const weeklyContent = {
  items: [{ sessionId: 's4', snippet: 'weekly snippet s4' }],
  hasMore: false,
};

test('deriveView: query "alpha"', () => {
  const view = mod.__test.deriveView({
    list,
    workspaces,
    query: 'alpha',
    content: alphaContent,
    limit: 20,
    ungroupedLabel: 'Ungrouped',
    untitledLabel: 'Untitled',
  });
  assert.deepEqual(view.workspaces.map((w) => w.workspaceId), ['w1']);
  assert.deepEqual(view.sessions.map((s) => s.id), ['s1', 's4', 's7']);
  assert.equal(view.sessions[0].snippet, 'alpha snippet s1', 'local match gets backend snippet');
  assert.equal(view.sessions[1].snippet, 'alpha snippet s4', 'content-only match carries snippet');
  assert.equal(view.sessions[2].id, 's7');
  assert.equal(view.sessions[2].snippet, 'alpha snippet s7', 'untitled session appears via content match');
  assert.equal(view.sessions[2].title, 'Untitled', 'untitled session renders the untitled label');
  assert.ok(!view.sessions.some((s) => s.id === 's2'), 'workspace-name-only match absent');
  assert.ok(!view.sessions.some((s) => s.id === 's3' || s.id === 's6'), 'archived/subagent absent');
  assert.equal(view.hasMore, false);
});

test('deriveView: query "workspace" matches workspace names only', () => {
  const view = mod.__test.deriveView({
    list,
    workspaces,
    query: 'workspace',
    content: { items: [], hasMore: false },
    limit: 20,
    ungroupedLabel: 'Ungrouped',
    untitledLabel: 'Untitled',
  });
  assert.deepEqual(view.workspaces.map((w) => w.workspaceId), ['w1']);
  assert.deepEqual(view.sessions, []);
});

test('deriveView: query "weekly"', () => {
  const view = mod.__test.deriveView({
    list,
    workspaces,
    query: 'weekly',
    content: weeklyContent,
    limit: 20,
    ungroupedLabel: 'Ungrouped',
    untitledLabel: 'Untitled',
  });
  assert.deepEqual(view.workspaces, []);
  assert.deepEqual(view.sessions.map((s) => s.id), ['s4']);
  assert.equal(view.sessions[0].snippet, 'weekly snippet s4');
});

test('deriveView: empty query browses everything', () => {
  const view = mod.__test.deriveView({
    list,
    workspaces,
    query: '',
    content: { items: [], hasMore: false },
    limit: 20,
    ungroupedLabel: 'Ungrouped',
    untitledLabel: 'Untitled',
  });
  assert.deepEqual(view.workspaces.map((w) => w.workspaceId), ['w1', 'w2']);
  assert.deepEqual(view.sessions.map((s) => s.id), ['s2', 's1', 's4', 's7']);
  assert.equal(view.sessions[3].title, 'Untitled', 'untitled session in recent browse');
  for (const id of ['s3', 's5', 's6']) {
    assert.ok(!view.sessions.some((s) => s.id === id), `${id} excluded`);
  }
  assert.ok(!('snippet' in view.sessions[0]), 'browse rows carry no snippet');
  assert.equal(view.hasMore, false);
});

test('deriveView: workspace labels and ungrouped/cwd fallbacks', () => {
  const view = mod.__test.deriveView({
    list,
    workspaces,
    query: '',
    content: { items: [], hasMore: false },
    limit: 20,
    ungroupedLabel: 'Ungrouped',
    untitledLabel: 'Untitled',
  });
  assert.equal(view.sessions[0].workspaceLabel, 'Alpha Workspace', 'owning workspace title wins');
  assert.equal(view.sessions[2].workspaceLabel, 'beta', 'basename of cwd-less workspace path');
  assert.equal(view.sessions[3].workspaceLabel, 'alpha', 'cwd basename fallback');
  assert.deepEqual(view.workspaces[0].groupKeys, ['w1'], 'workspace row carries its group key');
  assert.deepEqual(view.sessions[0].groupKeys, ['w1'], 'owned session carries its workspace key');
  assert.deepEqual(view.sessions[3].groupKeys, [''], 'ungrouped session targets the Ungrouped group');
  const lone = { ids: ['l1', 'l2'], byId: {
    l1: { id: 'l1', title: 'Lone', blank: false, updatedAt: 2 },
    l2: { id: 'l2', title: 'Cwd', cwd: '/foo/bar', blank: false, updatedAt: 1 },
  } };
  const loneView = mod.__test.deriveView({
    list: lone,
    workspaces: { items: [], pinnedSessionIds: [], archivedSessionIds: [] },
    query: '',
    content: { items: [], hasMore: false },
    limit: 20,
    ungroupedLabel: 'Ungrouped',
  });
  assert.equal(loneView.sessions[0].workspaceLabel, 'Ungrouped', 'no workspace, no cwd');
  assert.equal(loneView.sessions[1].workspaceLabel, 'bar', 'cwd basename fallback');
});

test('deriveView: hasMore propagates from content and local overflow', () => {
  const more = mod.__test.deriveView({
    list,
    workspaces,
    query: 'alpha',
    content: { items: [{ sessionId: 's4', snippet: 'x' }], hasMore: true },
    limit: 20,
    ungroupedLabel: 'Ungrouped',
    untitledLabel: 'Untitled',
  });
  assert.equal(more.hasMore, true);
  assert.deepEqual(more.sessions.map((s) => s.id), ['s1', 's4']);
  const capped = mod.__test.deriveView({
    list,
    workspaces,
    query: 'alpha',
    content: { items: [], hasMore: false },
    limit: 1,
    ungroupedLabel: 'Ungrouped',
    untitledLabel: 'Untitled',
  });
  assert.deepEqual(capped.sessions.map((s) => s.id), ['s1']);
});

test('deriveView: 25 local title matches overflow the 20-result cap and report hasMore', () => {
  const manyIds = Array.from({ length: 25 }, (_, i) => `m${String(i).padStart(2, '0')}`);
  const manyBy = Object.fromEntries(manyIds.map((id, i) => [id, { id, title: `task ${i}`, blank: false, updatedAt: 1000 - i }]));
  const manyList = { ids: manyIds, byId: manyBy };
  const view = mod.__test.deriveView({
    list: manyList,
    workspaces: { items: [], pinnedSessionIds: [], archivedSessionIds: [] },
    query: 'task',
    content: { items: [], hasMore: false },
    limit: 20,
    ungroupedLabel: 'Ungrouped',
  });
  assert.equal(view.sessions.length, 20);
  assert.equal(view.hasMore, true, 'local overflow beyond limit still reports hasMore');
});

// ---------------------------------------------------------------------------
// Helper-level tests
// ---------------------------------------------------------------------------

test('sanitizeQuery strips NUL, caps at 500 code units, preserves surrogate pairs', () => {
  const { sanitizeQuery } = mod.__test;
  assert.equal(sanitizeQuery('ab\0cd'), 'abcd');
  assert.equal(sanitizeQuery('\0\0'), '');
  assert.equal(sanitizeQuery('a'.repeat(500)).length, 500);
  assert.equal(sanitizeQuery('a'.repeat(501)).length, 500);
  assert.equal(sanitizeQuery('😀'.repeat(250)).length, 500);
  assert.equal(sanitizeQuery('a' + '😀'.repeat(250)), 'a' + '😀'.repeat(249), 'cut never splits a pair');
});

test('basename handles both separators and trailing separators', () => {
  const { basename } = mod.__test;
  assert.equal(basename('/home/user/project'), 'project');
  assert.equal(basename('/home/user/project/'), 'project');
  assert.equal(basename('C:\\Users\\me\\project'), 'project');
  assert.equal(basename('C:\\Users\\me\\project\\'), 'project');
  assert.equal(basename('project'), 'project');
  assert.equal(basename(''), '');
  assert.equal(basename('/'), '');
});

test('sessionMatchTitle / sessionDisplayTitle: stored title only, untitled label fallback', () => {
  const { sessionMatchTitle, sessionDisplayTitle } = mod.__test;
  assert.equal(sessionMatchTitle(summaries.s1), 'Alpha planning');
  assert.equal(sessionMatchTitle(summaries.s7), '', 'no stored title');
  assert.equal(sessionMatchTitle({ id: 'x', title: '  padded  ', blank: false, updatedAt: 1 }), 'padded');
  assert.equal(sessionDisplayTitle(summaries.s1, 'Untitled'), 'Alpha planning');
  assert.equal(sessionDisplayTitle(summaries.s7, 'Untitled'), 'Untitled');
  assert.equal(sessionDisplayTitle(summaries.s7, '未命名'), '未命名');
});

test('selectTopSessionId: pinned first, then recency; undefined for invisible-only workspace', () => {
  const { selectTopSessionId } = mod.__test;
  const w1 = workspaces.items[0];
  assert.equal(selectTopSessionId(w1, list, ['s1'], ['s3']), 's1', 'pinned wins');
  assert.equal(selectTopSessionId(w1, list, ['s2'], ['s3']), 's2', 'most recently pinned index first');
  assert.equal(selectTopSessionId(w1, list, ['s2', 's1'], ['s3']), 's2', 'array order is pin order');
  assert.equal(selectTopSessionId(w1, list, [], ['s3']), 's2', 'recency without pins');
  const archiveOnly = { workspaceId: 'w3', path: '/x', title: '', sessionIds: ['s3'] };
  assert.equal(selectTopSessionId(archiveOnly, list, [], ['s3']), undefined, 'only archived');
  const blankOnly = { workspaceId: 'w4', path: '/y', title: '', sessionIds: ['s5'] };
  assert.equal(selectTopSessionId(blankOnly, list, [], ['s3']), undefined, 'only blank');
});

test('recentSessions: visible recency order, cap, tie-break by id', () => {
  const { recentSessions } = mod.__test;
  assert.deepEqual(recentSessions(list, ['s3'], 20).map((s) => s.id), ['s2', 's1', 's4', 's7']);
  assert.deepEqual(recentSessions(list, ['s3'], 2).map((s) => s.id), ['s2', 's1']);
  const tied = { ids: ['t1', 't2', 't3'], byId: {
    t1: { id: 't1', title: 'one', blank: false, updatedAt: 5 },
    t2: { id: 't2', title: 'two', blank: false, updatedAt: 5 },
    t3: { id: 't3', title: 'three', blank: false, updatedAt: 9 },
  } };
  assert.deepEqual(recentSessions(tied, [], 20).map((s) => s.id), ['t3', 't1', 't2'], 'id ascending on tie');
});

test('localSessionMatches: stored-title-only matching, empty title never matches', () => {
  const { localSessionMatches } = mod.__test;
  assert.deepEqual(localSessionMatches(list, 'alpha', ['s3']).map((s) => s.id), ['s1'],
    's7 has no stored title and does not match locally despite cwd basename "alpha"');
  assert.deepEqual(localSessionMatches(list, 'workspace', ['s3']), [], 'workspace names never leak in');
  assert.deepEqual(localSessionMatches(list, 'weekly', ['s3']).map((s) => s.id), ['s4']);
});

test('mergeSessionResults: dedupe, snippets, backend order, visibility filter, untitled content-only', () => {
  const { mergeSessionResults } = mod.__test;
  const both = mergeSessionResults(
    [summaries.s1, summaries.s4],
    [{ sessionId: 's1', snippet: 's1 snip' }, { sessionId: 's4', snippet: 's4 snip' }],
    list,
    ['s3'],
  );
  assert.deepEqual(both.map((s) => s.id), ['s1', 's4'], 'deduplicated, local first');
  assert.equal(both[0].snippet, 's1 snip');
  assert.equal(both[1].snippet, 's4 snip');
  const backendOrder = mergeSessionResults([], [{ sessionId: 's4', snippet: 'a' }, { sessionId: 's2', snippet: 'b' }], list, ['s3']);
  assert.deepEqual(backendOrder.map((s) => s.id), ['s4', 's2']);
  const filtered = mergeSessionResults(
    [],
    [
      { sessionId: 's3', snippet: 'archived' },
      { sessionId: 's5', snippet: 'blank' },
      { sessionId: 's6', snippet: 'subagent' },
      { sessionId: 'nope', snippet: 'missing' },
    ],
    list,
    ['s3'],
  );
  assert.deepEqual(filtered, []);
  const untitled = mergeSessionResults([], [{ sessionId: 's7', snippet: 's7 snip' }], list, ['s3']);
  assert.deepEqual(untitled.map((s) => s.id), ['s7']);
  assert.equal(untitled[0].snippet, 's7 snip');
});

test('nextExpansion: partial overrides only, other group follows auto', () => {
  const { nextExpansion } = mod.__test;
  const auto = { workspaces: true, sessions: true };
  const one = nextExpansion({}, 'q', 'workspaces', auto);
  assert.deepEqual(one, { q: { workspaces: false } });
  assert.ok(!('sessions' in one.q), 'sessions not frozen while toggling workspaces');
  const two = nextExpansion(one, 'q', 'sessions', auto);
  assert.deepEqual(two, { q: { workspaces: false, sessions: false } });
  const autoFalse = { workspaces: false, sessions: false };
  const three = nextExpansion({}, 'q', 'sessions', autoFalse);
  assert.deepEqual(three, { q: { sessions: true } }, 'absent key with auto false toggles to true');
});

test('resolveExpanded: explicit toggles win, absent keys follow auto', () => {
  const { resolveExpanded } = mod.__test;
  const auto = { workspaces: true, sessions: true };
  assert.deepEqual(resolveExpanded({ q: { workspaces: false } }, 'q', auto),
    { workspaces: false, sessions: true }, 'un-toggled group keeps auto true');
  assert.deepEqual(resolveExpanded({}, 'q', auto), { workspaces: true, sessions: true },
    'no overrides deep-equals auto');
  assert.deepEqual(resolveExpanded({ q: { workspaces: false, sessions: false } }, 'q', auto),
    { workspaces: false, sessions: false }, 'both toggled off');
  assert.deepEqual(resolveExpanded({ other: { workspaces: false } }, 'q', auto),
    { workspaces: true, sessions: true }, 'overrides for another query do not apply');
});

// ---------------------------------------------------------------------------
// Native sidebar reveal
// ---------------------------------------------------------------------------

test('groupKeysForWorkspace: own key first, then nearest registered ancestor chain', () => {
  const nested = {
    items: [
      { workspaceId: 'w1', path: '/work/alpha', title: 'Alpha', sessionIds: [] },
      { workspaceId: 'w2', path: '/work/alpha/nested/deep', title: 'Deep', sessionIds: [] },
      { workspaceId: 'w3', path: '/work/alpha/nested', title: 'Nested', sessionIds: [] },
      { workspaceId: 'w4', path: '/work/beta', title: 'Beta', sessionIds: [] },
    ],
  };
  assert.deepEqual(mod.__test.groupKeysForWorkspace(nested.items[3], nested.items), ['w4']);
  assert.deepEqual(mod.__test.groupKeysForWorkspace(nested.items[2], nested.items), ['w3', 'w1']);
  assert.deepEqual(mod.__test.groupKeysForWorkspace(nested.items[1], nested.items), ['w2', 'w3', 'w1'],
    'longest ancestor wins and the chain walks upward');
});

test('owningParentFolder: path prefix, separators, and self exclusion', () => {
  const { owningParentFolder } = mod.__test;
  assert.equal(owningParentFolder('/a/b/c', ['/a', '/a/b']), '/a/b');
  assert.equal(owningParentFolder('/a/b', ['/a/b']), undefined, 'self is not its own parent');
  assert.equal(owningParentFolder('/a/bc', ['/a/b']), undefined, 'prefix must end at a separator');
  assert.equal(owningParentFolder('C:\\work\\repo', ['C:\\work']), 'C:\\work', 'Windows separators normalize');
  assert.equal(owningParentFolder('/dist/repo', ['/dist', '/dist/repo/src']), '/dist');
});

test('groupKeysForSession: first owning workspace, Ungrouped fallback', () => {
  const workspacesWithOverlap = {
    items: [
      { workspaceId: 'w1', path: '/work/a', title: 'A', sessionIds: ['s1'] },
      { workspaceId: 'w2', path: '/work/b', title: 'B', sessionIds: ['s1'] },
    ],
  };
  assert.deepEqual(mod.__test.groupKeysForSession({ id: 's1' }, workspacesWithOverlap.items), ['w1'],
    'first owning workspace matches native first-wins');
  assert.deepEqual(mod.__test.groupKeysForSession({ id: 's2' }, workspacesWithOverlap.items), ['']);
});

test('expandWorkspaceGroups: resolves the native browser store and writes every key', () => {
  const calls = [];
  const actions = { setGroupExpanded: (key, expanded) => calls.push([key, expanded]) };
  const slots = { entries: (key) => (key === 'sidebar.workspaces'
    ? [{ store: { create: () => ({ actions }) } }]
    : []) };
  assert.equal(mod.__test.expandWorkspaceGroups(slots, ['w2', 'w1']), true);
  assert.deepEqual(calls, [['w2', true], ['w1', true]]);
  assert.equal(mod.__test.expandWorkspaceGroups({ entries: () => [] }, ['w2']), false);
  assert.equal(mod.__test.expandWorkspaceGroups({ entries: () => { throw new Error('missing'); } }, ['w2']), false,
    'slot lookup failures degrade to no-op');
  assert.equal(mod.__test.expandWorkspaceGroups({ entries: () => [{ store: {} }] }, ['w2']), false,
    'an unrelated store does not fabricate an action');
});

test('revealSidebarRow: scrolls the first matching native row key', () => {
  const scrolled = [];
  const makeRow = (key) => ({
    getAttribute: (name) => (name === 'data-row-key' ? key : null),
    scrollIntoView: (options) => scrolled.push(options),
  });
  const doc = { querySelectorAll: () => [makeRow('workspace:w1'), makeRow('session:s2')] };
  assert.equal(mod.__test.revealSidebarRow(doc, ['session:s2']), true);
  assert.deepEqual(scrolled, [{ block: 'nearest' }]);
  assert.equal(mod.__test.revealSidebarRow(doc, ['session:nope']), false);
  assert.equal(mod.__test.revealSidebarRow({ querySelectorAll: () => { throw new Error('dom'); } }, ['session:s2']), false,
    'DOM lookup failures degrade to no-op');
});

test('currentMainSessionId: retained main-view Session only', () => {
  assert.equal(mod.__test.currentMainSessionId({
    byId: {
      a: { id: 'a', retainedBy: { mainView: 1 } },
      b: { id: 'b', retainedBy: {} },
    },
  }), 'a');
  assert.equal(mod.__test.currentMainSessionId({ byId: {} }), undefined);
  assert.equal(mod.__test.currentMainSessionId(undefined), undefined);
});

test('apply: opening from the explorer expands groups then delegates navigation', async () => {
  const registered = {};
  const expanded = [];
  const opens = [];
  const slots = {
    entries: (key) => (key === 'sidebar.workspaces'
      ? [{ store: { create: () => ({ actions: { setGroupExpanded: (key, value) => expanded.push([key, value]) } }) } }]
      : []),
    inject: (key, callback) => { callback(); return () => {}; },
    register: (options, component) => { registered[options.name] = { options, component }; return () => {}; },
  };
  const ctx = {
    effect: (callback) => callback(),
    locale: { bind: () => (key) => key, register: () => () => {} },
    slots,
    sessions: {
      search: async () => ({ ok: true, value: { items: [], hasMore: false } }),
      searchResultLimit: 20,
      list: { getSnapshot: () => ({ byId: {} }) },
    },
    uiWorkspace: {
      openSession: (sessionId) => opens.push(['session', sessionId]),
      openWorkspace: async (workspaceId) => { opens.push(['workspace', workspaceId]); },
    },
  };
  mod.apply(ctx);
  const face = registered.main.options.inject();
  face.openSession('s1', ['w2', 'w1']);
  assert.deepEqual(expanded, [['w2', true], ['w1', true]], 'all group keys expanded first');
  assert.deepEqual(opens[0], ['session', 's1']);
  await face.openWorkspace('w3', ['w3']);
  assert.deepEqual(expanded.slice(2), [['w3', true]], 'workspace open expands its own key');
  assert.deepEqual(opens[1], ['workspace', 'w3']);
});
