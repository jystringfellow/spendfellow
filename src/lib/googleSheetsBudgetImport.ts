import JSZip from 'jszip';
import { XMLParser } from 'fast-xml-parser';

const MONTH_SHEET_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'June', 'July', 'Aug', 'Sept', 'Oct', 'Nov', 'Dec'];
const DATA_START_ROW = 7;
const DATA_END_ROW = 48;

const GROUP_STYLE: Record<string, { groupName: string; groupKey: string; isIncome: boolean; color: string }> = {
  needs: { groupName: 'Needs', groupKey: 'needs', isIncome: false, color: '#c9daf8' },
  wants: { groupName: 'Wants', groupKey: 'wants', isIncome: false, color: '#fce5cd' },
  bigWants: { groupName: 'Big Wants', groupKey: 'bigWants', isIncome: false, color: '#ead1dc' },
  income: { groupName: 'Income', groupKey: 'income', isIncome: true, color: '#d9d2e9' },
  savings: { groupName: 'Savings', groupKey: 'savings', isIncome: false, color: '#fff2cc' },
};

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '',
  textNodeName: '#text',
  removeNSPrefix: true,
});

interface WorkbookSheet {
  name: string;
  sheetPath: string;
  sheetNumber: number;
}

interface ParsedWorksheet {
  cells: Map<string, string | number>;
  comments: Map<string, string>;
  mergedRanges: MergedRange[];
}

interface MergedRange {
  startColumn: number;
  endColumn: number;
  startRow: number;
  endRow: number;
}

export interface ImportPreviewSheet {
  name: string;
  month: number | null;
  importable: boolean;
  lineCount: number;
  commentedLineCount: number;
  categories: string[];
  sampleLines: Array<{
    cell: string;
    categoryName: string;
    amountCents: number;
    comment: string | null;
  }>;
}

export interface ParsedBudgetLine {
  source_sheet: string;
  source_cell: string;
  year: number;
  month: number;
  date: string;
  amount_cents: number;
  description: string;
  notes: string | null;
  raw_comment: string | null;
  categoryName: string;
  groupName: string;
  groupKey: string;
  categoryColor: string;
  isIncome: boolean;
  defaultMonthlyBudgetCents: number;
  sortOrder: number;
}

export interface ParsedBudgetCategory {
  source_sheet: string;
  year: number;
  month: number;
  categoryName: string;
  groupName: string;
  groupKey: string;
  categoryColor: string;
  isIncome: boolean;
  defaultMonthlyBudgetCents: number;
  sortOrder: number;
}

export interface ParsedBudgetWorkbook {
  sheets: ImportPreviewSheet[];
  linesBySheet: Map<string, ParsedBudgetLine[]>;
  categoriesBySheet: Map<string, ParsedBudgetCategory[]>;
}

function asArray<T>(value: T | T[] | undefined): T[] {
  if (!value) {
    return [];
  }

  return Array.isArray(value) ? value : [value];
}

function columnName(cellRef: string): string {
  return cellRef.replace(/\d+$/, '');
}

function columnNumber(column: string): number {
  return column.split('').reduce((total, character) => total * 26 + character.charCodeAt(0) - 64, 0);
}

function columnLabel(column: number): string {
  let label = '';
  let remaining = column;

  while (remaining > 0) {
    const remainder = (remaining - 1) % 26;
    label = String.fromCharCode(65 + remainder) + label;
    remaining = Math.floor((remaining - 1) / 26);
  }

  return label;
}

function rowNumber(cellRef: string): number {
  return Number(cellRef.replace(/^[A-Z]+/, ''));
}

function amountToCents(value: number): number {
  return Math.round(value * 100);
}

function parseCellRef(ref: string): { column: number; row: number } {
  return {
    column: columnNumber(columnName(ref)),
    row: rowNumber(ref),
  };
}

function parseMergedRange(ref: string): MergedRange {
  const [startRef, endRef] = ref.split(':');
  const start = parseCellRef(startRef);
  const end = parseCellRef(endRef ?? startRef);

  return {
    startColumn: start.column,
    endColumn: end.column,
    startRow: start.row,
    endRow: end.row,
  };
}

