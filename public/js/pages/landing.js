// Carry campaign parameters (utm_source, utm_campaign) from the landing page URL
// through to the inquiry form, so each inquiry records where it came from.
for (const link of document.querySelectorAll('a[data-carry-query]')) {
  link.href += location.search;
}
