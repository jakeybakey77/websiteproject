// Synthetic inquiries for the dashboard. Every business, person, figure and
// campaign here is made up. Dates are generated relative to today so the
// dashboard never looks stale.

const rows = [
  // business, contact, industry, state, time in business, monthly revenue, requested, use of funds,
  // detail, existing financing, types, balance, stage, source, campaign, days ago
  ['Example Street Bakery', 'Riley Sample', 'restaurant', 'CT', '2_5y', 62000, 40000, 'equipment', 'Second deck oven', 'yes', ['term_loan'], 18000, 'in_review', 'google_search', 'working-capital-search', 1],
  ['Demo Valley Auto Repair', 'Jordan Placeholder', 'auto', 'NY', 'over_5y', 95000, 75000, 'expansion', 'Adding a third service bay', 'yes', ['equipment', 'line_of_credit'], 42000, 'ready_for_handoff', 'referral', 'accountant-referrals', 3],
  ['Sample Harbor Landscaping', 'Casey Fictional', 'construction', 'NJ', '1_2y', 28000, 15000, 'equipment', '', 'no', [], null, 'new', 'meta_ads', 'seasonal-trades', 0],
  ['Example Corner Market', 'Morgan Testcase', 'retail', 'CT', 'over_5y', 110000, 60000, 'inventory', 'Holiday stock', 'unsure', [], null, 'in_review', 'organic', '', 2],
  ['Sample Avenue Salon', 'Taylor Demo', 'beauty', 'MA', '2_5y', 34000, 20000, 'expansion', 'Two more chairs', 'no', [], null, 'handed_off', 'google_search', 'working-capital-search', 9],
  ['Demo Ridge Trucking', 'Quinn Specimen', 'transportation', 'PA', '2_5y', 180000, 120000, 'equipment', 'Used tractor', 'yes', [], null, 'needs_info', 'google_search', 'equipment-search', 2],
  ['Example Grove Dental Studio', 'Parker Mockup', 'health', 'FL', 'over_5y', 140000, 90000, 'equipment', 'Imaging upgrade', 'yes', ['equipment'], 55000, 'ready_for_handoff', 'email', 'spring-newsletter', 5],
  ['Sample Wharf Seafood', 'Reese Standin', 'restaurant', 'RI', '6_12m', 45000, 30000, 'working_capital', '', 'no', [], null, 'new', 'meta_ads', 'restaurant-owners', 0],
  ['Demo Lane Print Shop', 'Skyler Dummy', 'professional', 'OH', 'over_5y', 52000, 25000, 'other', '', 'no', [], null, 'needs_info', 'organic', '', 4],
  ['Example Mill Woodworks', 'Emerson Faux', 'manufacturing', 'NC', '2_5y', 88000, 50000, 'inventory', 'Hardwood bulk order', 'yes', ['mca'], 22000, 'in_review', 'referral', 'accountant-referrals', 3],
  ['Sample Plaza Fitness', 'Rowan Pretend', 'health', 'TX', '1_2y', 39000, 35000, 'marketing', 'New-member campaign', 'yes', ['credit_cards'], 9000, 'closed', 'meta_ads', 'fitness-studios', 14],
  ['Demo Bridge Wholesale', 'Sawyer Notreal', 'wholesale', 'IL', 'over_5y', 260000, 150000, 'inventory', '', 'yes', ['line_of_credit', 'term_loan'], 130000, 'handed_off', 'direct', '', 11],
  ['Example Orchard Inn', 'Finley Invented', 'hospitality', 'VT', 'over_5y', 71000, 45000, 'expansion', 'Roof and two guest rooms', 'unsure', [], null, 'new', 'email', 'spring-newsletter', 1],
  ['Sample Summit Roofing', 'Harper Madeup', 'construction', 'GA', '2_5y', 125000, 80000, 'payroll', 'Bridge between jobs', 'yes', ['mca', 'equipment'], 61000, 'in_review', 'google_search', 'working-capital-search', 2],
  ['Demo Garden Florist', 'Dakota Example', 'retail', 'CA', 'under_6m', 12000, 10000, 'inventory', '', 'no', [], null, 'new', 'meta_ads', 'retail-owners', 0],
  ['Example Quay Coffee Roasters', 'Blake Sampleton', 'restaurant', 'WA', '1_2y', 58000, 40000, 'equipment', 'Larger roaster', 'yes', [], null, 'needs_info', 'organic', '', 6],
  ['Sample Field Veterinary', 'Jamie Fabricated', 'health', 'CO', 'over_5y', 155000, 100000, 'refinance', 'Consolidate two balances', 'yes', ['term_loan', 'sba'], 98000, 'ready_for_handoff', 'referral', 'bookkeeper-referrals', 7],
  ['Demo Crossing Hardware', 'Alex Hypothetical', 'retail', 'MI', 'over_5y', 97000, 30000, 'taxes', '', 'no', [], null, 'closed', 'direct', '', 20],
];

// Existing sample stages are fictional snapshots, not evidence of historical transitions.
// Provide a reason for every sample already in needs_info or closed.
const SEED_REASONS = Object.freeze({
  'DEMO-1006': 'existing_financing_unclear',
  'DEMO-1009': 'funding_purpose_unclear',
  'DEMO-1011': 'other_operational',
  'DEMO-1016': 'existing_financing_unclear',
  'DEMO-1018': 'other_operational',
});

const DAY_MS = 24 * 60 * 60 * 1000;

export function sampleLeads(now = Date.now()) {
  return rows.map(
    ([businessName, contactName, industry, state, timeInBusiness, monthlyRevenue, amountRequested, useOfFunds,
      useOfFundsDetail, hasExistingFinancing, existingFinancingTypes, existingFinancingBalance, stage, source,
      campaign, daysAgo], index) => ({
      id: `DEMO-${1001 + index}`,
      demo: true,
      businessName,
      contactName,
      email: `${contactName.toLowerCase().replace(' ', '.')}@example.com`,
      phone: `(203) 555-01${String(index + 1).padStart(2, '0')}`,
      industry,
      state,
      timeInBusiness,
      monthlyRevenue,
      amountRequested,
      useOfFunds,
      useOfFundsDetail,
      hasExistingFinancing,
      existingFinancingTypes,
      existingFinancingBalance,
      stage,
      followUpReason: SEED_REASONS[`DEMO-${1001 + index}`] ?? '',
      source,
      medium: '',
      campaign,
      receivedAt: new Date(now - daysAgo * DAY_MS).toISOString(),
    }),
  );
}
