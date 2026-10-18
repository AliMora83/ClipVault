// Tiny DOM helpers. Clip text is always inserted as text nodes, never as HTML.

export const $ = (id) => document.getElementById(id);

/** Creates an element with optional class and text. */
export function el(tag, { cls, text } = {}) {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text !== undefined) node.textContent = text;
  return node;
}

/** Appends `text` to `node`, wrapping case-insensitive matches of `query` in <mark>. */
export function appendHighlighted(node, text, query) {
  if (!query) {
    node.textContent = text;
    return;
  }
  const lower = text.toLowerCase();
  const needle = query.toLowerCase();
  let from = 0;
  let at;
  while ((at = lower.indexOf(needle, from)) !== -1) {
    if (at > from) node.append(text.slice(from, at));
    node.append(el('mark', { text: text.slice(at, at + needle.length) }));
    from = at + needle.length;
  }
  if (from < text.length) node.append(text.slice(from));
}

const ICONS = {
  pin: 'M12 17.3 6.2 20.5l1.1-6.5L2.6 9.4l6.5-.9L12 2.6l2.9 5.9 6.5.9-4.7 4.6 1.1 6.5z',
  delete: 'M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6',
};

/** Small icon button built with DOM APIs (no innerHTML). */
export function iconButton(icon, { cls, title, onClick }) {
  const button = el('button', { cls: `act ${cls}` });
  button.type = 'button';
  button.title = title;
  button.setAttribute('aria-label', title);
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', ICONS[icon]);
  svg.append(path);
  button.append(svg);
  button.addEventListener('click', (e) => {
    e.stopPropagation();
    onClick();
  });
  return button;
}
