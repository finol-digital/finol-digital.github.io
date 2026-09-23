import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { fetchRepositories, repositoryLink, renderRepository } from '../scripts/build.mjs';

const publicRepo = (name, extra = {}) => ({ name, private: false, visibility: 'public', has_pages: false, ...extra });

test('pagination includes every public repository and excludes private/internal entries', async () => {
  const urls = [];
  const first = Array.from({ length: 99 }, (_, i) => publicRepo(`repo-${i}`));
  first.push(publicRepo('secret', { private: true, visibility: 'private' }));
  const result = await fetchRepositories(async url => {
    urls.push(url);
    return { ok: true, json: async () => urls.length === 1 ? first : [publicRepo('last'), publicRepo('internal', { visibility: 'internal' })] };
  });
  assert.equal(result.length, 100);
  assert.ok(result.some(repo => repo.name === 'last'));
  assert.ok(!result.some(repo => ['secret', 'internal'].includes(repo.name)));
  assert.ok(urls[1].includes('page=2'));
  assert.ok(urls.every(url => url.includes('type=public')));
});

test('failed fetch prevents replacing a working catalog with partial or empty content', async () => {
  await assert.rejects(fetchRepositories(async () => ({ ok: false, status: 403 })), /403/);
  await assert.rejects(fetchRepositories(async () => ({ ok: true, json: async () => [] })), /empty/);
});

test('Pages repositories and the explicit CGS Games shortcut use website links', () => {
  assert.equal(repositoryLink(publicRepo('cgs-games')), '/cgs-games/');
  assert.ok(renderRepository(publicRepo('cgs-games'), 0).includes('href="/cgs-games/" aria-label="Visit cgs-games website"'));
  assert.equal(repositoryLink(publicRepo('Card-Game-Simulator-XR', { homepage: 'https://example.com' })), 'https://github.com/finol-digital/Card-Game-Simulator-XR');
  assert.equal(repositoryLink(publicRepo('Card-Game-Simulator', { has_pages: true })), '/cgs/');
  assert.equal(repositoryLink(publicRepo('dominoes-tournament', { has_pages: true })), '/dominoes/');
  assert.equal(repositoryLink(publicRepo('finol-digital.github.io', { has_pages: true })), '/');
  assert.equal(repositoryLink(publicRepo('future-project', { has_pages: true })), 'https://finol-digital.github.io/future-project/');
});

test('repository descriptions cannot inject HTML', () => {
  const html = renderRepository(publicRepo('example', { description: '<script>alert("x")</script>' }), 0);
  assert.ok(!html.includes('<script>'));
  assert.ok(html.includes('&lt;script&gt;'));
});

test('shortcuts retain query strings and fragments and provide a no-script fallback', async () => {
  for (const [route, target] of [['cgs', 'https://finol-digital.github.io/Card-Game-Simulator'], ['dominoes', 'https://finol-digital.github.io/dominoes-tournament/'], ['cgs-games', 'https://cgs.games/']]) {
    const html = await readFile(new URL(`../public/${route}/index.html`, import.meta.url), 'utf8');
    let actual;
    vm.runInNewContext(html.match(/<script>(.*?)<\/script>/s)[1], {
      location: { search: '?tv=1', hash: '#test', replace: value => { actual = value; } }
    });
    assert.equal(actual, `${target}?tv=1#test`);
    assert.ok(html.includes(`http-equiv="refresh" content="0; url=${target}"`));
    assert.ok(html.includes(`href="${target}"`));
  }
});
