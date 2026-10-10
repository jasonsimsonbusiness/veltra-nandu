import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

process.env.NANDU_UI_SERVER = fileURLToPath(new URL('./ui-server.cjs', import.meta.url));

process.env.NANDU_SEQUELIZE_URI ||= process.env.DATABASE_URL;
process.env.NANDU_S3_BUCKET ||= process.env.AWS_BUCKET;
process.env.API_PUBLIC_URL ||= process.env.APP_URL;
process.env.DASHBOARD_ORIGIN ||= process.env.APP_URL;

const required = [
  'NANDU_SEQUELIZE_URI', 'NANDU_S3_BUCKET', 'AWS_ENDPOINT_URL',
  'AWS_REGION', 'AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY',
  'NANDU_ROOT_USER', 'NANDU_ROOT_PASSWD',
  'NANDU_JWT_SECRET', 'API_PUBLIC_URL',
];
const missing = required.filter(name => !process.env[name]);
if (missing.length) throw new Error(`Missing configuration: ${missing.join(', ')}`);
if (!/^postgres(?:ql)?:\/\//.test(process.env.NANDU_SEQUELIZE_URI)) {
  throw new Error('Production registry requires PostgreSQL');
}
const databaseUrl = new URL(process.env.NANDU_SEQUELIZE_URI);
// Laravel's alias presents a Neon certificate. Use the verified canonical endpoint.
if (databaseUrl.hostname === 'ep-muddy-butterfly-anu3lslz.c-6.aws-us-east-1.pg.laravel.cloud') {
  databaseUrl.hostname = 'ep-muddy-butterfly-anu3lslz.c-6.us-east-1.aws.neon.tech';
}
// Keep certificate verification enabled.
if (!databaseUrl.searchParams.has('sslmode')) databaseUrl.searchParams.set('sslmode', 'verify-full');
databaseUrl.searchParams.set('connect_timeout', '10');
process.env.NANDU_SEQUELIZE_URI = databaseUrl.href;
if (process.env.NANDU_ROOT_PASSWD.length < 20 || process.env.NANDU_JWT_SECRET.length < 32) {
  throw new Error('Use a root password of at least 20 characters and a JWT secret of at least 32 characters');
}
const port = Number(process.env.PORT || 3000);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid PORT');
const require = createRequire(import.meta.url);
const { startServer } = require('./upstream/packages/service/dist/src/index.js');
try {
  await startServer(port);
} catch {
  console.error('Nandu startup failed; check database and storage configuration.');
  process.exitCode = 1;
}
