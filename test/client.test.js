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
  assert.deepEqual(mod.inject, ['slots', 'locale', 'sessions', 'uiWorkspace', 'contextMenus', 'workspaces']);
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

test('static source: workspace row actions and their labels are present', () => {
  assert.ok(clientSource.includes('dwe-row-actions'), 'row actions container class present');
  assert.ok(clientSource.includes('dwe-row-action'), 'row action button class present');
  assert.ok(clientSource.includes('row.workspaceMenu'), 'workspace menu label key used');
  assert.ok(clientSource.includes('row.newSession'), 'new session label key used');
  assert.ok(clientSource.includes('ellipsisGlyph'), 'ellipsis glyph defined');
  assert.ok(clientSource.includes('newChatGlyph'), 'new chat glyph defined');
  assert.ok(clientSource.includes('aria-haspopup'), 'menu button declares a popup');
  assert.ok(clientSource.includes('data-context-menu-trigger'), 'menu button is recognized by the shared menu');
  assert.ok(clientSource.includes('dwe-row-with-actions'), 'action rows use the full-width hover surface');
  assert.ok(clientSource.includes('.dwe-row-main'), 'the main row control has its own class');
  assert.ok(!clientSource.includes('dwe-row-button'), 'the main control avoids the generic glass button selector');
  assert.ok(clientSource.includes('[data-dsh-glass-float] .dwe-row:hover'), 'the glass hover halo belongs to the whole row');
});

test('static source: workspaces group header carries the native add-workspace action', () => {
  assert.ok(clientSource.includes('projectAddGlyph'), 'native plus artwork defined');
  assert.ok(clientSource.includes('M5.54492 2.06738'), 'native project-add folder path reused');
  assert.ok(clientSource.includes('dwe-group-add'), 'add button class present');
  assert.ok(clientSource.includes('dwe-group-actions'), 'header action slot present');
  assert.ok(clientSource.includes('dwe-group-head-with-action'), 'row reserves space for the action');
  assert.ok(clientSource.includes("t('group.addWorkspace')"), 'localized add-workspace label used');
  assert.ok(clientSource.includes("t('group.addWorkspaceFailed'"), 'localized failure notice used');
  assert.ok(clientSource.includes('directoryFlowEntry'), 'native directory flow entry lookup present');
  assert.ok(clientSource.includes('directoryFlowFace'), 'native directory flow component/face resolution present');
  assert.ok(clientSource.includes("'sidebar.workspaces.directoryFlow'"), 'the native sidebar flow slot is reused');
  assert.ok(clientSource.includes('createWorkspace: (path) => ctx.workspaces.create({ path })'), 'add delegates to the workspace service');
  assert.ok(clientSource.includes('startSession(workspaceId);'), 'adopting a directory opens a Session like the native action');
  assert.match(clientSource, /flow === undefined\s*\? null/, 'button and overlay are hidden without a native flow');
  assert.ok(clientSource.includes('.dwe-group-add:focus-visible'), 'add button keeps a focus ring');
  assert.ok(clientSource.includes('.dwe-group-add:disabled'), 'add button has a busy state');
});