function normalizeGroupName(value: string): string | null {
  const lower = value.toLowerCase().trim();

  if (lower === 'budget' || lower === 'total') {
    return null;
  }

  if (lower.includes('big') && lower.includes('want')) {
    return 'Big Wants';
  }

  if (lower.includes('need')) {
    return 'Needs';
  }

  if (lower.includes('want')) {
    return 'Wants';
  }

  if (lower.includes('income')) {
    return 'Income';
  }

  if (lower.includes('saving')) {
    return 'Savings';
  }

  return null;
}

function getGroupStyle(groupName: string): { groupName: string; groupKey: string; isIncome: boolean; color: string } {
  const normalized = normalizeGroupName(groupName);

  if (normalized === 'Needs') {
    return GROUP_STYLE.needs;
  }

  if (normalized === 'Wants') {
    return GROUP_STYLE.wants;
  }

  if (normalized === 'Big Wants') {
    return GROUP_STYLE.bigWants;
  }

  if (normalized === 'Income') {
    return GROUP_STYLE.income;
  }

  if (normalized === 'Savings') {
    return GROUP_STYLE.savings;
  }

  return GROUP_STYLE.needs;
}

function normalizeText(value: unknown): string {
  if (value === undefined || value === null) {
    return '';
  }

  if (typeof value === 'string' || typeof value === 'number') {
    return String(value);
  }

  if (Array.isArray(value)) {
    return value.map(normalizeText).join('');
  }

  if (typeof value === 'object') {
    const objectValue = value as Record<string, unknown>;
    if (objectValue['#text'] !== undefined) {
      return normalizeText(objectValue['#text']);
    }

    return Object.values(objectValue).map(normalizeText).join('');
  }

  return '';
}

function resolveTarget(basePath: string, target: string): string {
  const baseParts = basePath.split('/').slice(0, -1);
  const targetParts = target.split('/');
  const resolved = [...baseParts];

  targetParts.forEach((part) => {
    if (!part || part === '.') {
      return;
    }

    if (part === '..') {
      resolved.pop();
      return;
    }

    resolved.push(part);
  });

  return resolved.join('/');
}

async function readXml(zip: JSZip, path: string): Promise<any> {
  const file = zip.file(path);
  if (!file) {
    throw new Error(`Missing workbook XML part: ${path}`);
  }

  return parser.parse(await file.async('string'));
}

function getRelationshipTarget(relsXml: any, relationshipId: string): string | null {
  const rels = asArray(relsXml.Relationships?.Relationship);
  const relationship = rels.find((rel) => rel.Id === relationshipId);
  return relationship?.Target ?? null;
}

async function getWorkbookSheets(zip: JSZip): Promise<WorkbookSheet[]> {
  const workbook = await readXml(zip, 'xl/workbook.xml');
  const rels = await readXml(zip, 'xl/_rels/workbook.xml.rels');

  return asArray(workbook.workbook?.sheets?.sheet).map((sheet, index) => {
    const target = getRelationshipTarget(rels, sheet['r:id'] ?? sheet.id);
    if (!target) {
      throw new Error(`Missing relationship target for sheet ${sheet.name}`);
    }

    return {
      name: String(sheet.name),
      sheetPath: resolveTarget('xl/workbook.xml', target),
      sheetNumber: index + 1,
    };
  });
}

async function getSharedStrings(zip: JSZip): Promise<string[]> {
  if (!zip.file('xl/sharedStrings.xml')) {
    return [];
  }

  const sharedStrings = await readXml(zip, 'xl/sharedStrings.xml');
  return asArray(sharedStrings.sst?.si).map((item) => normalizeText(item.t ?? item.r));
}

