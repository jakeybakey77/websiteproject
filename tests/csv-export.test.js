import test from 'node:test';
import assert from 'node:assert/strict';
import { demoLeadsToCSV, csvCell } from '../public/js/lib/csv-export.js';

test('export has a header, quoted fields and CRLF rows', () => {
  const csv = demoLeadsToCSV([{ demo: true, id: 'DEMO-1', businessName: 'Example, LLC' }], ['id', 'businessName']);
  assert.equal(csv, '"id","businessName"\r\n"DEMO-1","Example, LLC"');
});
test('CSV escapes quotes and spreadsheet formulas', () => {
  assert.equal(csvCell('A "quoted" value'), '"A ""quoted"" value"');
  assert.equal(csvCell('=HYPERLINK("https://example.com")'), '"\'=HYPERLINK(""https://example.com"")"');
  assert.equal(csvCell('  +SUM(1,1)'), '"\'  +SUM(1,1)"');
});
test('CSV exporter refuses any non-demo lead', () => {
  assert.throws(() => demoLeadsToCSV([{ id: 'live-1' }]), /restricted/);
});
