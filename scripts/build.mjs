import { cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const organization = 'finol-digital';

export function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[char]);
}

// Deliberately unauthenticated and public-only: never build a private repo catalog.
export async function fetchRepositories(request = fetch) {
  const repositories = [];
  for (let page = 1; ; page++) {
    const url = `https://api.github.com/orgs/${organization}/repos?type=public&per_page=100&sort=full_name&page=${page}`;
    const response = await request(url, {
      headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'finol-digital-homepage' },
      signal: AbortSignal.timeout(30000)
    });
    if (!response.ok) throw new Error(`GitHub repository lookup failed: ${response.status}`);
    const batch = await response.json();
    if (!Array.isArray(batch)) throw new Error('GitHub returned an invalid repository list');
    repositories.push(...batch.filter(repo => repo.private === false && repo.visibility === 'public'));
    if (batch.length < 100) break;
  }
  if (!repositories.length) throw new Error('Refusing to publish an empty repository directory');
  return repositories.sort((a, b) => a.name.localeCompare(b.name, 'en', { sensitivity: 'base' }));
}

export function repositoryLink(repo) {
  const name = encodeURIComponent(repo.name);
  const source = `https://github.com/${organization}/${name}`;
  if (!repo.has_pages) return source;
  if (repo.name === 'Card-Game-Simulator') return '/cgs/';
  if (repo.name === 'dominoes-tournament') return '/dominoes/';
  if (repo.name === `${organization}.github.io`) return '/';
  return `https://${organization}.github.io/${name}/`;
}

export function renderRepository(repo, index) {
  const source = `https://github.com/${organization}/${encodeURIComponent(repo.name)}`;
  const description = repo.description ? `<p>${escapeHtml(repo.description)}</p>` : '';
  const links = repo.has_pages
    ? `<a href="${repositoryLink(repo)}" aria-label="Visit ${escapeHtml(repo.name)} website">Website <span aria-hidden="true">↗</span></a><a class="source" href="${source}" aria-label="View ${escapeHtml(repo.name)} on GitHub">GitHub</a>`
    : `<a href="${source}" aria-label="View ${escapeHtml(repo.name)} on GitHub">GitHub <span aria-hidden="true">↗</span></a>`;
  return `<li class="project">
      <span class="number" aria-hidden="true">${String(index + 1).padStart(2, '0')}</span>
      <div class="project-copy"><h2><a href="${repositoryLink(repo)}">${escapeHtml(repo.name)}</a></h2>${description}</div>
      <div class="project-links">${links}</div>
    </li>`;
}

export async function build() {
  const repos = await fetchRepositories();
  const template = await readFile(resolve(root, 'template.html'), 'utf8');
  const html = template.replace('{{COUNT}}', String(repos.length))
    .replace('{{REPOSITORIES}}', repos.map(renderRepository).join('\n'));
  const output = resolve(root, '_site');
  await mkdir(output, { recursive: true });
  await cp(resolve(root, 'public'), output, { recursive: true });
  await writeFile(resolve(output, 'index.html'), html);
  console.log(`Built directory with ${repos.length} public repositories.`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await build();
}
