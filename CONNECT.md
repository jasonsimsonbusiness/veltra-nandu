# Use the Veltra registry

Registry: https://veltra-nandu-production-qsfhr9.laravel.cloud/

This checkout's `.npmrc` routes `@veltrajs` packages to Nandu. Other packages
continue to use npm. Browsing and installation require no account or token.

```sh
npm install
```

For publishing all eight packages in dependency order:

```sh
node --env-file=deployments/nandu/.env.publish scripts/release-nandu.mjs
```

The publisher skips matching versions, grants the maintainers team access, and
verifies downloaded archives. Bump a package's version before releasing changes;
existing version contents are never overwritten. Release artifacts and the
verification manifest are saved in ignored `deployments/nandu/artifacts/`.

In another project, copy this checkout's `.npmrc`. No token is needed for installs. Install scoped packages by
name, for example `npm install @veltrajs/kit @veltrajs/ui`.

The two unscoped packages need explicit tarball URLs so third-party dependencies
still resolve from npm:

```sh
npm install https://veltra-nandu-production-qsfhr9.laravel.cloud/lucide-imba/-/lucide-imba-0.1.0.tgz
npx https://veltra-nandu-production-qsfhr9.laravel.cloud/create-veltra/-/create-veltra-0.1.0.tgz my-app --npm
```

Copy `.npmrc` into the generated app before installing its dependencies. The `--npm` argument selects normal named
package dependencies; the scoped `.npmrc` routes them to Nandu.

The VS Code extension is marked private and is distributed as a VSIX, not an npm
package. The website and example apps are also private workspace applications.

Only publishing and account/team/token management require authentication.
