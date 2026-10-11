import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import { runInContext } from 'node:vm';

const dom = new JSDOM('', { runScripts: 'outside-only' });
for (const file of ['node_modules/marked/lib/marked.umd.js', 'node_modules/dompurify/dist/purify.min.js', 'ui/readme.js']) {
  runInContext(readFileSync(new URL(file, import.meta.url), 'utf8'), dom.getInternalVMContext());
}
function render(source) {
  dom.window.document.body.innerHTML = dom.window.renderReadme(source);
  return dom.window.document.body;
}
test('README renders headings, prose, code, lists, links and tables', () => {
  const page = render('# Getting started\n\nUse **Veltra** with `npm`.\n\n- Install\n- Build\n\n```imba\ntag App\n  <h1> "Hello"\n```\n\n[Docs](https://veltrajs.dev)\n\n| Package | Version |\n| --- | --- |\n| kit | 0.1.0 |');
  assert.equal(page.querySelector('h1').textContent, 'Getting started');
  assert.equal(page.querySelector('strong').textContent, 'Veltra');
  assert.equal(page.querySelectorAll('li').length, 2);
  assert.match(page.querySelector('pre code').textContent, /<h1> "Hello"/);
  assert.equal(page.querySelector('a').href, 'https://veltrajs.dev/');
  assert.equal(page.querySelectorAll('th').length, 2);
});
test('README cannot inject executable HTML, UI controls or delegated actions', () => {
  const page = render('<script>alert(1)</script><img src=x onerror=alert(1)><svg onload=alert(1)></svg><iframe srcdoc="evil"></iframe><form id="package-panel"><input name="session"></form><a href="javascript:alert(1)" onclick="alert(1)" data-copy="evil" style="position:fixed">bad</a>\n\n[bad](javascript:alert%281%29)');
  assert.equal(page.querySelector('script,img,svg,iframe,form,input,[id],[style],[onclick],[data-copy]'), null);
  assert.equal(page.querySelector('a[href]'), null);
});
