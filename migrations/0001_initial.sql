PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS admins (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('owner','admin')) DEFAULT 'admin',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  admin_id INTEGER REFERENCES admins(id) ON DELETE CASCADE,
  csrf_token TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  technical_until INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS invitations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL COLLATE NOCASE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at INTEGER NOT NULL,
  used_at TEXT,
  created_by INTEGER NOT NULL REFERENCES admins(id),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS products (
  id TEXT PRIMARY KEY,
  name_ar TEXT NOT NULL,
  name_en TEXT NOT NULL DEFAULT '',
  description_ar TEXT NOT NULL DEFAULT '',
  description_en TEXT NOT NULL DEFAULT '',
  category TEXT NOT NULL DEFAULT 'dessert',
  price_iqd INTEGER,
  image_url TEXT NOT NULL DEFAULT '',
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS areas (
  id TEXT PRIMARY KEY,
  name_ar TEXT NOT NULL UNIQUE,
  name_en TEXT NOT NULL DEFAULT '',
  district TEXT NOT NULL CHECK (district IN ('الكرخ','الرصافة')),
  delivery_fee_iqd INTEGER,
  active INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE IF NOT EXISTS orders (
  id TEXT PRIMARY KEY,
  customer_name TEXT NOT NULL,
  phone TEXT NOT NULL,
  area_id TEXT NOT NULL,
  area_name TEXT NOT NULL,
  items_json TEXT NOT NULL,
  subtotal_iqd INTEGER,
  delivery_fee_iqd INTEGER,
  total_iqd INTEGER,
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new','preparing','delivered','cancelled')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  admin_id INTEGER REFERENCES admins(id),
  action TEXT NOT NULL,
  details_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_orders_status_created ON orders(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sessions_expiry ON sessions(expires_at);

INSERT OR IGNORE INTO products (id,name_ar,name_en,description_ar,description_en,category,price_iqd) VALUES
('nutella','طبق سعادة نوتيلا','Nutella Happiness Platter','طبق حلى غني بالنوتيلا.','A Nutella-rich dessert platter.','dessert',4000),
('croissant','كرواسون طازج','Fresh Croissant','','','pastry',NULL),
('cinnamon','رول القرفة','Cinnamon Roll','','','pastry',NULL),
('danish','دانش بالفواكه','Fruit Danish','','','pastry',NULL),
('cheese','فطيرة الجبن','Cheese Pie','','','savory',NULL),
('pizza','ميني بيتزا','Mini Pizza','','','savory',NULL),
('assorted','معجنات مشكلة','Assorted Pastries','','','savory',NULL),
('cheesecake','تشيزكيك','Cheesecake','','','dessert',NULL),
('brownie','براونيز الشوكولاتة','Chocolate Brownie','','','dessert',NULL),
('cupcake','كب كيك','Cupcake','','','dessert',NULL),
('cookies','كوكيز','Cookies','','','dessert',NULL),
('coffee','قهوة','Coffee','','','drink',NULL),
('cold','مشروبات باردة','Cold Drinks','','','drink',NULL);
INSERT OR IGNORE INTO areas (id,name_ar,district,delivery_fee_iqd) VALUES
('mansour','المنصور','الكرخ',NULL),('harithiya','الحارثية','الكرخ',NULL),('yarmouk','اليرموك','الكرخ',NULL),('qadisiya','القادسية','الكرخ',NULL),('amiriya','العامرية','الكرخ',NULL),('ghazaliya','الغزالية','الكرخ',NULL),('university','حي الجامعة','الكرخ',NULL),('adel','العدل','الكرخ',NULL),('sadr-city','مدينة الصدر','الرصافة',2000),('hay-ur','حي أور','الرصافة',1000),('karrada','الكرادة','الرصافة',NULL),('jadriya','الجادرية','الرصافة',NULL),('adhamiyah','الأعظمية','الرصافة',NULL),('palestine-street','شارع فلسطين','الرصافة',NULL),('zayouna','زيونة','الرصافة',NULL),('baladiyat','البلديات','الرصافة',NULL);