test('static source: workspaces group header carries the View options / Order by menu', () => {
  assert.ok(clientSource.includes('viewOptionsGlyph'), 'sliders artwork defined');
  assert.ok(clientSource.includes('M2.3 5h5.85M12.05 5h1.65'), 'native sliders path reused');
  assert.ok(clientSource.includes('ViewOptionsMenu'), 'view options component present');
  assert.ok(clientSource.includes('ORDER_BY_OPTIONS'), 'order-by choices defined');
  assert.ok(clientSource.includes('data-view-options-trigger'), 'view options trigger data attribute present');
  assert.ok(clientSource.includes('dwe-group-view'), 'view options trigger class present');
  assert.ok(clientSource.includes('dwe-view-menu'), 'order-by menu class present');
  assert.ok(clientSource.includes('data-order-by'), 'menu items carry the order-by attribute');
  assert.ok(clientSource.includes("role: 'menu'"), 'menu role declared');
  assert.ok(clientSource.includes('menuitemradio'), 'radio menu items declared');
  assert.ok(clientSource.includes('aria-checked'), 'menu items declare their checked state');
  assert.ok(clientSource.includes("t('viewOptions.label')"), 'view options label used');
  assert.ok(clientSource.includes("t('orderBy.label')"), 'order-by label used');
  assert.ok(clientSource.includes("t(option.labelKey)"), 'option labels render through the translator');
  assert.ok(clientSource.includes("labelKey: 'orderBy.manual'"), 'manual option wired');
  assert.ok(clientSource.includes("labelKey: 'orderBy.updated'"), 'updated option wired');
  assert.ok(clientSource.includes('leadingAction: h(ViewOptionsMenu'), 'view options wired as the workspaces leading action');
  assert.equal(clientSource.match(/leadingAction: h\(ViewOptionsMenu/g).length, 1, 'ViewOptionsMenu appears only in the Workspaces group');
  assert.match(clientSource, /leadingAction === undefined \|\| leadingAction === null \? null : leadingAction,\s*actionButton/,
    'GroupSection renders the leading action before the trailing action');
  assert.match(clientSource, /list,\s*ws,\s*query,\s*content,\s*searchResultLimit,\s*orderBy/,
    'deriveView memo depends on orderBy');
});

test('package.json: version, bundle patch, client flags, no dependencies, scripts', () => {
  const pkg = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));
  assert.equal(pkg.version, '0.0.0');
  assert.equal(pkg.dsh.bundle.patch, './cordis.patch.yml');
  assert.equal(pkg.dsh.client.platform, 'web');
  assert.equal(pkg.dsh.client.immediately, true);
  assert.ok(pkg.dsh.client.inject.includes('@deepseek-ai/dsh-client-ui-context-menu'), 'context menu client injected');
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
  for (const key of ['group.ungrouped', 'group.addWorkspace', 'group.addWorkspaceFailed', 'row.openWorkspace', 'row.openSession', 'row.workspaceMenu', 'row.newSession', 'search.hasMore', 'session.untitled', 'viewOptions.label', 'orderBy.label', 'orderBy.manual', 'orderBy.updated']) {
    assert.ok(key in en, `en has ${key}`);
    assert.ok(key in zh, `zh has ${key}`);
  }
  assert.ok(en['row.openWorkspace'].includes('{name}'));
  assert.ok(en['row.openSession'].includes('{title}'));
  assert.ok(en['row.workspaceMenu'].includes('{name}'), 'en workspace menu label carries {name}');
  assert.ok(zh['row.workspaceMenu'].includes('{name}'), 'zh workspace menu label carries {name}');
  assert.ok(en['row.newSession'].includes('{name}'), 'en new session label carries {name}');
  assert.ok(zh['row.newSession'].includes('{name}'), 'zh new session label carries {name}');
  assert.ok(en['search.hasMore'].includes('{limit}'));
  assert.equal(en['group.count'], '{count}', 'count pill is a bare number');
  assert.equal(zh['group.count'], '{count}');
  assert.equal(en['search.placeholder'], 'Search workspaces / sessions');
  assert.equal(zh['search.placeholder'], '搜索工作区 / 会话');
  assert.equal(en['group.addWorkspace'], 'Add workspace');
  assert.equal(zh['group.addWorkspace'], '添加工作区');
  assert.ok(en['group.addWorkspaceFailed'].includes('{message}'), 'en add failure carries the reason');
  assert.ok(zh['group.addWorkspaceFailed'].includes('{message}'), 'zh add failure carries the reason');
  assert.equal(en['viewOptions.label'], 'View options');
  assert.equal(zh['viewOptions.label'], '视图选项');
  assert.equal(en['orderBy.label'], 'Order by');
  assert.equal(zh['orderBy.label'], '排序方式');
  assert.equal(en['orderBy.manual'], 'Manual');
  assert.equal(zh['orderBy.manual'], '手动排序');
  assert.equal(en['orderBy.updated'], 'Last updated');
  assert.equal(zh['orderBy.updated'], '最近更新');
});

