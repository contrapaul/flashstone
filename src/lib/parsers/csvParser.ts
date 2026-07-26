export interface RawRow {
  [key: string]: string;
}

/** Comma first, then the separators spreadsheets reach for in other locales. */
const DELIMITERS = [',', ';', '\t', '|'];

/** Words that mark the first row as labels rather than a card. */
const HEADER_WORDS = new Set([
  'front',
  'back',
  'question',
  'answer',
  'term',
  'definition',
  'title',
  'description',
  'prompt',
  'name',
  'text',
  'q',
  'a'
]);

/**
 * Splits a whole CSV document into rows of cells.
 *
 * Scans the text character by character rather than splitting on newlines
 * first, because a quoted field may legitimately contain one — a habit of any
 * column holding prose, which is exactly what a description column is.
 */
function parseRows(text: string, delimiter: string): string[][] {
  const body = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text; // strip BOM
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;

  for (let i = 0; i < body.length; i++) {
    const char = body[i];

    if (quoted) {
      if (char === '"') {
        if (body[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          quoted = false;
        }
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') quoted = true;
    else if (char === delimiter) {
      row.push(field);
      field = '';
    } else if (char === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else if (char !== '\r') {
      field += char;
    }
  }

  row.push(field);
  rows.push(row);
  return rows;
}

function isBlank(cells: string[]): boolean {
  return cells.every((cell) => cell.trim() === '');
}

/**
 * Picks the separator that carves the file into the most consistent columns.
 * A semicolon or tab export would otherwise land entirely in column one, and
 * the import would fail with nothing to show for it.
 */
export function detectDelimiter(text: string): string {
  let best = ',';
  let bestScore = -1;

  for (const delimiter of DELIMITERS) {
    const rows = parseRows(text, delimiter).filter((r) => !isBlank(r));
    if (rows.length === 0) continue;

    const width = rows[0].length;
    if (width < 2) continue;

    const consistent = rows.filter((r) => r.length === width).length / rows.length;
    const score = consistent * 10 + Math.min(width, 6);
    if (score > bestScore) {
      bestScore = score;
      best = delimiter;
    }
  }

  return best;
}

function uniqueHeaders(cells: string[], width: number): string[] {
  const seen = new Map<string, number>();
  const headers: string[] = [];

  for (let i = 0; i < width; i++) {
    const base = (cells[i] ?? '').trim() || `Column ${i + 1}`;
    const count = seen.get(base) ?? 0;
    seen.set(base, count + 1);
    headers.push(count === 0 ? base : `${base} (${count + 1})`);
  }

  return headers;
}

/**
 * Parses a CSV into rows keyed by column name.
 *
 * Tolerates the things real exports do: any of four delimiters, CRLF endings, a
 * byte-order mark, quoted fields spanning newlines, ragged row lengths, and
 * duplicate or missing header labels. Blank rows are dropped. A file with no
 * header row keeps every line as a card and gets synthetic "Column N" names.
 */
export function parseCSV(text: string, delimiter?: string): RawRow[] {
  const sep = delimiter ?? detectDelimiter(text);
  const rows = parseRows(text, sep).filter((cells) => !isBlank(cells));
  if (rows.length === 0) return [];

  const width = Math.max(...rows.map((r) => r.length));
  const headed =
    rows.length > 1 && rows[0].some((cell) => HEADER_WORDS.has(cell.trim().toLowerCase()));

  const headers = headed
    ? uniqueHeaders(rows[0], width)
    : Array.from({ length: width }, (_, i) => `Column ${i + 1}`);

  return (headed ? rows.slice(1) : rows).map((cells) => {
    const row: RawRow = {};
    headers.forEach((header, i) => {
      row[header] = (cells[i] ?? '').trim();
    });
    return row;
  });
}