async function getSheetComments(zip: JSZip, sheet: WorkbookSheet): Promise<Map<string, string>> {
  const relPath = `xl/worksheets/_rels/${sheet.sheetPath.split('/').pop()}.rels`;
  const comments = new Map<string, string>();

  if (!zip.file(relPath)) {
    return comments;
  }

  const relsXml = await readXml(zip, relPath);
  const rels = asArray(relsXml.Relationships?.Relationship);
  const threadedRel = rels.find((rel) => String(rel.Type).toLowerCase().includes('threadedcomment'));
  const legacyRel = rels.find((rel) => String(rel.Type).endsWith('/comments'));
  const commentTarget = threadedRel?.Target ?? legacyRel?.Target;

  if (!commentTarget) {
    return comments;
  }

  const commentPath = resolveTarget(sheet.sheetPath, commentTarget);
  if (!zip.file(commentPath)) {
    return comments;
  }

  const commentsXml = await readXml(zip, commentPath);
  const threadedComments = asArray(commentsXml.ThreadedComments?.threadedComment);
  if (threadedComments.length > 0) {
    threadedComments.forEach((comment) => {
      const ref = comment.ref;
      const text = normalizeText(comment.text?.t ?? comment.text);
      if (ref && text.trim()) {
        comments.set(ref, [...(comments.get(ref) ? [comments.get(ref)] : []), text.trim()].filter(Boolean).join('\n'));
      }
    });
    return comments;
  }

  asArray(commentsXml.comments?.commentList?.comment).forEach((comment) => {
    const ref = comment.ref;
    const text = normalizeText(comment.text?.r ?? comment.text?.t ?? comment.text);
    if (ref && text.trim() && !text.includes('[Threaded comment]')) {
      comments.set(ref, text.trim());
    }
  });

  return comments;
}

async function parseWorksheet(zip: JSZip, sheet: WorkbookSheet, sharedStrings: string[]): Promise<ParsedWorksheet> {
  const sheetXml = await readXml(zip, sheet.sheetPath);
  const rows = asArray(sheetXml.worksheet?.sheetData?.row);
  const cells = new Map<string, string | number>();

  rows.forEach((row) => {
    asArray(row.c).forEach((cell) => {
      const ref = cell.r;
      if (!ref || cell.v === undefined) {
        return;
      }

      if (cell.t === 's') {
        cells.set(ref, sharedStrings[Number(cell.v)] ?? '');
        return;
      }

      if (cell.t === 'str' || cell.t === 'inlineStr') {
        cells.set(ref, normalizeText(cell.v ?? cell.is));
        return;
      }

      const numeric = Number(cell.v);
      cells.set(ref, Number.isFinite(numeric) ? numeric : String(cell.v));
    });
  });

  return {
    cells,
    comments: await getSheetComments(zip, sheet),
    mergedRanges: asArray(sheetXml.worksheet?.mergeCells?.mergeCell).map((mergeCell) => parseMergedRange(mergeCell.ref)),
  };
}

function getMonth(sheetName: string): number | null {
  const index = MONTH_SHEET_NAMES.findIndex((monthName) => monthName.toLowerCase() === sheetName.toLowerCase());
  return index >= 0 ? index + 1 : null;
}

function getDateFromComment(comment: string | null, year: number, fallbackMonth: number): string {
  const match = comment?.match(/\b(1[0-2]|[1-9])\/([0-3]?\d)\b/);
  const month = match ? Number(match[1]) : fallbackMonth;
  const day = match ? Number(match[2]) : 1;
  const safeMonth = month >= 1 && month <= 12 ? month : fallbackMonth;
  const daysInMonth = new Date(year, safeMonth, 0).getDate();
  const safeDay = day >= 1 && day <= daysInMonth ? day : 1;

  return `${year}-${String(safeMonth).padStart(2, '0')}-${String(safeDay).padStart(2, '0')}`;
}

