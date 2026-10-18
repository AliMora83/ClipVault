// Renders the clip list and tracks which row is selected.

import { el, appendHighlighted, iconButton } from './dom.js';
import { clipKind, sizeLabel } from '../shared/clip-kind.js';
import { timeAgo } from '../shared/format.js';

const MAX_RENDERED_CHARS = 2000; // the row shows two lines at most; don't build huge text nodes

export class ClipList {
  /**
   * @param {HTMLElement} root the <ul>
   * @param {object} handlers
   * @param {(index: number) => void} handlers.onChoose
   * @param {(clip: object) => void} handlers.onPin
   * @param {(clip: object) => void} handlers.onDelete
   */
  constructor(root, handlers) {
    this.root = root;
    this.handlers = handlers;
    this.clips = [];
    this.selected = 0;
    this.lastPointer = { x: -1, y: -1 };
    this.pointerArmed = false;
  }

  get current() {
    return this.clips[this.selected] ?? null;
  }

  /** Re-renders the rows. `query` highlights matches; `isMac` picks shortcut labels. */
  render(clips, { query = '', isMac = true } = {}) {
    this.clips = clips;
    this.selected = Math.max(0, Math.min(this.selected, clips.length - 1));
    this.root.replaceChildren(...clips.map((clip, i) => this.row(clip, i, query.trim(), isMac)));
    this.scrollToSelected();
  }

  select(index) {
    if (!this.clips.length) return;
    this.selected = Math.max(0, Math.min(index, this.clips.length - 1));
    [...this.root.children].forEach((row, i) => {
      row.classList.toggle('selected', i === this.selected);
      row.setAttribute('aria-selected', String(i === this.selected));
    });
    this.scrollToSelected();
  }

  move(by) {
    this.select(this.selected + by);
  }

  /** Call when the popup opens so a still cursor doesn't steal the selection. */
  resetPointer() {
    this.pointerArmed = false;
    this.selected = 0;
  }

  scrollToSelected() {
    this.root.children[this.selected]?.scrollIntoView({ block: 'nearest' });
  }

  row(clip, i, query, isMac) {
    const kind = clipKind(clip.text);
    const li = el('li', {
      cls: `item kind-${kind.type}${clip.pinned ? ' pinned' : ''}${i === this.selected ? ' selected' : ''}`,
    });
    li.setAttribute('role', 'option');
    li.setAttribute('aria-selected', String(i === this.selected));

    const shown = kind.type === 'link' ? clip.text.trim() : clip.text;
    const text = el('div', { cls: 'text' });
    appendHighlighted(text, shown.slice(0, MAX_RENDERED_CHARS), query);

    const meta = el('div', { cls: 'meta' });
    meta.append(el('span', { text: timeAgo(clip.lastUsedAt ?? clip.createdAt) }));
    meta.append(el('span', { cls: 'kind', text: kind.label || sizeLabel(clip.text) }));
    if (i < 9) meta.append(el('span', { cls: 'key', text: `${isMac ? '⌘' : 'Ctrl+'}${i + 1}` }));

    const body = el('div', { cls: 'body' });
    body.append(text, meta);

    const actions = el('div', { cls: 'actions' });
    actions.append(
      iconButton('pin', {
        cls: `pin${clip.pinned ? ' on' : ''}`,
        title: clip.pinned ? 'Unpin' : 'Pin',
        onClick: () => this.handlers.onPin(clip),
      }),
      iconButton('delete', { cls: 'del', title: 'Delete', onClick: () => this.handlers.onDelete(clip) }),
    );

    li.append(body, actions);
    li.addEventListener('mousemove', (e) => this.onPointer(e, i));
    li.addEventListener('click', () => this.handlers.onChoose(i));
    return li;
  }

  // Only real pointer movement changes the selection. Chromium also fires mousemove when the
  // popup opens under a still cursor or the list scrolls beneath it; those are ignored.
  onPointer(e, i) {
    if (e.screenX === this.lastPointer.x && e.screenY === this.lastPointer.y) return;
    this.lastPointer = { x: e.screenX, y: e.screenY };
    if (!this.pointerArmed) {
      this.pointerArmed = true;
      return;
    }
    if (i !== this.selected) this.select(i);
  }
}
