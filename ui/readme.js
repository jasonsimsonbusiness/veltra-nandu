'use strict';

// Package READMEs are untrusted input. Sanitize the parsed HTML before insertion.
function renderReadme(markdown) {
  return DOMPurify.sanitize(marked.parse(String(markdown), { gfm: true, breaks: false }), {
    ALLOWED_TAGS: ['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'br', 'hr',
      'strong', 'em', 'del', 's', 'a', 'ul', 'ol', 'li', 'pre', 'code',
      'blockquote', 'table', 'thead', 'tbody', 'tr', 'th', 'td', 'details',
      'summary', 'kbd', 'sup', 'sub'],
    ALLOWED_ATTR: ['href', 'title', 'start', 'colspan', 'rowspan'],
    ALLOW_DATA_ATTR: false,
    ALLOW_ARIA_ATTR: false,
  });
}
