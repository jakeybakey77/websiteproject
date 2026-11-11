// Small helper for building DOM nodes without innerHTML, so text from URLs or
// stored leads is never parsed as markup.
//
// el('a', { class: 'link', href: '#top', text: 'Back to top' })
// el('ul', {}, items.map((item) => el('li', { text: item })))
export function el(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (value == null || value === false) continue;
    if (key === 'text') node.textContent = value;
    else if (key === 'class') node.className = value;
    else if (key.startsWith('on')) node.addEventListener(key.slice(2), value);
    else node.setAttribute(key, value === true ? '' : value);
  }
  node.append(...children.flat().filter((child) => child != null && child !== false));
  return node;
}
