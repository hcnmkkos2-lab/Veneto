'use strict';

// VENETO API backend. Configure secrets and a persistent DATABASE_PATH in the host environment.
const path = require('node:path');
const crypto = require('node:crypto');
const fs = require('node:fs');
const express = require('express');
const session = require('express-session');
const SQLiteStore = require('connect-sqlite3')(session);
const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const helmet = require('helmet');
const { rateLimit } = require('express-rate-limit');

const app = express();
const production = process.env.NODE_ENV === 'production';
const port = Number(process.env.PORT || 3000);
const dataDir = path.resolve(process.env.DATA_DIR || './data');
fs.mkdirSync(dataDir, { recursive: true });
const databasePath = path.resolve(process.env.DATABASE_PATH || path.join(dataDir, 'veneto.sqlite'));
const db = new Database(databasePath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
db.exec(`
  CREATE TABLE IF NOT EXISTS admins (
    id INTEGER PRIMARY KEY, email TEXT NOT NULL UNIQUE COLLATE NOCASE,
    password_hash TEXT NOT NULL, role TEXT NOT NULL DEFAULT 'admin' CHECK(role IN ('owner','admin')),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS invitations (
    id INTEGER PRIMARY KEY, email TEXT NOT NULL COLLATE NOCASE, token_hash TEXT NOT NULL UNIQUE,
    expires_at TEXT NOT NULL, used_at TEXT, created_by INTEGER NOT NULL REFERENCES admins(id),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS products (
    id TEXT PRIMARY KEY, name_ar TEXT NOT NULL, name_en TEXT NOT NULL DEFAULT '',
    description_ar TEXT NOT NULL DEFAULT '', description_en TEXT NOT NULL DEFAULT '',
    category TEXT NOT NULL, price_iqd INTEGER, image_url TEXT NOT NULL DEFAULT '',
    active INTEGER NOT NULL DEFAULT 1, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS areas (
    id TEXT PRIMARY KEY, name_ar TEXT NOT NULL UNIQUE, name_en TEXT NOT NULL DEFAULT '',
    district TEXT NOT NULL CHECK(district IN ('الكرخ','الرصافة')),
    delivery_fee_iqd INTEGER, active INTEGER NOT NULL DEFAULT 1,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS orders (
    id TEXT PRIMARY KEY, customer_name TEXT NOT NULL, phone TEXT NOT NULL,
    area_id TEXT NOT NULL REFERENCES areas(id), area_name TEXT NOT NULL,
    items_json TEXT NOT NULL, subtotal_iqd INTEGER, delivery_fee_iqd INTEGER,
    total_iqd INTEGER, status TEXT NOT NULL DEFAULT 'new'
      CHECK(status IN ('new','preparing','delivered','cancelled')),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
  CREATE TABLE IF NOT EXISTS audit_log (
    id INTEGER PRIMARY KEY, admin_id INTEGER REFERENCES admins(id), action TEXT NOT NULL,
    details_json TEXT NOT NULL DEFAULT '{}', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
`);

const initialProducts = [
  ['nutella','طبق سعادة نوتيلا','Nutella Happiness Platter','طبق حلى غني بالنوتيلا.','A Nutella-rich dessert platter.','dessert',4000],
  ['croissant','كرواسون طازج','Fresh Croissant','طبقات ذهبية هشة ومخبوزة يومياً.','Golden flaky layers, baked fresh daily.','pastry',null],
  ['cinnamon','رول القرفة','Cinnamon Roll','عجينة طرية بحشوة القرفة والسكر.','Soft dough filled with cinnamon and sugar.','pastry',null],
  ['danish','دانش بالفواكه','Fruit Danish','معجنات مورّقة مع لمسة فواكه.','Flaky pastry with fruit.','pastry',null],
  ['cheese','فطيرة الجبن','Cheese Pie','فطيرة مخبوزة بحشوة الجبن.','A baked pie with cheese filling.','savory',null],
  ['pizza','ميني بيتزا','Mini Pizza','لقيمات مالحة مخبوزة.','Bite-sized savory pastries.','savory',null],
  ['assorted','معجنات مشكلة','Assorted Pastries','تشكيلة مخبوزات مالحة طازجة.','An assortment of fresh savory pastries.','savory',null],
  ['cheesecake','تشيزكيك','Cheesecake','حلى كريمي بطبقة بسكويت.','Creamy dessert with a biscuit base.','dessert',null],
  ['brownie','براونيز الشوكولاتة','Chocolate Brownie','قطعة غنية بالشوكولاتة.','A rich chocolate treat.','dessert',null],
  ['cupcake','كب كيك','Cupcake','كيك صغير بطبقة كريمة.','A little cake topped with cream.','dessert',null],
  ['cookies','كوكيز','Cookies','بسكويت مخبوز بإضافات لذيذة.','Freshly baked cookies.','dessert',null],
  ['coffee','قهوة','Coffee','قهوة ترافق حلوياتكم.','Coffee to enjoy with dessert.','drink',null],
  ['cold','مشروبات باردة','Cold Drinks','خيارات منعشة حسب المتوفر.','Refreshing choices, subject to availability.','drink',null]
];
const seedProduct = db.prepare(`INSERT OR IGNORE INTO products(id,name_ar,name_en,description_ar,description_en,category,price_iqd)
  VALUES(?,?,?,?,?,?,?)`);
for (const product of initialProducts) seedProduct.run(...product);

const karkh = ['المنصور','الحارثية','اليرموك','القادسية','العامرية','الغزالية','الخضراء','حي الجامعة','العدل','السيدية','البياع','الدورة','الجادرية','الكاظمية','الشعلة','الحرية','العطيفية','الوشاش','الداوودي','أبو غريب'];
const rusafa = ['الأعظمية','الوزيرية','الصليخ','الكرادة داخل','الكرادة خارج','زيونة','بغداد الجديدة','البلديات','الشعب','مدينة الصدر','شارع فلسطين','المستنصرية','باب المعظم','كمب سارة','الزعفرانية','المشتل','الحبيبية','الأمين','المعامل','الطالبية','النهضة','العبيدي','حي أور'];
const seedArea = db.prepare(`INSERT OR IGNORE INTO areas(id,name_ar,name_en,district,delivery_fee_iqd) VALUES(?,?,?,?,?)`);
for (const [district, names] of [['الكرخ',karkh],['الرصافة',rusafa]]) {
  for (const name of names) {
    const id = 'baghdad-' + crypto.createHash('sha256').update(name).digest('hex').slice(0,12);
    seedArea.run(id, name, '', district, name === 'مدينة الصدر' ? 2000 : name === 'حي أور' ? 1000 : null);
  }
}

if (production && (!process.env.SESSION_SECRET || process.env.SESSION_SECRET.length < 32)) {
  throw new Error('SESSION_SECRET must be set to a random value of at least 32 characters in production.');
}
if (production && !process.env.OWNER_EMAIL) throw new Error('Set OWNER_EMAIL to the primary administrator email.');
app.disable('x-powered-by');
app.set('trust proxy', production ? 1 : false);
// CSP is disabled because the existing storefront uses inline CSS/JS; other Helmet protections remain enabled.
app.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false }));
app.use(express.json({ limit: '32kb' }));
app.use(express.urlencoded({ extended: false, limit: '8kb' }));
app.use(session({
  name: 'veneto.sid',
  store: new SQLiteStore({ db: 'sessions.sqlite', dir: dataDir, concurrentDB: true }),
  secret: process.env.SESSION_SECRET || 'development-only-secret-change-before-deploy-000000000000',
  resave: false, saveUninitialized: false,
  cookie: { httpOnly: true, secure: production, sameSite: 'strict', maxAge: 8 * 60 * 60 * 1000 }
}));
app.use(express.static(path.resolve(__dirname), { index: 'index.html', dotfiles: 'ignore', setHeaders(res, file) {
  if (file.endsWith('.html')) res.setHeader('Cache-Control', 'no-store');
} }));

