-- ============================================================
--  Winner Shoes — Schema PostgreSQL para Supabase
--  Ejecuta este script en Supabase > SQL Editor
-- ============================================================

-- 1. USUARIOS
CREATE TABLE IF NOT EXISTS usuario (
  id_usuario   SERIAL PRIMARY KEY,
  nombre       VARCHAR(120) NOT NULL,
  correo       VARCHAR(120) UNIQUE NOT NULL,
  contraseña   VARCHAR(255) NOT NULL,
  telefono     VARCHAR(30),
  direccion    TEXT,
  rol          VARCHAR(20)  DEFAULT 'cliente',
  estado       BOOLEAN      DEFAULT TRUE,
  fecha_registro TIMESTAMPTZ DEFAULT NOW()
);

-- 2. MARCAS
CREATE TABLE IF NOT EXISTS marcas (
  id_marca SERIAL PRIMARY KEY,
  nombre   VARCHAR(80) NOT NULL
);

-- 3. CATEGORÍAS
CREATE TABLE IF NOT EXISTS categoria (
  id_categoria SERIAL PRIMARY KEY,
  nombre       VARCHAR(80) NOT NULL,
  descripcion  TEXT
);

-- 4. PRODUCTOS
CREATE TABLE IF NOT EXISTS producto (
  id_producto  SERIAL PRIMARY KEY,
  nombre       VARCHAR(120) NOT NULL,
  descripcion  TEXT,
  precio       DECIMAL(12,2) NOT NULL DEFAULT 0,
  id_categoria INT REFERENCES categoria(id_categoria),
  id_marca     INT REFERENCES marcas(id_marca),
  imagen       TEXT,
  estado       BOOLEAN DEFAULT TRUE
);

-- 5. INVENTARIO
CREATE TABLE IF NOT EXISTS inventario (
  id_inventario  SERIAL PRIMARY KEY,
  id_producto    INT UNIQUE REFERENCES producto(id_producto),
  cantidad       INT DEFAULT 0,
  stock_minimo   INT DEFAULT 5,
  costo_promedio DECIMAL(12,2)
);

-- 6. PEDIDOS
CREATE TABLE IF NOT EXISTS pedido (
  id_pedido       SERIAL PRIMARY KEY,
  id_usuario      INT REFERENCES usuario(id_usuario),
  fecha           TIMESTAMPTZ DEFAULT NOW(),
  total           DECIMAL(12,2) DEFAULT 0,
  estado          VARCHAR(30) DEFAULT 'pendiente',
  tracking_codigo VARCHAR(80),
  fecha_enviado   TIMESTAMPTZ,
  fecha_entregado TIMESTAMPTZ
);

-- 7. DETALLE PEDIDO
CREATE TABLE IF NOT EXISTS detalle_pedido (
  id_detalle      SERIAL PRIMARY KEY,
  id_pedido       INT REFERENCES pedido(id_pedido),
  id_producto     INT REFERENCES producto(id_producto),
  cantidad        INT NOT NULL,
  precio_unitario DECIMAL(12,2),
  subtotal        DECIMAL(12,2)
);

-- 8. PAGOS
CREATE TABLE IF NOT EXISTS pago (
  id_pago     SERIAL PRIMARY KEY,
  id_pedido   INT REFERENCES pedido(id_pedido),
  metodo_pago VARCHAR(50),
  estado      VARCHAR(30) DEFAULT 'pendiente',
  fecha       TIMESTAMPTZ DEFAULT NOW()
);

-- 9. FACTURAS
CREATE TABLE IF NOT EXISTS factura (
  id_factura SERIAL PRIMARY KEY,
  id_pedido  INT REFERENCES pedido(id_pedido),
  fecha      TIMESTAMPTZ DEFAULT NOW(),
  total      DECIMAL(12,2)
);

-- 10. DEVOLUCIONES
CREATE TABLE IF NOT EXISTS devolucion (
  id_devolucion      SERIAL PRIMARY KEY,
  id_usuario         INT REFERENCES usuario(id_usuario),
  id_pedido          INT REFERENCES pedido(id_pedido),
  id_producto        INT REFERENCES producto(id_producto),
  id_detalle_pedido  INT,
  motivo             TEXT NOT NULL,
  evidencias         TEXT,
  estado             VARCHAR(30) DEFAULT 'solicitada',
  fecha_creacion     TIMESTAMPTZ DEFAULT NOW()
);

-- 11. PROVEEDORES
CREATE TABLE IF NOT EXISTS proveedor (
  id_proveedor SERIAL PRIMARY KEY,
  nombre       VARCHAR(120) NOT NULL,
  telefono     VARCHAR(30),
  correo       VARCHAR(120),
  direccion    TEXT
);

-- 12. PRODUCTO ↔ PROVEEDOR
CREATE TABLE IF NOT EXISTS producto_proveedor (
  id_producto  INT REFERENCES producto(id_producto),
  id_proveedor INT REFERENCES proveedor(id_proveedor),
  PRIMARY KEY (id_producto, id_proveedor)
);