test('__test exposes the pure helpers as functions', () => {
  for (const name of [
    'sanitizeQuery', 'deriveView', 'selectTopSessionId', 'recentSessions',
    'latestSessionUpdatedAt', 'orderWorkspaces',
    'mergeSessionResults', 'localSessionMatches', 'nextExpansion', 'resolveExpanded',
    'sessionMatchTitle', 'sessionDisplayTitle', 'owningWorkspace', 'owningParentFolder',
    'groupKeysForWorkspace', 'groupKeysForSession', 'sidebarViewActions',
    'expandWorkspaceGroups', 'revealSidebarRow', 'currentMainSessionId', 'workspaceMenuTarget',
    'directoryFlowEntry', 'directoryFlowFace',
  ]) {
    assert.equal(typeof mod.__test[name], 'function', `${name} is a function`);
  }
});

test('workspaceMenuTarget: builds the native workspace context-menu target', () => {
  const { workspaceMenuTarget } = mod.__test;
  assert.deepEqual(workspaceMenuTarget('w3', '/work/gamma', 'Gamma Workspace'), {
    kind: 'workspace',
    value: { workspaceId: 'w3', path: '/work/gamma', displayTitle: 'Gamma Workspace' },
  });
  const target = workspaceMenuTarget('w1', '/work/alpha', 'Alpha');
  assert.equal(target.kind, 'workspace');
  assert.equal(target.value.workspaceId, 'w1');
  assert.equal(target.value.path, '/work/alpha');
  assert.equal(target.value.displayTitle, 'Alpha');
});

test('directoryFlowEntry: rendering winner first, entries fallback, failures degrade to undefined', () => {
  const { directoryFlowEntry } = mod.__test;
  const entry = { component: () => null, inject: () => ({ pick: async () => null }) };
  assert.equal(directoryFlowEntry({ entriesOfSlot: () => [entry] }), entry, 'entriesOfSlot winner wins');
  assert.equal(directoryFlowEntry({ entries: () => [entry] }), entry, 'entries fallback on older slot layers');
  assert.equal(directoryFlowEntry({ entriesOfSlot: () => [] }), undefined, 'no registration');
  assert.equal(directoryFlowEntry({ entriesOfSlot: () => { throw new Error('slot layer'); } }), undefined,
    'slot lookup failures degrade to no action');
  assert.equal(directoryFlowEntry(undefined), undefined, 'absent slots');
});

