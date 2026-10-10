import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';

const registry = new URL(process.argv[2]);
if (registry.protocol !== 'https:') throw new Error('HTTPS required');
const username = process.env.NANDU_ROOT_USER;
const password = process.env.NANDU_ROOT_PASSWD;
if (!username || !password) throw new Error('Administrator credentials required');
const auth = Buffer.from(`${username}:${password}`).toString('base64');
async function request(route, method = 'GET', body) {
  const response = await fetch(new URL(route, registry), {
    method,
    headers: { authorization: `Basic ${auth}`, 'content-type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(60000),
  });
  if (!response.ok) throw new Error(`${method} ${route}: HTTP ${response.status}`);
  const text = await response.text();
  return text ? JSON.parse(text) : null;
}
const health = await request('/-/ping');
if (health.checks.database.status !== 'ok' || health.checks.storage?.status !== 'ok') {
  throw new Error('Database and object storage must both pass health checks');
}
console.log('Database and object storage healthy');
const scope = 'veltrajs';
const team = 'maintainers';
const teams = await request(`/-/org/${scope}/team`);
if (!teams.includes(team)) await request(`/-/org/${scope}/team`, 'PUT', {name:team});
const members = await request(`/-/team/${scope}/${team}/user`);
if (!members.includes(username)) await request(`/-/team/${scope}/${team}/user`, 'PUT', {user:username});

const work = await mkdtemp(path.join(tmpdir(), 'veltra-registry-smoke-'));
const name = '@veltrajs/registry-smoke';
const version = `0.0.0-smoke.${Date.now()}`;
const npmrc = path.join(work, '.npmrc');
await writeFile(npmrc, `registry=${registry.href}\n//${registry.host}/:_auth=${auth}\n`, {mode:0o600});
function npm(args, cwd) {
  const result = spawnSync('npm', args, {
    cwd, stdio:'inherit', timeout:180000,
    env: {...process.env, NPM_CONFIG_USERCONFIG:npmrc, NPM_CONFIG_CACHE:path.join(work,'cache')},
  });
  if (result.status !== 0) throw new Error(`npm ${args[0]} failed`);
}
try {
  const pkg = path.join(work,'package');
  const consumer = path.join(work,'consumer');
  await mkdir(pkg);
  await mkdir(consumer);
  await writeFile(path.join(pkg,'package.json'), JSON.stringify({name,version,main:'index.js',description:'Nandu deployment verification fixture',license:'MIT'}));
  await writeFile(path.join(pkg,'index.js'), 'module.exports = "nandu-registry-ok";\n');
  // Incompressible archive exceeds Vercel's 4.5 MB request limit.
  await writeFile(path.join(pkg,'payload.bin'), randomBytes(5*1024*1024));
  npm(['publish','--registry',registry.href,'--tag','smoke','--ignore-scripts','--access','restricted'],pkg);
  await request(`/-/team/${scope}/${team}/package`, 'PUT', {package:name,permissions:'read-write'});
  await writeFile(path.join(consumer,'package.json'), '{"private":true}');
  npm(['install',`${name}@${version}`,'--registry',registry.href,'--ignore-scripts','--no-audit','--no-fund'],consumer);
  const result = spawnSync(process.execPath,['-e',`if(require('${name}')!=='nandu-registry-ok')process.exit(1)`],{cwd:consumer,stdio:'inherit'});
  if (result.status !== 0) throw new Error('Installed package failed execution check');
  console.log(`PASS: published and installed ${name}@${version} (5 MiB payload)`);
} finally {
  await rm(work,{recursive:true,force:true});
}
