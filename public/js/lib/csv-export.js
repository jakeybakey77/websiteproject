// CSV output for explicitly synthetic demo leads only. Never pass real customer data.
// Spreadsheet formula-leading cells are prefixed to avoid formula execution on opening.
export const DEMO_EXPORT_COLUMNS = [
  'id', 'businessName', 'industry', 'state', 'timeInBusiness',
  'monthlyRevenue', 'amountRequested', 'useOfFunds', 'hasExistingFinancing',
  'stage', 'source', 'medium', 'campaign', 'receivedAt', 'followUpReason',
  'screeningStatus', 'screeningReasonCodes', 'lastReviewNote', 'reviewedAt',
];

export function csvCell(value) {
  let text = Array.isArray(value) ? value.join('; ') : value == null ? '' : String(value);
  if (/^[\s\u0000-\u001f]*[=+@-]/.test(text)) text = "'" + text;
  return `"${text.replaceAll('"', '""')}"`;
}

export function demoLeadsToCSV(leads, columns = DEMO_EXPORT_COLUMNS) {
  if (!leads.every((lead) => lead.demo === true)) {
    throw new Error('Export restricted to fictional demo leads.');
  }
  const exportValue = (lead, column) => {
    if (column === 'screeningStatus') return lead.validation?.status || '';
    if (column === 'screeningReasonCodes') return (lead.validation?.flags ?? []).map((flag) => flag.ruleId).join('; ');
    return lead[column];
  };
  return [columns.map(csvCell).join(','), ...leads.map((lead) =>
    columns.map((column) => csvCell(exportValue(lead, column))).join(','))].join('\r\n');
}