function getImportedSheet(
  sheet: WorkbookSheet,
  worksheet: ParsedWorksheet,
  year: number
): { lines: ParsedBudgetLine[]; categories: ParsedBudgetCategory[] } {
  const month = getMonth(sheet.name);
  if (!month) {
    return { lines: [], categories: [] };
  }

  const lines: ParsedBudgetLine[] = [];
  const categories: ParsedBudgetCategory[] = [];
  const groupByColumn = new Map<number, string>();
  const headerMerges = worksheet.mergedRanges.filter((range) => range.startRow <= 4 && range.endRow >= 4);

  headerMerges.forEach((range) => {
    const headerRef = `${columnLabel(range.startColumn)}4`;
    const groupName = normalizeGroupName(String(worksheet.cells.get(headerRef) ?? ''));
    if (!groupName) {
      return;
    }

    for (let column = range.startColumn; column <= range.endColumn; column += 1) {
      groupByColumn.set(column, groupName);
    }
  });

  worksheet.cells.forEach((value, ref) => {
    if (rowNumber(ref) !== 4 || typeof value !== 'string') {
      return;
    }

    const groupName = normalizeGroupName(value);
    if (groupName) {
      groupByColumn.set(columnNumber(columnName(ref)), groupName);
    }
  });

  const categoryColumns = Array.from(worksheet.cells.entries())
    .filter(([ref, value]) => rowNumber(ref) === 5 && typeof value === 'string' && String(value).trim())
    .map(([ref, value]) => ({
      column: columnNumber(columnName(ref)),
      columnLabel: columnName(ref),
      categoryName: String(value).trim(),
    }))
    .filter((entry) => groupByColumn.has(entry.column));

  categoryColumns.forEach((entry, columnIndex) => {
    const groupName = groupByColumn.get(entry.column);
    if (!groupName) {
      return;
    }

    const group = getGroupStyle(groupName);
    const defaultMonthlyBudgetCents =
      typeof worksheet.cells.get(`${entry.columnLabel}6`) === 'number'
        ? amountToCents(worksheet.cells.get(`${entry.columnLabel}6`) as number)
        : 0;
    const category: ParsedBudgetCategory = {
      source_sheet: sheet.name,
      year,
      month,
      categoryName: entry.categoryName,
      groupName: group.groupName,
      groupKey: group.groupKey,
      categoryColor: group.color,
      isIncome: group.isIncome,
      defaultMonthlyBudgetCents,
      sortOrder: columnIndex * 10,
    };
    categories.push(category);

    for (let row = DATA_START_ROW; row <= DATA_END_ROW; row += 1) {
      const cell = `${entry.columnLabel}${row}`;
      const amount = worksheet.cells.get(cell);
      if (typeof amount !== 'number' || amount === 0) {
        continue;
      }

      const rawComment = worksheet.comments.get(cell)?.trim() || null;
      const description = rawComment?.split('\n').find((line) => line.trim())?.trim() ?? `${sheet.name} ${cell}`;
      lines.push({
        ...category,
        source_cell: cell,
        date: getDateFromComment(rawComment, year, month),
        amount_cents: amountToCents(amount),
        description,
        notes: rawComment,
        raw_comment: rawComment,
      });
    }
  });

  return { lines, categories };
}

export async function parseGoogleSheetsBudgetWorkbook(buffer: ArrayBuffer, year: number): Promise<ParsedBudgetWorkbook> {
  const zip = await JSZip.loadAsync(buffer);
  const sharedStrings = await getSharedStrings(zip);
  const sheets = await getWorkbookSheets(zip);
  const previewSheets: ImportPreviewSheet[] = [];
  const linesBySheet = new Map<string, ParsedBudgetLine[]>();
  const categoriesBySheet = new Map<string, ParsedBudgetCategory[]>();

  for (const sheet of sheets) {
    const worksheet = await parseWorksheet(zip, sheet, sharedStrings);
    const parsedSheet = getImportedSheet(sheet, worksheet, year);
    const { lines } = parsedSheet;
    const categories = Array.from(new Set(parsedSheet.categories.map((category) => category.categoryName)));
    const commentedLineCount = lines.filter((line) => Boolean(line.raw_comment)).length;

    linesBySheet.set(sheet.name, lines);
    categoriesBySheet.set(sheet.name, parsedSheet.categories);
    previewSheets.push({
      name: sheet.name,
      month: getMonth(sheet.name),
      importable: parsedSheet.categories.length > 0,
      lineCount: lines.length,
      commentedLineCount,
      categories,
      sampleLines: lines.slice(0, 5).map((line) => ({
        cell: line.source_cell,
        categoryName: line.categoryName,
        amountCents: line.amount_cents,
        comment: line.raw_comment,
      })),
    });
  }

  return {
    sheets: previewSheets,
    linesBySheet,
    categoriesBySheet,
  };
}
