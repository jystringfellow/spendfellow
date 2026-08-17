import assert from 'node:assert/strict';
import test from 'node:test';
import JSZip from 'jszip';
import { parseGoogleSheetsBudgetWorkbook } from '../src/lib/googleSheetsBudgetImport';

test('imports category headers even when a month has no transaction rows', async () => {
  const zip = new JSZip();
  zip.file(
    'xl/workbook.xml',
    '<?xml version="1.0" encoding="UTF-8"?>' +
      '<workbook xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
      '<sheets><sheet name="Jan" sheetId="1" r:id="rId1"/></sheets></workbook>'
  );
  zip.file(
    'xl/_rels/workbook.xml.rels',
    '<?xml version="1.0" encoding="UTF-8"?>' +
      '<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>'
  );
  zip.file(
    'xl/worksheets/sheet1.xml',
    '<?xml version="1.0" encoding="UTF-8"?>' +
      '<worksheet><sheetData>' +
      '<row r="4"><c r="C4" t="str"><v>Needs</v></c></row>' +
      '<row r="5"><c r="C5" t="str"><v>Bills</v></c></row>' +
      '<row r="6"><c r="C6"><v>125</v></c></row>' +
      '</sheetData></worksheet>'
  );

  const buffer = await zip.generateAsync({ type: 'arraybuffer' });
  const workbook = await parseGoogleSheetsBudgetWorkbook(buffer, 2026);

  assert.equal(workbook.sheets[0]?.importable, true);
  assert.equal(workbook.sheets[0]?.lineCount, 0);
  assert.deepEqual(workbook.sheets[0]?.categories, ['Bills']);
  assert.deepEqual(workbook.sheets[0]?.categoryBudgets, [
    { categoryName: 'Bills', groupName: 'Needs', amountCents: 12_500 },
  ]);
  assert.equal(workbook.categoriesBySheet.get('Jan')?.[0]?.defaultMonthlyBudgetCents, 12_500);
  assert.deepEqual(workbook.linesBySheet.get('Jan'), []);
});