test('directoryFlowFace: returns the native component with its plain injected face', () => {
  const { directoryFlowFace } = mod.__test;
  const component = () => null;
  const pick = async () => '/work/delta';
  const entry = { component, inject: () => ({ pick }) };
  const face = directoryFlowFace(entry);
  assert.equal(face.component, component);
  assert.equal(face.props.pick, pick, 'plain injected props are passed through');
  assert.equal(directoryFlowFace({ component }), undefined, 'missing injection is unusable');
  assert.equal(directoryFlowFace({ component, inject: () => undefined }), undefined, 'empty face is unusable');
  assert.equal(directoryFlowFace({ component, inject: () => ({ hooks: {} }) }), undefined,
    'render-time hook injection is not guessed');
  assert.equal(directoryFlowFace({ component, inject: () => { throw new Error('inject'); } }), undefined,
    'injection failures degrade to no action');
  assert.equal(directoryFlowFace(undefined), undefined, 'absent entry');
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

test('deriveView: orderBy re-orders workspaces only; sessions stay on recency', () => {
  const orderSummaries = {
    sa1: { id: 'sa1', title: 'Alpha session', blank: false, updatedAt: 100 },
    sb1: { id: 'sb1', title: 'Beta session', blank: false, updatedAt: 300 },
    sAr: { id: 'sAr', title: 'Archived big', blank: false, updatedAt: 999 },
    sBl: { id: 'sBl', title: 'Blank big', blank: true, updatedAt: 900 },
    sSu: { id: 'sSu', title: 'Subagent big', blank: false, origin: 'subagent', updatedAt: 800 },
    sCr: { id: 'sCr', title: 'Ceph archived', blank: false, updatedAt: 500 },
  };
  const orderList = { ids: ['sa1', 'sb1', 'sAr', 'sBl', 'sSu', 'sCr'], byId: orderSummaries };
  const orderWorkspaces = {
    items: [
      { workspaceId: 'wA', path: '/work/alpha', title: 'Alpha', sessionIds: ['sa1'], createdAt: '2026-01-01', updatedAt: '2026-01-02' },
      // B also owns archived (999), blank (900), and subagent (800) Sessions;
      // none of them may count toward the latest visible update (300).
      { workspaceId: 'wB', path: '/work/beta', title: 'Beta', sessionIds: ['sb1', 'sAr', 'sBl', 'sSu'], createdAt: '2026-01-01', updatedAt: '2026-01-02' },
      // C owns only an archived Session: no visible Sessions, trails the sort.
      { workspaceId: 'wC', path: '/work/ceph', title: 'Ceph', sessionIds: ['sCr'], createdAt: '2026-01-01', updatedAt: '2026-01-02' },
    ],
    pinnedSessionIds: [],
    archivedSessionIds: ['sAr', 'sCr'],
  };
  const base = {
    list: orderList,
    workspaces: orderWorkspaces,
    query: '',
    content: { items: [], hasMore: false },
    limit: 20,
    ungroupedLabel: 'Ungrouped',
    untitledLabel: 'Untitled',
  };

  const manual = mod.__test.deriveView({ ...base, orderBy: 'manual' });
  const updated = mod.__test.deriveView({ ...base, orderBy: 'updated' });
  assert.deepEqual(manual.workspaces.map((w) => w.workspaceId), ['wA', 'wB', 'wC'], 'manual keeps host order');
  assert.deepEqual(updated.workspaces.map((w) => w.workspaceId), ['wB', 'wA', 'wC'],
    'updated sorts newest first; archived/blank/subagent ignored; no-visible-session last');
  assert.deepEqual(manual.sessions.map((s) => s.id), ['sb1', 'sa1'], 'browse sessions follow recency');
  assert.deepEqual(updated.sessions.map((s) => s.id), manual.sessions.map((s) => s.id),
    'orderBy never touches session order');
});

test('deriveView: search filters first, then orderBy applies to the survivors', () => {
  const orderSummaries = {
    sa1: { id: 'sa1', title: 'Alpha session', blank: false, updatedAt: 100 },
    sb1: { id: 'sb1', title: 'Beta session', blank: false, updatedAt: 300 },
    sAr: { id: 'sAr', title: 'Archived big', blank: false, updatedAt: 999 },
    sBl: { id: 'sBl', title: 'Blank big', blank: true, updatedAt: 900 },
    sSu: { id: 'sSu', title: 'Subagent big', blank: false, origin: 'subagent', updatedAt: 800 },
    sCr: { id: 'sCr', title: 'Ceph archived', blank: false, updatedAt: 500 },
  };
  const orderList = { ids: ['sa1', 'sb1', 'sAr', 'sBl', 'sSu', 'sCr'], byId: orderSummaries };
  const orderWorkspaces = {
    items: [
      { workspaceId: 'wA', path: '/work/alpha', title: 'Alpha', sessionIds: ['sa1'], createdAt: '2026-01-01', updatedAt: '2026-01-02' },
      { workspaceId: 'wB', path: '/work/beta', title: 'Beta', sessionIds: ['sb1', 'sAr', 'sBl', 'sSu'], createdAt: '2026-01-01', updatedAt: '2026-01-02' },
      { workspaceId: 'wC', path: '/work/ceph', title: 'Ceph', sessionIds: ['sCr'], createdAt: '2026-01-01', updatedAt: '2026-01-02' },
    ],
    pinnedSessionIds: [],
    archivedSessionIds: ['sAr', 'sCr'],
  };
  // "a" matches Alpha (wA) and Beta (wB), never Ceph (wC).
  const base = {
    list: orderList,
    workspaces: orderWorkspaces,
    query: 'a',
    content: { items: [], hasMore: false },
    limit: 20,
    ungroupedLabel: 'Ungrouped',
    untitledLabel: 'Untitled',
  };

  const manual = mod.__test.deriveView({ ...base, orderBy: 'manual' });
  const updated = mod.__test.deriveView({ ...base, orderBy: 'updated' });
  assert.deepEqual(manual.workspaces.map((w) => w.workspaceId), ['wA', 'wB'], 'non-matching workspace filtered before ordering');
  assert.deepEqual(updated.workspaces.map((w) => w.workspaceId), ['wB', 'wA'], 'search survivors keep the updated order');
  assert.deepEqual(updated.sessions.map((s) => s.id), ['sb1', 'sa1'], 'search sessions follow local recency');
  assert.deepEqual(updated.sessions.map((s) => s.id), manual.sessions.map((s) => s.id),
    'orderBy never touches session order under search');
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

test('latestSessionUpdatedAt: max visible numeric updatedAt; invisible, missing, non-numeric skipped', () => {
  const { latestSessionUpdatedAt } = mod.__test;
  const sessions = {
    v1: { id: 'v1', title: 'one', blank: false, updatedAt: 100 },
    v2: { id: 'v2', title: 'two', blank: false, updatedAt: 300 },
    ar: { id: 'ar', title: 'archived', blank: false, updatedAt: 999 },
    bl: { id: 'bl', title: 'blank', blank: true, updatedAt: 900 },
    su: { id: 'su', title: 'subagent', blank: false, origin: 'subagent', updatedAt: 800 },
    nn: { id: 'nn', title: 'non-number', blank: false, updatedAt: 'recent' },
  };
  const list = { ids: ['v1', 'v2', 'ar', 'bl', 'su', 'nn'], byId: sessions };
  const workspace = { workspaceId: 'w', path: '/w', title: '', sessionIds: ['v1', 'v2', 'ar', 'bl', 'su', 'nn', 'ghost'] };
  assert.equal(latestSessionUpdatedAt(workspace, list, ['ar']), 300,
    'max visible numeric wins; archived/blank/subagent, missing id, non-numeric ignored');
  assert.equal(latestSessionUpdatedAt({ ...workspace, sessionIds: [] }, list, ['ar']), undefined, 'no sessions');
  assert.equal(latestSessionUpdatedAt({ ...workspace, sessionIds: ['ar', 'bl', 'su'] }, list, ['ar']), undefined,
    'only invisible sessions');
  assert.equal(latestSessionUpdatedAt({ ...workspace, sessionIds: ['ghost'] }, list, ['ar']), undefined,
    'missing ids only');
});

test('orderWorkspaces: manual/unknown keep host order, updated re-sorts, ties and no-session trail', () => {
  const { orderWorkspaces } = mod.__test;
  const sessions = {
    a1: { id: 'a1', title: 'A', blank: false, updatedAt: 100 },
    b1: { id: 'b1', title: 'B', blank: false, updatedAt: 300 },
    t1: { id: 't1', title: 'T1', blank: false, updatedAt: 50 },
    t2: { id: 't2', title: 'T2', blank: false, updatedAt: 50 },
    t3: { id: 't3', title: 'T3', blank: false, updatedAt: 200 },
  };
  const list = { ids: ['a1', 'b1', 't1', 't2', 't3'], byId: sessions };
  const a = { workspaceId: 'A', path: '/a', title: 'A', sessionIds: ['a1'] };
  const b = { workspaceId: 'B', path: '/b', title: 'B', sessionIds: ['b1'] };
  const c = { workspaceId: 'C', path: '/c', title: 'C', sessionIds: [] };
  const items = [a, b, c];
  const snapshot = [...items];

  const manual = orderWorkspaces(items, list, 'manual', []);
  assert.deepEqual(manual.map((w) => w.workspaceId), ['A', 'B', 'C'], 'manual keeps host order');
  assert.notEqual(manual, items, 'manual returns a new array');
  const unknown = orderWorkspaces(items, list, 'unknown', []);
  assert.deepEqual(unknown.map((w) => w.workspaceId), ['A', 'B', 'C'], 'unknown orderBy falls back to manual');
  assert.deepEqual(unknown, snapshot, 'unknown order equals the input order');

  const updated = orderWorkspaces(items, list, 'updated', []);
  assert.deepEqual(updated.map((w) => w.workspaceId), ['B', 'A', 'C'],
    'updated sorts newest visible session first, no-session workspace last');

  const tied = [
    { workspaceId: 'D', path: '/d', title: 'D', sessionIds: ['t1'] },
    { workspaceId: 'E', path: '/e', title: 'E', sessionIds: ['t2'] },
    { workspaceId: 'F', path: '/f', title: 'F', sessionIds: ['t3'] },
  ];
  assert.deepEqual(orderWorkspaces(tied, list, 'updated', []).map((w) => w.workspaceId), ['F', 'D', 'E'],
    'equal recency falls back to host order');

  assert.deepEqual(items, snapshot, 'input array is not mutated');
  assert.deepEqual(manual, snapshot, 'returned manual order matches the input order');
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
  const starts = [];
  const menus = [];
  const closes = [];
  const created = [];
  const flowEntry = { component: () => null, inject: () => ({ pick: async () => '/work/delta' }) };
  const slots = {
    entries: (key) => (key === 'sidebar.workspaces'
      ? [{ store: { create: () => ({ actions: { setGroupExpanded: (key, value) => expanded.push([key, value]) } }) } }]
      : key === 'sidebar.workspaces.directoryFlow'
        ? [flowEntry]
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
    workspaces: {
      create: async (input) => { created.push(input); return { workspaceId: 'w4', path: input.path }; },
    },
    uiWorkspace: {
      openSession: (sessionId) => opens.push(['session', sessionId]),
      openWorkspace: async (workspaceId) => { opens.push(['workspace', workspaceId]); },
      startSession: (workspaceId) => starts.push(workspaceId),
    },
    contextMenus: {
      active: { subscribe: () => () => {}, getSnapshot: () => null },
      open: (target, point, options) => menus.push({ target, point, options }),
      close: () => closes.push(true),
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

  // New-session face: expand the group first, then delegate to the service.
  face.startSession('w3', ['w3']);
  assert.deepEqual(expanded.slice(3), [['w3', true]], 'startSession expands the workspace group first');
  assert.deepEqual(starts, ['w3'], 'startSession delegates to uiWorkspace.startSession');
  await Promise.resolve();
  assert.equal(expanded.length, 4, 'startSession reveal adds no extra expansion');

  // Workspace menu face: opens with the native target, point, and button id.
  face.openWorkspaceMenu('w3', '/work/gamma', 'Gamma Workspace', { x: 10, y: 20 }, 'btn');
  assert.equal(menus.length, 1);
  assert.deepEqual(menus[0].target, {
    kind: 'workspace',
    value: { workspaceId: 'w3', path: '/work/gamma', displayTitle: 'Gamma Workspace' },
  });
  assert.deepEqual(menus[0].point, { x: 10, y: 20 });
  assert.deepEqual(menus[0].options, { button: 'btn' });
  face.closeWorkspaceMenu();
  assert.equal(closes.length, 1, 'closeWorkspaceMenu delegates to contextMenus.close');

  // Add-workspace face: the native directory flow entry and workspace service.
  assert.equal(face.hooks.directoryFlow.getSnapshot(), flowEntry, 'native directory flow entry is exposed');
  const unsubscribe = face.hooks.directoryFlow.subscribe(() => {});
  assert.equal(typeof unsubscribe, 'function', 'slot subscription degrades to a no-op without slot subscribe');
  await face.createWorkspace('/work/delta');
  assert.deepEqual(created, [{ path: '/work/delta' }], 'add delegates the picked directory to workspaces.create');
});