const csrfTokens = new WeakMap();
app.get('/api/csrf', (req, res) => {
  let token = csrfTokens.get(req.session);
  if (!token) { token = crypto.randomBytes(32).toString('hex'); csrfTokens.set(req.session, token); }
  res.json({ csrfToken: token });
});
function csrf(req, res, next) {
  const expected = csrfTokens.get(req.session);
  const supplied = req.get('x-csrf-token');
  if (!expected || !supplied || !crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(supplied))) {
    return res.status(403).json({ error: 'CSRF validation failed. Refresh and retry.' });
  }
  next();
}
const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 8, standardHeaders: true, legacyHeaders: false, message: { error: 'Too many attempts. Try again later.' } });
const technicalLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 5, standardHeaders: true, legacyHeaders: false, message: { error: 'Too many PIN attempts. Try again later.' } });
const orderLimiter = rateLimit({ windowMs: 10 * 60 * 1000, limit: 12, standardHeaders: true, legacyHeaders: false });
const adminLimiter = rateLimit({ windowMs: 10 * 60 * 1000, limit: 100, standardHeaders: true, legacyHeaders: false });
const clean = value => typeof value === 'string' ? value.trim() : '';
const isEmail = value => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
const audit = (req, action, details = {}) => db.prepare('INSERT INTO audit_log(admin_id,action,details_json) VALUES(?,?,?)').run(req.session.adminId || null, action, JSON.stringify(details));
function requireAdmin(req, res, next) {
  if (!req.session.adminId) return res.status(401).json({ error: 'Administrator login required.' });
  const admin = db.prepare('SELECT id,email,role FROM admins WHERE id=?').get(req.session.adminId);
  if (!admin) return req.session.destroy(() => res.status(401).json({ error: 'Session expired.' }));
  req.admin = admin; next();
}
function requireOwner(req, res, next) { if (req.admin.role !== 'owner') return res.status(403).json({ error: 'Owner approval required.' }); next(); }
function requireTechnical(req, res, next) {
  if (!req.session.technicalUntil || req.session.technicalUntil < Date.now()) {
    req.session.technicalUntil = null; return res.status(403).json({ error: 'Technical administration unlock required.' });
  }
  next();
}
const mutate = [csrf, adminLimiter];

