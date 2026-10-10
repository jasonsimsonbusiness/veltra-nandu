const path = require('node:path');
module.exports = function mountRegistryUI(app, { express, authToken, Package, Team, Op }) {
  const directory = path.join(__dirname, 'ui');
  const privateResponse = (req, res, next) => { res.set('Cache-Control', 'private, no-store'); next(); };
  app.use((req, res, next) => { if (req.headers.authorization || req.path === '/api/login') res.set('Cache-Control', 'private, no-store'); next(); });
  app.use('/-/ui', privateResponse);
  app.get('/-/ui/packages', authToken(), async (req, res) => {
    try {
      const query = String(req.query.q || '').slice(0, 100);
      const offset = Math.max(0, Math.min(100000, Number.parseInt(req.query.offset, 10) || 0));
      const rows = await Package.findAll({
        attributes: ['_id'],
        where: query ? { name: { [Op.iLike]: `%${query.replace(/[\\%_]/g, '\\$&')}%` } } : {},
        order: [['_id', 'ASC']], limit: 30, offset,
      });
      const items = [];
      for (const row of rows) {
        const id = row.getDataValue('_id');
        if (res.locals.user.type !== 'root' && !await Team.checkPermissions(res.locals.user._id, id, ['read-only', 'read-write'])) continue;
        const metadata = await Package.getPackage(id);
        const versions = Object.keys(metadata.versions);
        const version = metadata['dist-tags'].latest || versions.at(-1);
        const latest = metadata.versions[version];
        items.push({ name: id, version, description: latest?.description || '', license: latest?.license || '', modified: metadata.time.modified, access: metadata.access });
      }
      res.json({ items, next: rows.length === 30 ? offset + 30 : null });
    } catch { res.status(500).json({ error: 'Unable to load packages. Please try again.' }); }
  });
  app.use('/-/assets', express.static(directory, { index: false, maxAge: 0 }));
  app.get(['/', '/packages', '/package/*', '/docs', '/signin', '/tokens'], (req, res, next) => {
    // Browser routes must not shadow npm packages with names such as docs.
    if (req.path !== '/' && !String(req.headers.accept || '').includes('text/html')) return next();
    res.set('Cache-Control', 'no-cache');
    res.set('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'");
    res.sendFile(path.join(directory, 'index.html'));
  });
};
