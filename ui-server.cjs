const path = require('node:path');
module.exports = function mountRegistryUI(app, { express, authToken, Package, Team, Op, User, RateLimit }) {
  const directory = path.join(__dirname, 'ui');
  const privateResponse = (req, res, next) => { res.set('Cache-Control', 'private, no-store'); next(); };
  app.use((req, res, next) => { if (req.headers.authorization || req.path === '/api/login') res.set('Cache-Control', 'private, no-store'); next(); });
  app.use('/-/ui', privateResponse);
  const signupLimit = RateLimit({ windowMs: 60 * 60 * 1000, max: 8, standardHeaders: true, legacyHeaders: false, message: { error: 'Too many account creation attempts. Please try again later.' } });
  app.post('/-/ui/signup', signupLimit, express.json({ limit: '4kb' }), async (req, res) => {
    const { username, email, password } = req.body || {};
    const name = typeof username === 'string' ? username.trim().toLowerCase() : '';
    const address = typeof email === 'string' ? email.trim().toLowerCase() : '';
    if (!/^[a-z][a-z0-9_-]{2,31}$/.test(name)) return res.status(400).json({ error: 'Use 3–32 characters for your username: start with a letter, then use letters, numbers, hyphens or underscores.' });
    if (address.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address)) return res.status(400).json({ error: 'Enter a valid email address.' });
    if (typeof password !== 'string' || password.length < 10 || Buffer.byteLength(password, 'utf8') > 72) return res.status(400).json({ error: 'Use a password of at least 10 characters and at most 72 bytes.' });
    try {
      // Only these fields are accepted. Account creation never grants team or administrator access.
      const user = await User.create({ _id: `org.couchdb.user:${name}`, name, email: address, password, type: 'user' });
      return res.status(201).json({ token: user.generateToken(), user: { _id: user._id, name: user.name, email: user.email, type: user.type } });
    } catch (error) {
      if (error.name === 'SequelizeUniqueConstraintError') return res.status(409).json({ error: 'That username or email is already registered. Sign in or choose another.' });
      return res.status(500).json({ error: 'We couldn’t create your account. Please try again.' });
    }
  });
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
  app.get(['/', '/packages', '/package/*', '/docs', '/signin', '/signup', '/tokens'], (req, res, next) => {
    // Browser routes must not shadow npm packages with names such as docs.
    if (req.path !== '/' && !String(req.headers.accept || '').includes('text/html')) return next();
    res.set('Cache-Control', 'no-cache');
    res.set('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'");
    res.sendFile(path.join(directory, 'index.html'));
  });
};