app.get('/api/health', (req, res) => res.json({ ok: true }));
app.get('/api/menu', (req, res) => {
  const products = db.prepare('SELECT id,name_ar,name_en,description_ar,description_en,category,price_iqd,image_url FROM products WHERE active=1 ORDER BY rowid').all();
  const areas = db.prepare('SELECT id,name_ar,name_en,district,delivery_fee_iqd FROM areas WHERE active=1 ORDER BY district,name_ar').all();
  res.json({ products, areas });
});

// First owner setup is one-time, bound to OWNER_EMAIL and a deployment-only bootstrap token.
app.post('/api/setup/claim', loginLimiter, csrf, async (req, res) => {
  const configuredEmail = clean(process.env.OWNER_EMAIL).toLowerCase();
  const email = clean(req.body.email).toLowerCase();
  const password = typeof req.body.password === 'string' ? req.body.password : '';
  const token = typeof req.body.setupToken === 'string' ? req.body.setupToken : '';
  const setupToken = process.env.VENETO_SETUP_TOKEN || '';
  if (db.prepare('SELECT count(*) AS n FROM admins').get().n !== 0) return res.status(409).json({ error: 'Initial setup is already complete.' });
  if (!setupToken || !configuredEmail || email !== configuredEmail || !token || token.length !== setupToken.length || !crypto.timingSafeEqual(Buffer.from(token), Buffer.from(setupToken))) return res.status(403).json({ error: 'Invalid setup authorization.' });
  if (!isEmail(email) || password.length < 12 || password.length > 200) return res.status(400).json({ error: 'Use the configured owner email and a password of at least 12 characters.' });
  const hash = await bcrypt.hash(password, 12);
  const result = db.prepare("INSERT INTO admins(email,password_hash,role) VALUES(?,?,'owner')").run(email, hash);
  req.session.regenerate(error => {
    if (error) return res.status(500).json({ error: 'Could not create session.' });
    req.session.adminId = Number(result.lastInsertRowid);
    req.session.save(() => res.status(201).json({ email, role: 'owner' }));
  });
});
app.post('/api/login', loginLimiter, csrf, async (req, res) => {
  const email = clean(req.body.email).toLowerCase();
  const password = typeof req.body.password === 'string' ? req.body.password : '';
  const admin = db.prepare('SELECT * FROM admins WHERE email=?').get(email);
  const valid = admin && await bcrypt.compare(password, admin.password_hash);
  if (!valid) return res.status(401).json({ error: 'Invalid email or password.' });
  req.session.regenerate(error => {
    if (error) return res.status(500).json({ error: 'Could not create session.' });
    req.session.adminId = admin.id;
    req.session.save(() => res.json({ email: admin.email, role: admin.role }));
  });
});
app.get('/api/session', requireAdmin, (req, res) => res.json({ email: req.admin.email, role: req.admin.role }));
app.post('/api/logout', requireAdmin, csrf, (req, res) => req.session.destroy(() => { res.clearCookie('veneto.sid'); res.json({ ok: true }); }));

