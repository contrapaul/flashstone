import { describe, expect, it } from 'vitest';
import { detectDelimiter, parseCSV } from './csvParser';

describe('separators', () => {
  it('reads a plain comma file', () => {
    const rows = parseCSV('Title,Description\nMitochondria,Powerhouse of the cell');
    expect(rows).toEqual([{ Title: 'Mitochondria', Description: 'Powerhouse of the cell' }]);
  });

  it('reads semicolon files, as European spreadsheets export them', () => {
    const rows = parseCSV('Title;Description\nMitochondria;Powerhouse');
    expect(detectDelimiter('Title;Description\nMitochondria;Powerhouse')).toBe(';');
    expect(rows).toEqual([{ Title: 'Mitochondria', Description: 'Powerhouse' }]);
  });

  it('reads tab-separated files', () => {
    const rows = parseCSV('Title\tDescription\nMitochondria\tPowerhouse');
    expect(rows).toEqual([{ Title: 'Mitochondria', Description: 'Powerhouse' }]);
  });

  it('does not mistake commas inside prose for a semicolon file', () => {
    const text = 'Title;Description\nTokyo;The capital, and largest city, of Japan';
    expect(detectDelimiter(text)).toBe(';');
    expect(parseCSV(text)[0].Description).toBe('The capital, and largest city, of Japan');
  });
});

describe('quoting', () => {
  it('keeps commas inside quoted fields', () => {
    const rows = parseCSV('Title,Description\n"Tokyo","Big, busy, and coastal"');
    expect(rows[0].Description).toBe('Big, busy, and coastal');
  });

  it('keeps newlines inside quoted fields', () => {
    // A description column is exactly where a line break shows up, and it used
    // to shatter the file into bogus rows.
    const rows = parseCSV('Title,Description\n"Cell","Line one\nLine two"\n"Atom","Small"');
    expect(rows).toHaveLength(2);
    expect(rows[0].Description).toBe('Line one\nLine two');
    expect(rows[1].Title).toBe('Atom');
  });

  it('unescapes doubled quotes', () => {
    const rows = parseCSV('Title,Description\nQuote,"She said ""hello"" once"');
    expect(rows[0].Description).toBe('She said "hello" once');
  });
});

describe('real-world file quirks', () => {
  it('handles CRLF line endings', () => {
    const rows = parseCSV('Title,Description\r\nA,1\r\nB,2');
    expect(rows).toEqual([
      { Title: 'A', Description: '1' },
      { Title: 'B', Description: '2' }
    ]);
  });

  it('strips a byte-order mark', () => {
    const rows = parseCSV('﻿Title,Description\nA,1');
    expect(Object.keys(rows[0])).toEqual(['Title', 'Description']);
  });

  it('drops blank rows, including rows of only separators', () => {
    const rows = parseCSV('Title,Description\nA,1\n\n,,\n   ,  \nB,2\n');
    expect(rows.map((r) => r.Title)).toEqual(['A', 'B']);
  });

  it('pads ragged rows instead of dropping cells', () => {
    const rows = parseCSV('Title,Description,Extra\nA,1\nB,2,three');
    expect(rows[0]).toEqual({ Title: 'A', Description: '1', Extra: '' });
    expect(rows[1].Extra).toBe('three');
  });

  it('gives duplicate and blank headers usable names', () => {
    const rows = parseCSV('Title,Title,\nA,B,C');
    expect(Object.keys(rows[0])).toEqual(['Title', 'Title (2)', 'Column 3']);
  });
});

describe('files with no header row', () => {
  it('keeps every line as a card', () => {
    // Two columns of raw content and no labels: losing row one would silently
    // eat a card.
    const rows = parseCSV('Mitochondria,Powerhouse\nRibosome,Builds proteins');
    expect(rows).toHaveLength(2);
    expect(rows[0]).toEqual({ 'Column 1': 'Mitochondria', 'Column 2': 'Powerhouse' });
  });

  it('reads a single-line file', () => {
    const rows = parseCSV('Mitochondria,Powerhouse');
    expect(rows).toHaveLength(1);
    expect(rows[0]['Column 2']).toBe('Powerhouse');
  });

  it('treats a recognisable first row as labels', () => {
    const rows = parseCSV('Question,Answer\nMitochondria,Powerhouse');
    expect(rows).toHaveLength(1);
    expect(Object.keys(rows[0])).toEqual(['Question', 'Answer']);
  });
});

describe('nothing to read', () => {
  it('returns no rows for an empty file', () => {
    expect(parseCSV('')).toEqual([]);
    expect(parseCSV('\n\n  \n')).toEqual([]);
  });
});
