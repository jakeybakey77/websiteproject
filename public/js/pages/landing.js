// Preserve campaign attribution across the two public intake paths.
if (location.search) {
  for (const link of document.querySelectorAll('a[data-carry-query]')) {
    const destination = new URL(link.href);
    destination.search = location.search;
    link.href = destination.href;
  }
}

for (const menu of document.querySelectorAll('.mobile-menu')) {
  menu.addEventListener('click', (event) => {
    if (event.target.closest('a')) menu.open = false;
  });
  menu.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && menu.open) {
      menu.open = false;
      menu.querySelector('summary').focus();
    }
  });
}