app.post('/api/admin/invitations', requireAdmin, requireOwner, ...mutate, (req, res) => {
  const email = clean(req.body.email).toLowerCase();
  if (!isEmail(email)) return res.status(400).json({ error: 'Enter a valid email address.' });
  if (db.prepare('SELECT 1 FROM admins WHERE email=?').get(email)) return res.status(409).json({ error: 'This email is already an administrator.' });
  const token = crypto.randomBytes(32).toString('base64url');
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  db.prepare('INSERT INTO invitations(email,token_hash,expires_at,created_by) VALUES(?,?,datetime(\'now\',\'+24 hours\'),?)').run(email, tokenHash, req.admin.id);
  audit(req, 'admin.invitation.created', { email });
  res.status(201).json({ email, invitationToken: token, expiresInHours: 24, note: 'Copy this one-time token now; it will not be shown again.' });
});
app.post('/api/invitations/accept', loginLimiter, csrf, async (req, res) => {
  const email = clean(req.body.email).toLowerCase(), token = clean(req.body.token), password = typeof req.body.password === 'string' ? req.body.password : '';
  if (!isEmail(email) || password.length < 12 || password.length > 200 || token.length < 30) return res.status(400).json({ error: 'Invalid invitation details or password.' });
  const hash = crypto.createHash('sha256').update(token).digest('hex');
  const invite = db.prepare("SELECT * FROM invitations WHERE email=? AND token_hash=? AND used_at IS NULL AND expires_at>CURRENT_TIMESTAMP").get(email, hash);
  if (!invite) return res.status(400).json({ error: 'Invitation is invalid, expired, or already used.' });
  const passwordHash = await bcrypt.hash(password, 12);
  const accept = db.transaction(() => {
    const created = db.prepare("INSERT INTO admins(email,password_hash,role) VALUES(?,?,'admin')").run(email, passwordHash);
    db.prepare('UPDATE invitations SET used_at=CURRENT_TIMESTAMP WHERE id=? AND used_at IS NULL').run(invite.id);
    return Number(created.lastInsertRowid);
  });
  let adminId;
  try { adminId = accept(); } catch { return res.status(409).json({ error: 'Administrator account already exists.' }); }
  req.session.regenerate(error => {
    if (error) return res.status(500).json({ error: 'Account created but session failed; log in.' });
    req.session.adminId = adminId; req.session.save(() => res.status(201).json({ email, role: 'admin' }));
  });
});

app.get('/api/admin/orders', requireAdmin, adminLimiter, (req, res) => {
  const status = clean(req.query.status);
  const valid = ['new','preparing','delivered','cancelled'];
  if (status && !valid.includes(status)) return res.status(400).json({ error: 'Invalid order status.' });
  const rows = status ? db.prepare('SELECT * FROM orders WHERE status=? ORDER BY created_at DESC').all(status) : db.prepare('SELECT * FROM orders ORDER BY created_at DESC LIMIT 300').all();
  res.json(rows.map(row => ({ ...row, items: JSON.parse(row.items_json) })));
});
app.patch('/api/admin/orders/:id/status', requireAdmin, ...mutate, (req, res) => {
  const status = clean(req.body.status);
  if (!['new','preparing','delivered','cancelled'].includes(status)) return res.status(400).json({ error: 'Invalid status.' });
  const order = db.prepare('SELECT id,status FROM orders WHERE id=?').get(req.params.id);
  if (!order) return res.status(404).json({ error: 'Order not found.' });
  db.prepare('UPDATE orders SET status=?,updated_at=CURRENT_TIMESTAMP WHERE id=?').run(status, order.id);
  audit(req, 'order.status.changed', { orderId: order.id, from: order.status, to: status });
  res.json({ ok: true, id: order.id, status });
});

