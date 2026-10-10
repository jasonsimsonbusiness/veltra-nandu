# Veltra registry on Laravel Cloud

Status: deployed successfully on Laravel Cloud. PostgreSQL and object-storage
health checks pass. Authenticated npm publish and a fresh install of a 5 MiB
package passed. The `veltrajs` organization and `maintainers` team are registered.

Registry: https://veltra-nandu-production-qsfhr9.laravel.cloud

The Laravel database alias presented a certificate for Neon's canonical hostname.
The launcher maps this deployment's alias to its verified Neon endpoint, keeps
full TLS verification, and sets a 10-second connection timeout. Startup retries
transient connection failures up to five times; certificate and authentication
errors fail immediately.

Deployment repository: https://github.com/jasonsimsonbusiness/veltra-nandu
Cloud application: https://cloud.laravel.com/jason-simson/veltra-nandu/production

This standalone application builds Nandu from upstream commit
`7d5b781ba9d3265d02db82088de133fd3231fae0`. It does not change Veltra's
website or package-manager registry settings.

In Laravel Cloud, connect the standalone deployment repository with `/` as its
application root (or `deployments/nandu` when using the Veltra monorepo). Select Node.js 22, build command
`npm run build`, start command `npm start`, port 3000, and health-check path
`/-/ping`. The build needs Git and Corepack (Yarn 4.9.1 from upstream).

Attach PostgreSQL and an S3-compatible bucket as the default disk. Configure
the variables in `.env.example` using Cloud secrets for credentials. Generate
independent random values for the initial administrator password and JWT secret.
The launcher maps Cloud's DATABASE_URL, AWS_BUCKET and APP_URL to Nandu's names,
and rejects missing production configuration rather than falling back to SQLite
or default credentials. Nandu creates the administrator and runs migrations at
startup. Keep one application replica for initial deployment; concurrent startup
migrations have not been verified.

Build patches explicitly configure the storage endpoint, trust one proxy hop
(per Cloud's Node.js guide), fail startup on database initialization errors, and
remove credential-bearing request logs. Confirm the proxy topology in production.
Upstream's AGPL-3.0 license remains applicable; retain its license and provide
corresponding source, including these modifications, for a deployed service.

Before publishing Veltra: verify database health, authenticated publish and clean
install of a disposable package, storage after a restart, and actual package-size
limits. Nandu requires authentication for registry access; do not advertise
anonymous installation until it has been implemented and tested. The current
server root is a version response, not the administration dashboard.

References:
- https://laravel.com/cloud/docs/deploy-guides/nodejs
- https://github.com/taskforcesh/nandu

Run the end-to-end verification with administrator credentials loaded privately:

```sh
node --env-file=.env smoke.mjs https://veltra-nandu-production-qsfhr9.laravel.cloud
```

This registers the organization/team if needed and publishes a uniquely versioned
`@veltrajs/registry-smoke` fixture with a 5 MiB payload. The fixture remains in the
registry. It then installs into a fresh directory/cache and verifies its export.
Use a project-local `.npmrc` with `@veltrajs:registry` pointing at the registry and
an authenticated token; never commit credentials or put them in website code.
