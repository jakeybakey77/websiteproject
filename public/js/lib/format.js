const usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
const day = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

export const formatCurrency = (amount) => (typeof amount === 'number' ? usd.format(amount) : 'Not provided');
export const formatDate = (iso) => day.format(new Date(iso));

// Looks up the display label for a stored option value. Falls back to the raw value.
export const labelFor = (options, value) => options.find((o) => o.value === value)?.label ?? String(value);