-- 13. COMPRAS A PROVEEDOR
CREATE TABLE IF NOT EXISTS compra_proveedor (
  id_compra    SERIAL PRIMARY KEY,
  id_proveedor INT REFERENCES proveedor(id_proveedor),
  total_compra DECIMAL(12,2),
  estado       VARCHAR(30) DEFAULT 'solicitado',
  fecha        TIMESTAMPTZ DEFAULT NOW()
);

-- 14. DETALLE COMPRA
CREATE TABLE IF NOT EXISTS detalle_compra (
  id_detalle              SERIAL PRIMARY KEY,
  id_compra               INT REFERENCES compra_proveedor(id_compra),
  id_producto             INT REFERENCES producto(id_producto),
  cantidad                INT,
  precio_compra_unitario  DECIMAL(12,2),
  subtotal                DECIMAL(12,2)
);

-- 15. OFERTAS  (constraint único en id_producto para ON CONFLICT)
CREATE TABLE IF NOT EXISTS oferta (
  id_oferta   SERIAL PRIMARY KEY,
  id_producto INT UNIQUE REFERENCES producto(id_producto) ON DELETE CASCADE,
  porcentaje  DECIMAL(5,2) NOT NULL,
  activo      BOOLEAN DEFAULT TRUE,
  fecha_inicio TIMESTAMPTZ,
  fecha_fin    TIMESTAMPTZ
);

-- 16. MOVIMIENTOS DE INVENTARIO
CREATE TABLE IF NOT EXISTS inventario_movimiento (
  id_mov      SERIAL PRIMARY KEY,
  id_producto INT REFERENCES producto(id_producto),
  tipo        VARCHAR(20) NOT NULL,
  cantidad    INT NOT NULL,
  referencia  VARCHAR(120),
  id_pedido   INT REFERENCES pedido(id_pedido),
  fecha       TIMESTAMPTZ DEFAULT NOW()
);

-- 17. MOVIMIENTOS CONTABLES
CREATE TABLE IF NOT EXISTS movimiento_contable (
  id_movimiento SERIAL PRIMARY KEY,
  tipo          VARCHAR(20) NOT NULL,
  concepto      VARCHAR(255) NOT NULL,
  monto         DECIMAL(12,2) NOT NULL DEFAULT 0,
  fecha         TIMESTAMPTZ DEFAULT NOW(),
  referencia    VARCHAR(120),
  id_pedido     INT REFERENCES pedido(id_pedido)
);

-- 18. SESIONES (para express-session + connect-pg-simple)
CREATE TABLE IF NOT EXISTS "session" (
  "sid"    VARCHAR   NOT NULL,
  "sess"   JSON      NOT NULL,
  "expire" TIMESTAMP(6) NOT NULL,
  CONSTRAINT "session_pkey" PRIMARY KEY ("sid")
);
CREATE INDEX IF NOT EXISTS "IDX_session_expire" ON "session" ("expire");

-- ============================================================
--  DATOS INICIALES
-- ============================================================

-- Categorías base
INSERT INTO categoria (nombre, descripcion) VALUES
  ('Hombre',    'Línea caballero'),
  ('Mujer',     'Línea dama'),
  ('Niños',     'Línea infantil'),
  ('Deporte',   'Running y training'),
  ('Tenis',     'Calzado tipo tenis'),
  ('Botas',     'Botas y caña alta'),
  ('Sandalias', 'Sandalias y chanclas'),
  ('Tacones',   'Tacones y salón'),
  ('Deportivos','Calzado deportivo')
ON CONFLICT DO NOTHING;

-- Marcas
INSERT INTO marcas (nombre) VALUES
  ('Nike'),('Adidas'),('Puma'),('Reebok'),('Jordan'),
  ('Converse'),('New Balance'),('Asics'),('Vans'),('Fila'),
  ('Under Armour'),('Skechers'),('Lacoste'),('DC Shoes'),
  ('Salomon'),('Crocs'),('Timberland'),('Mizuno')
ON CONFLICT DO NOTHING;

-- Proveedores
INSERT INTO proveedor (nombre, telefono, correo, direccion) VALUES
  ('Distribuidora Andina SAS','3001110001','compras@andina.com','Bogotá'),
  ('Importadora Pacífico','3001110002','ventas@pacifico.com','Cali'),
  ('Calzado Caribe Ltda','3001110003','logistica@caribe.com','Barranquilla'),
  ('EuroStep Trading','3001110004','info@eurostep.com','Medellín'),
  ('Sole Partners Co','3001110005','pedidos@solepartners.com','Bogotá')
ON CONFLICT DO NOTHING;

-- ============================================================
--  USUARIO ADMINISTRADOR
--  Contraseña: Admin123!
--  (hash bcrypt generado con bcryptjs 10 rounds)
-- ============================================================
INSERT INTO usuario (nombre, correo, contraseña, rol) VALUES (
  'Administrador',
  'admin@winnershoes.com',
  '$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi',
  'admin'
) ON CONFLICT (correo) DO NOTHING;

-- NOTA: El hash de arriba corresponde a la contraseña "password".
-- Cámbiala desde el panel de Supabase o registrando un nuevo admin
-- y actualizando su rol a 'admin' en la tabla usuario.
