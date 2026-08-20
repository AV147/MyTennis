// RULES.md -> Word. Parses the same markdown subset index.html renders, so the
// document and the in-app Правила section cannot drift apart.
const fs = require('fs');
const {
  Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType,
  Table, TableRow, TableCell, WidthType, ShadingType, BorderStyle,
  TableOfContents, PageBreak, LevelFormat, convertInchesToTwip,
} = require('docx');

const SRC = process.argv[2], OUT = process.argv[3];
const md = fs.readFileSync(SRC, 'utf8');

const CONTENT_W = 9000;               // A4 minus 1" margins, in DXA
const ACCENT = '1A5276', SOFT = 'E8F0F7', LINE = 'B8CFE0';

// ── inline: bold, italic, code ───────────────────────────────────────────
function runs(text, base) {
  base = base || {};
  const out = [];
  const re = /(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g;
  let last = 0, m;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) out.push(new TextRun(Object.assign({ text: text.slice(last, m.index) }, base)));
    const t = m[0];
    if (t.slice(0, 2) === '**')
      out.push(new TextRun(Object.assign({ text: t.slice(2, -2), bold: true }, base)));
    else if (t[0] === '`')
      out.push(new TextRun(Object.assign({ text: t.slice(1, -1), font: 'Consolas', size: 19 }, base)));
    else
      out.push(new TextRun(Object.assign({ text: t.slice(1, -1), italics: true }, base)));
    last = m.index + t.length;
  }
  if (last < text.length) out.push(new TextRun(Object.assign({ text: text.slice(last) }, base)));
  return out.length ? out : [new TextRun(Object.assign({ text: '' }, base))];
}

// ── table ────────────────────────────────────────────────────────────────
function buildTable(rows) {
  const cols = rows[0].length;
  // width by longest cell, so the Метки column gets the room it needs
  const weights = Array.from({ length: cols }, (_, i) =>
    Math.max(6, ...rows.map(r => (r[i] || '').replace(/\*/g, '').length)));
  const sum = weights.reduce((a, b) => a + b, 0);
  const widths = weights.map(w => Math.round(CONTENT_W * w / sum));
  widths[cols - 1] += CONTENT_W - widths.reduce((a, b) => a + b, 0);   // exact fit

  return new Table({
    columnWidths: widths,
    width: { size: CONTENT_W, type: WidthType.DXA },
    borders: {
      top:    { style: BorderStyle.SINGLE, size: 4, color: LINE },
      bottom: { style: BorderStyle.SINGLE, size: 4, color: LINE },
      left:   { style: BorderStyle.SINGLE, size: 4, color: LINE },
      right:  { style: BorderStyle.SINGLE, size: 4, color: LINE },
      insideHorizontal: { style: BorderStyle.SINGLE, size: 2, color: LINE },
      insideVertical:   { style: BorderStyle.SINGLE, size: 2, color: LINE },
    },
    rows: rows.map((cells, ri) => new TableRow({
      tableHeader: ri === 0,
      children: cells.map((c, ci) => new TableCell({
        width: { size: widths[ci], type: WidthType.DXA },
        shading: ri === 0 ? { type: ShadingType.CLEAR, fill: SOFT, color: 'auto' } : undefined,
        margins: { top: 60, bottom: 60, left: 110, right: 110 },
        children: [new Paragraph({
          spacing: { before: 0, after: 0 },
          children: runs(c, ri === 0 ? { bold: true, color: ACCENT } : {}),
        })],
      })),
    })),
  });
}

// ── parse ────────────────────────────────────────────────────────────────
const body = [];
let table = null, code = null, listIdx = 0;
function flushTable() {
  if (!table) return;
  body.push(buildTable(table));
  body.push(new Paragraph({ text: '', spacing: { after: 120 } }));
  table = null;
}

const HEAD = { 1: HeadingLevel.HEADING_1, 2: HeadingLevel.HEADING_2,
               3: HeadingLevel.HEADING_3, 4: HeadingLevel.HEADING_4 };