app.post('/api/orders', orderLimiter, csrf, (req, res) => {
  const customerName = clean(req.body.customerName), phone = clean(req.body.phone), areaId = clean(req.body.areaId);
  const items = req.body.items;
  if (customerName.length < 2 || customerName.length > 80 || !/^[0-9+()\s-]{10,18}$/.test(phone) || !Array.isArray(items) || items.length < 1 || items.length > 40) return res.status(400).json({ error: 'Please check the name, phone, and cart.' });
  const area = db.prepare('SELECT * FROM areas WHERE id=? AND active=1').get(areaId);
  if (!area) return res.status(400).json({ error: 'Choose a valid Baghdad area.' });
  const cleanItems = []; let subtotal = 0; let knownPrices = true;
  for (const item of items) {
    const id = clean(item && item.productId), quantity = Number(item && item.quantity);
    if (!/^[a-z0-9-]{1,60}$/.test(id) || !Number.isInteger(quantity) || quantity < 1 || quantity > 50) return res.status(400).json({ error: 'Invalid cart item.' });
    const product = db.prepare('SELECT id,name_ar,price_iqd FROM products WHERE id=? AND active=1').get(id);
    if (!product) return res.status(400).json({ error: 'A product is unavailable.' });
    if (product.price_iqd === null) knownPrices = false; else subtotal += product.price_iqd * quantity;
    cleanItems.push({ productId: product.id, name: product.name_ar, quantity, unitPriceIqd: product.price_iqd });
  }
  const deliveryFee = area.delivery_fee_iqd;
  const completeTotal = knownPrices && deliveryFee !== null;
  const orderId = crypto.randomUUID();
  db.prepare(`INSERT INTO orders(id,customer_name,phone,area_id,area_name,items_json,subtotal_iqd,delivery_fee_iqd,total_iqd)
    VALUES(?,?,?,?,?,?,?,?,?)`).run(orderId, customerName, phone, area.id, area.name_ar, JSON.stringify(cleanItems), knownPrices ? subtotal : null, deliveryFee, completeTotal ? subtotal + deliveryFee : null);
  res.status(201).json({ orderId, status: 'new', subtotalIqd: knownPrices ? subtotal : null, deliveryFeeIqd: deliveryFee, totalIqd: completeTotal ? subtotal + deliveryFee : null, deliveryFeePending: deliveryFee === null, totalPending: !completeTotal });
});

