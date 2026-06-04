USE tienda_calzadoo;

ALTER TABLE pedido
  ADD COLUMN fecha_enviado DATETIME NULL,
  ADD COLUMN fecha_entregado DATETIME NULL,
  ADD COLUMN tracking_codigo VARCHAR(80) NULL;

CREATE TABLE IF NOT EXISTS oferta (
  id_oferta INT AUTO_INCREMENT PRIMARY KEY,
  id_producto INT NOT NULL,
  porcentaje DECIMAL(5,2) NOT NULL,
  activo BOOLEAN DEFAULT TRUE,
  fecha_inicio DATETIME NULL,
  fecha_fin DATETIME NULL,
  UNIQUE KEY uq_oferta_producto (id_producto),
  FOREIGN KEY (id_producto) REFERENCES producto(id_producto) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS devolucion (
  id_devolucion INT AUTO_INCREMENT PRIMARY KEY,
  id_usuario INT NOT NULL,
  id_pedido INT NOT NULL,
  id_producto INT NOT NULL,
  id_detalle_pedido INT NULL,
  motivo TEXT NOT NULL,
  evidencias TEXT NULL,
  estado ENUM('solicitada','en_revision','aprobada','rechazada','completada') DEFAULT 'solicitada',
  fecha_creacion DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (id_usuario) REFERENCES usuario(id_usuario),
  FOREIGN KEY (id_pedido) REFERENCES pedido(id_pedido),
  FOREIGN KEY (id_producto) REFERENCES producto(id_producto)
);

CREATE TABLE IF NOT EXISTS inventario_movimiento (
  id_mov INT AUTO_INCREMENT PRIMARY KEY,
  id_producto INT NOT NULL,
  tipo ENUM('entrada','salida','ajuste') NOT NULL,
  cantidad INT NOT NULL,
  referencia VARCHAR(120) NULL,
  id_pedido INT NULL,
  fecha DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (id_producto) REFERENCES producto(id_producto),
  FOREIGN KEY (id_pedido) REFERENCES pedido(id_pedido)
);

INSERT INTO categoria (nombre, descripcion)
SELECT 'Tenis', 'Calzado tipo tenis' FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM categoria WHERE nombre='Tenis');
INSERT INTO categoria (nombre, descripcion)
SELECT 'Botas', 'Botas y caña alta' FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM categoria WHERE nombre='Botas');
INSERT INTO categoria (nombre, descripcion)
SELECT 'Sandalias', 'Sandalias y chanclas' FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM categoria WHERE nombre='Sandalias');
INSERT INTO categoria (nombre, descripcion)
SELECT 'Tacones', 'Tacones y salón' FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM categoria WHERE nombre='Tacones');
INSERT INTO categoria (nombre, descripcion)
SELECT 'Deportivos', 'Running y training' FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM categoria WHERE nombre='Deportivos');

INSERT INTO proveedor (nombre, telefono, correo, direccion) SELECT 'Distribuidora Andina SAS', '3001110001', 'compras@andina.com', 'Bogotá' FROM DUAL WHERE (SELECT COUNT(*) FROM proveedor) < 10;
INSERT INTO proveedor (nombre, telefono, correo, direccion) SELECT 'Importadora Pacífico', '3001110002', 'ventas@pacifico.com', 'Cali' FROM DUAL WHERE (SELECT COUNT(*) FROM proveedor) < 10;
INSERT INTO proveedor (nombre, telefono, correo, direccion) SELECT 'Calzado Caribe Ltda', '3001110003', 'logistica@caribe.com', 'Barranquilla' FROM DUAL WHERE (SELECT COUNT(*) FROM proveedor) < 10;
INSERT INTO proveedor (nombre, telefono, correo, direccion) SELECT 'EuroStep Trading', '3001110004', 'info@eurostep.com', 'Medellín' FROM DUAL WHERE (SELECT COUNT(*) FROM proveedor) < 10;
INSERT INTO proveedor (nombre, telefono, correo, direccion) SELECT 'Sole Partners Co', '3001110005', 'pedidos@solepartners.com', 'Bogotá' FROM DUAL WHERE (SELECT COUNT(*) FROM proveedor) < 10;
INSERT INTO proveedor (nombre, telefono, correo, direccion) SELECT 'Runners Supply', '3001110006', 'abastecimiento@runners.com', 'Pereira' FROM DUAL WHERE (SELECT COUNT(*) FROM proveedor) < 10;
INSERT INTO proveedor (nombre, telefono, correo, direccion) SELECT 'Urban Kicks Import', '3001110007', 'comercial@urbankicks.com', 'Bogotá' FROM DUAL WHERE (SELECT COUNT(*) FROM proveedor) < 10;
INSERT INTO proveedor (nombre, telefono, correo, direccion) SELECT 'Mountain Footwear', '3001110008', 'ventas@mountainfw.com', 'Manizales' FROM DUAL WHERE (SELECT COUNT(*) FROM proveedor) < 10;
INSERT INTO proveedor (nombre, telefono, correo, direccion) SELECT 'Kids Step Distribuciones', '3001110009', 'kids@kidsstep.com', 'Cali' FROM DUAL WHERE (SELECT COUNT(*) FROM proveedor) < 10;
INSERT INTO proveedor (nombre, telefono, correo, direccion) SELECT 'Premium Soles Internacional', '3001110010', 'import@premiumsoles.com', 'Bogotá' FROM DUAL WHERE (SELECT COUNT(*) FROM proveedor) < 10;