for (const raw of md.split(/\r?\n/)) {
  const line = raw.replace(/\s+$/, '');

  if (code !== null) {
    if (/^```/.test(line)) {
      body.push(new Paragraph({
        shading: { type: ShadingType.CLEAR, fill: 'F4F6F8', color: 'auto' },
        spacing: { before: 100, after: 160 },
        children: code.reduce((acc, l, i) => {
          if (i) acc.push(new TextRun({ break: 1 }));
          acc.push(new TextRun({ text: l, font: 'Consolas', size: 18 }));
          return acc;
        }, []),
      }));
      code = null;
    } else code.push(line);
    continue;
  }
  if (/^```/.test(line)) { flushTable(); code = []; continue; }

  if (/^\s*\|/.test(line)) {
    if (/^\s*\|[\s\-|:]+\|\s*$/.test(line)) continue;            // separator row
    const cells = line.trim().replace(/^\||\|$/g, '').split('|').map(c => c.trim());
    if (!table) table = [];
    table.push(cells);
    continue;
  }
  flushTable();

  const h = line.match(/^(#{1,4})\s+(.*)$/);
  if (h) {
    body.push(new Paragraph({
      heading: HEAD[h[1].length],
      spacing: { before: h[1].length <= 2 ? 320 : 220, after: 120 },
      children: runs(h[2]),
    }));
    continue;
  }

  if (/^---+\s*$/.test(line)) {
    body.push(new Paragraph({
      spacing: { before: 60, after: 160 },
      border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: LINE, space: 1 } },
      children: [new TextRun('')],
    }));
    continue;
  }

  const ul = line.match(/^\s*[-*]\s+(.*)$/);
  if (ul) {
    body.push(new Paragraph({ numbering: { reference: 'bul', level: 0 },
      spacing: { after: 60 }, children: runs(ul[1]) }));
    continue;
  }

  const ol = line.match(/^\s*(\d+)\.\s+(.*)$/);
  if (ol) {
    if (ol[1] === '1') listIdx++;
    body.push(new Paragraph({ numbering: { reference: 'num' + Math.min(listIdx, 9), level: 0 },
      spacing: { after: 60 }, children: runs(ol[2]) }));
    continue;
  }

  if (!line.trim()) continue;
  body.push(new Paragraph({ spacing: { after: 120 }, children: runs(line) }));
}
flushTable();

// ── assemble ─────────────────────────────────────────────────────────────
const indent = { left: convertInchesToTwip(0.32), hanging: convertInchesToTwip(0.2) };
const numbering = { config: [
  { reference: 'bul', levels: [{ level: 0, format: LevelFormat.BULLET, text: '•',
      alignment: AlignmentType.LEFT, style: { paragraph: { indent } } }] },
].concat(Array.from({ length: 9 }, (_, i) => ({
  reference: 'num' + (i + 1),
  levels: [{ level: 0, format: LevelFormat.DECIMAL, text: '%1.',
             alignment: AlignmentType.LEFT, style: { paragraph: { indent } } }],
}))) };

const doc = new Document({
  numbering,
  styles: {
    default: { document: { run: { font: 'Calibri', size: 21 },
                           paragraph: { spacing: { line: 276 } } } },
    paragraphStyles: [
      { id: 'Heading1', name: 'Heading 1', basedOn: 'Normal', next: 'Normal', quickFormat: true,
        run: { size: 34, bold: true, color: ACCENT } },
      { id: 'Heading2', name: 'Heading 2', basedOn: 'Normal', next: 'Normal', quickFormat: true,
        run: { size: 27, bold: true, color: ACCENT },
        paragraph: { border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: LINE, space: 4 } } } },
      { id: 'Heading3', name: 'Heading 3', basedOn: 'Normal', next: 'Normal', quickFormat: true,
        run: { size: 23, bold: true, color: '2E6DA4' } },
      { id: 'Heading4', name: 'Heading 4', basedOn: 'Normal', next: 'Normal', quickFormat: true,
        run: { size: 21, bold: true, color: '2E6DA4' } },
    ],
  },
  sections: [{
    properties: { page: { margin: { top: 1440, bottom: 1440, left: 1440, right: 1440 } } },
    children: [
      new Paragraph({ heading: HeadingLevel.HEADING_1, spacing: { after: 80 },
        children: [new TextRun('MyTennis — правила игры')] }),
      new Paragraph({ spacing: { after: 320 },
        children: [new TextRun({ text: 'Черновик для редактуры. Выгружено из RULES.md',
                                 italics: true, color: '6A7A8A' })] }),
      new Paragraph({ heading: HeadingLevel.HEADING_2, spacing: { after: 160 },
        children: [new TextRun('Оглавление')] }),
      new TableOfContents('Оглавление', { hyperlink: true, headingStyleRange: '1-3' }),
      new Paragraph({ children: [new PageBreak()] }),
      ...body,
    ],
  }],
});

Packer.toBuffer(doc).then(b => {
  fs.writeFileSync(OUT, b);
  console.log('готово: ' + OUT + ', ' + (b.length / 1024).toFixed(0) + ' КБ');
});