app.post('/api/admin/technical-pin', requireAdmin, requireOwner, ...mutate, async (req, res) => {
  const pin = String(req.body.pin || '');
  if (!/^\d{8}$/.test(pin)) return res.status(400).json({ error: 'PIN must contain exactly 8 digits.' });
  const hash = await bcrypt.hash(pin, 12);
  db.prepare("INSERT INTO settings(key,value) VALUES('technical_pin_hash',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=CURRENT_TIMESTAMP").run(hash);
  audit(req, 'technical.pin.changed');
  res.json({ ok: true });
});
app.post('/api/technical/unlock', requireAdmin, technicalLimiter, csrf, async (req, res) => {
  const row = db.prepare("SELECT value FROM settings WHERE key='technical_pin_hash'").get();
  if (!row || !/^\d{8}$/.test(String(req.body.pin || '')) || !(await bcrypt.compare(String(req.body.pin), row.value))) {
    audit(req, 'technical.unlock.failed'); return res.status(403).json({ error: 'Incorrect PIN or PIN not configured.' });
  }
  req.session.technicalUntil = Date.now() + 20 * 60 * 1000;
  audit(req, 'technical.unlock.succeeded');
  res.json({ ok: true, expiresInMinutes: 20 });
});
app.get('/api/technical/audit', requireAdmin, requireTechnical, adminLimiter, (req, res) => res.json(db.prepare('SELECT action,details_json,created_at FROM audit_log ORDER BY id DESC LIMIT 100').all().map(row => ({ ...row, details: JSON.parse(row.details_json) }))));
app.get('/api/technical/products', requireAdmin, requireTechnical, adminLimiter, (req, res) => res.json(db.prepare('SELECT * FROM products ORDER BY rowid').all()));
app.post('/api/technical/products', requireAdmin, requireTechnical, ...mutate, (req, res) => {
  const { id, name_ar, name_en='', description_ar='', description_en='', category, image_url='' } = req.body;
  const price = req.body.price_iqd === '' || req.body.price_iqd == null ? null : Number(req.body.price_iqd);
  if (!/^[a-z0-9-]{2,60}$/.test(String(id || '')) || !clean(name_ar) || !['dessert','pastry','savory','drink'].includes(category) || (price !== null && (!Number.isSafeInteger(price) || price < 0)) || String(image_url).length > 1500) return res.status(400).json({ error: 'Invalid product fields.' });
  try { db.prepare('INSERT INTO products(id,name_ar,name_en,description_ar,description_en,category,price_iqd,image_url) VALUES(?,?,?,?,?,?,?,?)').run(id,clean(name_ar),clean(name_en),clean(description_ar),clean(description_en),category,price,clean(image_url)); }
  catch { return res.status(409).json({ error: 'Product ID already exists.' }); }
  audit(req, 'product.created', { id }); res.status(201).json({ ok:true,id });
});
app.patch('/api/technical/products/:id', requireAdmin, requireTechnical, ...mutate, (req, res) => {
  const existing = db.prepare('SELECT * FROM products WHERE id=?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Product not found.' });
  const body = req.body, price = body.price_iqd === '' ? null : body.price_iqd === undefined ? existing.price_iqd : Number(body.price_iqd);
  if (price !== null && (!Number.isSafeInteger(price) || price < 0)) return res.status(400).json({ error: 'Invalid price.' });
  const next = { name_ar: body.name_ar === undefined ? existing.name_ar : clean(body.name_ar), name_en: body.name_en === undefined ? existing.name_en : clean(body.name_en), description_ar: body.description_ar === undefined ? existing.description_ar : clean(body.description_ar), description_en: body.description_en === undefined ? existing.description_en : clean(body.description_en), category: body.category === undefined ? existing.category : body.category, image_url: body.image_url === undefined ? existing.image_url : clean(body.image_url), active: body.active === undefined ? existing.active : (body.active ? 1 : 0), price_iqd: price };
  if (!next.name_ar || !['dessert','pastry','savory','drink'].includes(next.category) || next.image_url.length > 1500) return res.status(400).json({ error: 'Invalid product fields.' });
  db.prepare('UPDATE products SET name_ar=?,name_en=?,description_ar=?,description_en=?,category=?,price_iqd=?,image_url=?,active=?,updated_at=CURRENT_TIMESTAMP WHERE id=?').run(next.name_ar,next.name_en,next.description_ar,next.description_en,next.category,next.price_iqd,next.image_url,next.active,req.params.id);
  audit(req, 'product.updated', { id:req.params.id, active:next.active }); res.json({ ok:true });
});
app.delete('/api/technical/products/:id', requireAdmin, requireTechnical, ...mutate, (req, res) => {
  const result = db.prepare('UPDATE products SET active=0,updated_at=CURRENT_TIMESTAMP WHERE id=?').run(req.params.id);
  if (!result.changes) return res.status(404).json({ error: 'Product not found.' });
  audit(req, 'product.hidden', { id:req.params.id }); res.json({ ok:true });
});
app.get('/api/technical/areas', requireAdmin, requireTechnical, adminLimiter, (req, res) => res.json(db.prepare('SELECT * FROM areas ORDER BY district,name_ar').all()));
app.post('/api/technical/areas', requireAdmin, requireTechnical, ...mutate, (req, res) => {
  const name = clean(req.body.name_ar), district = clean(req.body.district), fee = req.body.delivery_fee_iqd === '' || req.body.delivery_fee_iqd == null ? null : Number(req.body.delivery_fee_iqd);
  if (name.length < 2 || name.length > 80 || !['الكرخ','الرصافة'].includes(district) || (fee !== null && (!Number.isSafeInteger(fee) || fee < 0))) return res.status(400).json({ error: 'Invalid Baghdad area.' });
  const id = 'baghdad-' + crypto.randomBytes(8).toString('hex');
  try { db.prepare('INSERT INTO areas(id,name_ar,district,delivery_fee_iqd) VALUES(?,?,?,?)').run(id,name,district,fee); } catch { return res.status(409).json({ error: 'Area already exists.' }); }
  audit(req, 'area.created', { id,name,district,fee }); res.status(201).json({ id });
});
app.patch('/api/technical/areas/:id', requireAdmin, requireTechnical, ...mutate, (req, res) => {
  const area = db.prepare('SELECT * FROM areas WHERE id=?').get(req.params.id); if (!area) return res.status(404).json({ error: 'Area not found.' });
  const fee = req.body.delivery_fee_iqd === undefined ? area.delivery_fee_iqd : req.body.delivery_fee_iqd === null || req.body.delivery_fee_iqd === '' ? null : Number(req.body.delivery_fee_iqd);
  if (fee !== null && (!Number.isSafeInteger(fee) || fee < 0)) return res.status(400).json({ error: 'Invalid delivery fee.' });
  const active = req.body.active === undefined ? area.active : (req.body.active ? 1 : 0);
  db.prepare('UPDATE areas SET delivery_fee_iqd=?,active=?,updated_at=CURRENT_TIMESTAMP WHERE id=?').run(fee,active,area.id);
  audit(req, 'area.updated', { id:area.id,fee,active }); res.json({ ok:true });
});

app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, 'admin.html')));
app.use((err, req, res, next) => { console.error(err); if (res.headersSent) return next(err); res.status(500).json({ error: 'Internal server error.' }); });
app.listen(port, () => console.log(`VENETO server listening on port ${port}; database: ${databasePath}`));
