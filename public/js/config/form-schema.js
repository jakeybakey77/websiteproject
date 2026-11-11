// The inquiry form, defined as data. The form UI, the review screen and the
// front-end validators all read from here, so a field is added or changed in one place.

const opt = (value, label) => ({ value, label });

export const INDUSTRIES = [
  opt('restaurant', 'Restaurant and food service'),
  opt('retail', 'Retail'),
  opt('construction', 'Construction and trades'),
  opt('health', 'Health and wellness services'),
  opt('auto', 'Auto repair and services'),
  opt('transportation', 'Transportation and logistics'),
  opt('professional', 'Professional services'),
  opt('beauty', 'Beauty and personal care'),
  opt('manufacturing', 'Manufacturing'),
  opt('wholesale', 'Wholesale and distribution'),
  opt('hospitality', 'Hospitality and lodging'),
  opt('other', 'Other'),
];

// TODO(legal): confirm which states the business may market and operate in.
// Restrict intake with the "service-area" rule in validation-rules.js, not by editing this list.
export const US_STATES = [
  ['AL', 'Alabama'], ['AK', 'Alaska'], ['AZ', 'Arizona'], ['AR', 'Arkansas'], ['CA', 'California'],
  ['CO', 'Colorado'], ['CT', 'Connecticut'], ['DE', 'Delaware'], ['DC', 'District of Columbia'],
  ['FL', 'Florida'], ['GA', 'Georgia'], ['HI', 'Hawaii'], ['ID', 'Idaho'], ['IL', 'Illinois'],
  ['IN', 'Indiana'], ['IA', 'Iowa'], ['KS', 'Kansas'], ['KY', 'Kentucky'], ['LA', 'Louisiana'],
  ['ME', 'Maine'], ['MD', 'Maryland'], ['MA', 'Massachusetts'], ['MI', 'Michigan'], ['MN', 'Minnesota'],
  ['MS', 'Mississippi'], ['MO', 'Missouri'], ['MT', 'Montana'], ['NE', 'Nebraska'], ['NV', 'Nevada'],
  ['NH', 'New Hampshire'], ['NJ', 'New Jersey'], ['NM', 'New Mexico'], ['NY', 'New York'],
  ['NC', 'North Carolina'], ['ND', 'North Dakota'], ['OH', 'Ohio'], ['OK', 'Oklahoma'], ['OR', 'Oregon'],
  ['PA', 'Pennsylvania'], ['RI', 'Rhode Island'], ['SC', 'South Carolina'], ['SD', 'South Dakota'],
  ['TN', 'Tennessee'], ['TX', 'Texas'], ['UT', 'Utah'], ['VT', 'Vermont'], ['VA', 'Virginia'],
  ['WA', 'Washington'], ['WV', 'West Virginia'], ['WI', 'Wisconsin'], ['WY', 'Wyoming'],
].map(([value, label]) => opt(value, label));

export const TIME_IN_BUSINESS = [
  opt('under_6m', 'Less than 6 months'),
  opt('6_12m', '6 to 12 months'),
  opt('1_2y', '1 to 2 years'),
  opt('2_5y', '2 to 5 years'),
  opt('over_5y', 'More than 5 years'),
];

export const USE_OF_FUNDS = [
  opt('working_capital', 'Day-to-day cash flow'),
  opt('inventory', 'Inventory'),
  opt('equipment', 'Equipment'),
  opt('payroll', 'Payroll'),
  opt('expansion', 'Expansion or renovation'),
  opt('marketing', 'Marketing'),
  opt('refinance', 'Paying down existing financing'),
  opt('taxes', 'Taxes'),
  opt('other', 'Something else'),
];

export const EXISTING_FINANCING = [opt('yes', 'Yes'), opt('no', 'No'), opt('unsure', 'Not sure')];

export const FINANCING_TYPES = [
  opt('term_loan', 'Term loan'),
  opt('line_of_credit', 'Line of credit'),
  opt('mca', 'Merchant cash advance or revenue-based financing'),
  opt('equipment', 'Equipment financing'),
  opt('sba', 'SBA loan'),
  opt('credit_cards', 'Business credit cards'),
  opt('other', 'Other'),
];

// Field types: select | radio | checkboxes | currency | textarea | checkbox
// `required` is the error message shown when the answer is missing.
// `showIf` hides a field (and skips its validation) until the condition is met.
export const FIELDS = {
  industry: {
    label: 'Industry',
    type: 'select',
    options: INDUSTRIES,
    required: 'Select the industry closest to your business.',
  },
  state: {
    label: 'State',
    type: 'select',
    options: US_STATES,
    hint: 'Where the business mainly operates.',
    required: 'Select the state where the business mainly operates.',
  },
  timeInBusiness: {
    label: 'Time in business',
    type: 'radio',
    options: TIME_IN_BUSINESS,
    required: 'Select how long the business has been operating.',
  },
  monthlyRevenue: {
    label: 'Approximate monthly revenue',
    type: 'currency',
    hint: 'An estimate is fine. Use a typical month.',
    required: 'Enter an approximate monthly revenue, for example 40,000.',
  },
  amountRequested: {
    label: 'Amount requested',
    type: 'currency',
    hint: 'How much funding you are looking for.',
    required: 'Enter the amount you are looking for, for example 25,000.',
  },
  useOfFunds: {
    label: 'Intended use of funds',
    type: 'select',
    options: USE_OF_FUNDS,
    required: 'Select what the funds are mainly for.',
  },
  useOfFundsDetail: {
    label: 'Anything to add about how you would use the funds? (optional)',
    reviewLabel: 'Use of funds, details',
    type: 'textarea',
    maxLength: 280,
  },
  hasExistingFinancing: {
    label: 'Does the business have any financing it is still paying back?',
    reviewLabel: 'Existing financing',
    type: 'radio',
    options: EXISTING_FINANCING,
    required: 'Select yes, no or not sure.',
  },
  existingFinancingTypes: {
    label: 'What kind? Select any that apply. (optional)',
    reviewLabel: 'Types of existing financing',
    type: 'checkboxes',
    options: FINANCING_TYPES,
    showIf: (values) => values.hasExistingFinancing === 'yes',
  },
  existingFinancingBalance: {
    label: 'Approximate total still owed (optional)',
    reviewLabel: 'Approximate total still owed',
    type: 'currency',
    showIf: (values) => values.hasExistingFinancing === 'yes',
  },
  demoAcknowledged: {
    label: 'I understand this is a demonstration. Fictional inquiry data will be stored on this demo server for workflow testing.',
    reviewLabel: 'Demo acknowledgement',
    type: 'checkbox',
    required: 'Confirm that you understand this is a demonstration.',
  },
};

export const STEPS = [
  {
    id: 'business',
    title: 'About the business',
    intro: 'Three questions about what the business does and where.',
    fields: ['industry', 'state', 'timeInBusiness'],
  },
  {
    id: 'funding',
    title: 'Revenue and request',
    intro: 'Rough figures are enough at this stage.',
    fields: ['monthlyRevenue', 'amountRequested', 'useOfFunds', 'useOfFundsDetail'],
  },
  {
    id: 'obligations',
    title: 'Existing financing',
    intro: 'Loans, advances, credit lines or anything else the business is repaying.',
    fields: ['hasExistingFinancing', 'existingFinancingTypes', 'existingFinancingBalance'],
  },
  {
    id: 'contact',
    title: 'Contact details',
    intro: 'In demo mode the form fills this in with a fictional person and business.',
    fields: ['demoAcknowledged'],
  },
];
