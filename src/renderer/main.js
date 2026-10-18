// Popup entry point: holds view state and wires the list, keyboard and settings together.

import { $ } from './dom.js';
import { ClipList } from './clip-list.js';
import { SettingsPanel } from './settings-panel.js';
import { resolveKey } from './keymap.js';
import { filterClips } from '../shared/format.js';

const api = window.clipvault;

const view = {
  state: { history: [], settings: {}, platform: 'darwin' },
  filter: 'all',
  query: '',
};
const isMac = () => view.state.platform === 'darwin';

const list = new ClipList($('list'), {
  onChoose: (i) => choose(i, view.state.settings.pasteAfterSelect),
  onPin: (clip) => api.pin(clip.id, !clip.pinned),
  onDelete: (clip) => api.remove(clip.id),
});

const settings = new SettingsPanel({
  api,
  getState: () => view.state,
  onClose: () => $('search').focus(),
});

// ---------- Rendering ----------

function render() {
  const { history, settings: s } = view.state;
  const clips = filterClips(history, view);

  $('count-all').textContent = history.length;
  $('count-pinned').textContent = history.filter((c) => c.pinned).length;
  $('paused-badge').hidden = !s.paused;
  $('enter-label').textContent = s.pasteAfterSelect ? 'paste' : 'copy';
  for (const k of document.querySelectorAll('.mod')) k.textContent = isMac() ? '⌘' : 'Ctrl';

  list.render(clips, { query: view.query, isMac: isMac() });
  renderEmpty(clips.length === 0);
}

function renderEmpty(isEmpty) {
  $('empty').hidden = !isEmpty;
  $('list').hidden = isEmpty;
  if (!isEmpty) return;
  const [title, sub] = view.query
    ? ['No matches', `Nothing in your history contains “${view.query.trim()}”.`]
    : view.filter === 'pinned'
      ? ['No pinned clips', `Select a clip and press ${isMac() ? '⌘P' : 'Ctrl+P'} to keep it.`]
      : ['Nothing here yet', 'Copy text in any app and it shows up here.'];
  $('empty-title').textContent = title;
  $('empty-sub').textContent = sub;
}

// ---------- Actions ----------

function choose(index, paste) {
  const clip = list.clips[index];
  if (clip) api.select(clip.id, { paste: Boolean(paste) });
}

function setFilter(filter) {
  view.filter = filter;
  list.selected = 0;
  for (const tab of document.querySelectorAll('.tab')) {
    const active = tab.dataset.filter === filter;
    tab.classList.toggle('active', active);
    tab.setAttribute('aria-selected', String(active));
  }
  render();
}

function setQuery(query) {
  view.query = query;
  $('search').value = query;
  list.selected = 0;
  render();
}

function onShown({ view: which = 'history' } = {}) {
  list.resetPointer();
  view.query = '';
  $('search').value = '';
  if (settings.isOpen) settings.close();
  setFilter('all');
  if (which === 'settings') settings.open();
  else $('search').focus();
}

// ---------- Keyboard ----------

document.addEventListener('keydown', (e) => {
  if (settings.isOpen) {
    if (e.key === 'Escape' && !settings.recording) {
      e.preventDefault();
      settings.close();
    }
    return;
  }

  const action = resolveKey(e, isMac());
  if (!action) return; // ordinary typing goes to the search box
  e.preventDefault();

  switch (action.type) {
    case 'move':
      return list.move(action.by);
    case 'jump':
      return list.select(action.to === 'first' ? 0 : list.clips.length - 1);
    case 'choose':
      return choose(list.selected, action.paste === 'default' ? view.state.settings.pasteAfterSelect : false);
    case 'pick':
      return choose(action.index, view.state.settings.pasteAfterSelect);
    case 'pin':
      return list.current && api.pin(list.current.id, !list.current.pinned);
    case 'delete':
      return list.current && api.remove(list.current.id);
    case 'settings':
      return settings.open();
    case 'switchTab':
      return setFilter(view.filter === 'all' ? 'pinned' : 'all');
    case 'escape':
      return view.query ? setQuery('') : api.hide();
  }
});

$('search').addEventListener('input', (e) => setQuery(e.target.value));
for (const tab of document.querySelectorAll('.tab')) {
  tab.addEventListener('click', () => {
    setFilter(tab.dataset.filter);
    $('search').focus();
  });
}
$('open-settings').addEventListener('click', () => settings.open());

// ---------- State from the main process ----------

api.onState((state) => {
  view.state = state;
  render();
  if (settings.isOpen) settings.fill();
});
api.onShown(onShown);
api.getState().then((state) => {
  view.state = state;
  render();
  $('search').focus();
});

// Keep "2 min ago" labels fresh while the popup is open.
setInterval(() => {
  if (document.visibilityState === 'visible' && !settings.isOpen) render();
}, 30_000);
