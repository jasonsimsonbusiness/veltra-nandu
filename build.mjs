import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.dirname(fileURLToPath(import.meta.url));
const upstream = path.join(root, 'upstream');
const revision = '7d5b781ba9d3265d02db82088de133fd3231fae0';
function run(command, args, cwd = upstream) {
  const result = spawnSync(command, args, { cwd, stdio: 'inherit' });
  if (result.error || result.status !== 0) throw new Error(`${command} failed`);
}
if (!existsSync(upstream)) {
  run('git', ['clone', 'https://github.com/taskforcesh/nandu.git', upstream], root);
  run('git', ['checkout', '--detach', revision]);
}
const head = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: upstream, encoding: 'utf8' });
if (head.status !== 0 || head.stdout.trim() !== revision) throw new Error('Unexpected upstream revision');

function patch(file, before, after) {
  const target = path.join(upstream, file);
  const source = readFileSync(target, 'utf8');
  if (source.includes(after)) return;
  if (!source.includes(before)) throw new Error(`Patch no longer applies: ${file}`);
  writeFileSync(target, source.replace(before, after));
}
patch('packages/service/src/services/storage/s3.storage.ts',
  'const client = new S3({}) || new S3Client({});',
  'const client = new S3Client({ region: process.env.AWS_REGION, endpoint: process.env.AWS_ENDPOINT_URL });');
patch('packages/service/src/index.ts',
  'app.set("trust proxy", true);',
  'app.set("trust proxy", 1);');
patch('packages/service/src/index.ts',
  'headers: req.headers,\n        body: req.body,',
  '// Do not log authorization headers or package bodies.');
patch('packages/service/src/middleware/auth.ts',
  'logger.debug({ headers: req.headers, body: req.body });',
  '// Credentials must never be written to request logs.');
patch('packages/service/src/models/db.ts',
  'logger.error(error, "Unable to connect to the database");',
  'const dbError = error as any;\n    const message = String(dbError?.message || "").replace(/(postgres(?:ql)?:\\/\\/[^:]+:)[^@]+@/gi, "$1[redacted]@");\n    logger.error({ name: dbError?.name, code: dbError?.original?.code ?? dbError?.parent?.code, message }, "Unable to initialize the database");\n    throw new Error("Database initialization failed");');

patch('packages/service/src/models/db.ts',
  '  logging: (msg) => logger.debug(msg),',
  '  logging: (msg) => logger.debug(msg),\n  dialectOptions: { connectionTimeoutMillis: 10000 },\n  pool: { max: 5, min: 0, acquire: 60000 },');
patch('packages/service/src/models/db.ts',
  '    await db.authenticate();',
  `    for (let attempt = 1; ; attempt++) {
      try { await db.authenticate(); break; }
      catch (error) {
        const code = (error as any)?.original?.code ?? (error as any)?.parent?.code;
        const transient = ["ECONNRESET", "ECONNREFUSED", "ETIMEDOUT", "EAI_AGAIN", "57P03", "08006"].includes(code)
          || /timeout|timed out/i.test(String((error as any)?.message));
        if (!transient || attempt >= 5) throw error;
        logger.warn({ attempt, code }, "Retrying database connection");
        await new Promise(resolve => setTimeout(resolve, Math.min(1000 * 2 ** (attempt - 1), 8000)));
      }
    }`);

patch('packages/service/src/index.ts',
  '  const versionString = `Nandu NPM Registry v${pkg.version}`;',
  `  require(process.env.NANDU_UI_SERVER!)(app, {
    express, authToken,
    Package: require("./models/package").Package,
    Team: require("./models/team").Team,
    Op: require("sequelize").Op,
  });
  const versionString = \`Nandu NPM Registry v\${pkg.version}\`;`);

run('corepack', ['yarn', 'install', '--immutable']);
run('corepack', ['yarn', 'workspace', '@nandu/dashboard', 'build']);
run('corepack', ['yarn', 'workspace', '@nandu/service', 'build']);
