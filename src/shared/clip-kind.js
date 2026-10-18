// Classifies a clip so the UI can label it and pick a typeface.
// Shared by the main process and the renderer; keep it free of Node and DOM APIs.

const LINK = /^https?:\/\/\S+$/i;
const EMAIL = /^[\w.+-]+@[\w-]+(\.[\w-]+)+$/;
const SQL = /^\s*(SELECT|INSERT|UPDATE|DELETE|CREATE|ALTER|WITH)\s/i;
const CODE_SIGNALS = [
  /[{};]\s*$/m, // line ends with a brace or semicolon
  /=>|===|!==|::|->/, // operators rarely found in prose
  /^\s*(const|let|var|function|def|class|import|export|return|if|for|while|public|private)\b/m,
  /^\s{2,}\S/m, // indented line
  /<\/?[a-z][\w-]*[^>]*>/i, // HTML/XML tag
];

/**
 * @param {string} text
 * @returns {{ type: 'link' | 'code' | 'email' | 'text', label: string }}
 */
export function clipKind(text) {
  const t = text.trim();
  if (LINK.test(t)) {
    let host = '';
    try {
      host = new URL(t).hostname.replace(/^www\./, '');
    } catch {
      // malformed URL: still a link, just without a host label
    }
    return { type: 'link', label: host ? `Link to ${host}` : 'Link' };
  }
  if (EMAIL.test(t)) return { type: 'email', label: 'Email address' };
  if (SQL.test(t)) return { type: 'code', label: 'Code' };
  const signals = CODE_SIGNALS.filter((re) => re.test(text)).length;
  if (signals >= 2) return { type: 'code', label: 'Code' };
  return { type: 'text', label: '' };
}

/** Short size description: "3 lines", "9 words" or "12 chars". */
export function sizeLabel(text) {
  const lines = text.split('\n').length;
  if (lines > 1) return `${lines} lines`;
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  return words <= 1 ? `${text.length} chars` : `${words} words`;
}
