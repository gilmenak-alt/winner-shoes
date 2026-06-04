CREATE DATABASE IF NOT EXISTS tienda_calzadoo;
USE tienda_calzadoo;

-- 2. TABLAS MAESTRAS (Sin dependencias)
CREATE TABLE usuario (
    id_usuario INT AUTO_INCREMENT PRIMARY KEY,
    nombre VARCHAR(100) NOT NULL,
    correo VARCHAR(100) UNIQUE NOT NULL,
    contraseña VARCHAR(100) NOT NULL,
    telefono VARCHAR(15),
    direccion VARCHAR(150),
    rol ENUM('cliente', 'admin') DEFAULT 'cliente',
    estado BOOLEAN DEFAULT TRUE,
    fecha_registro DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE categoria (
    id_categoria INT AUTO_INCREMENT PRIMARY KEY,
    nombre VARCHAR(100) NOT NULL,
    descripcion TEXT
);

CREATE TABLE marcas (
    id_marca INT AUTO_INCREMENT PRIMARY KEY,
    nombre VARCHAR(100) NOT NULL
);

CREATE TABLE proveedor (
    id_proveedor INT AUTO_INCREMENT PRIMARY KEY,
    nombre VARCHAR(100) NOT NULL,
    telefono VARCHAR(15),
    correo VARCHAR(100),
    direccion VARCHAR(150)
);

-- 3. TABLAS DE PRODUCTOS Y LOGÍSTICA
CREATE TABLE producto (
    id_producto INT AUTO_INCREMENT PRIMARY KEY,
    nombre VARCHAR(150) NOT NULL,
    descripcion TEXT,
    precio DECIMAL(10,2) NOT NULL,
    id_categoria INT,
    id_marca INT,
    imagen VARCHAR(255),
    estado BOOLEAN DEFAULT TRUE,
    FOREIGN KEY (id_categoria) REFERENCES categoria(id_categoria),
    FOREIGN KEY (id_marca) REFERENCES marcas(id_marca)
);

-- Tabla de Inventario Optimizada para Sistema Permanente
CREATE TABLE inventario (
    id_inventario INT AUTO_INCREMENT PRIMARY KEY,
    id_producto INT UNIQUE,
    cantidad INT NOT NULL DEFAULT 0,
    stock_minimo INT DEFAULT 5,
    stock_maximo INT DEFAULT 100,
    costo_promedio DECIMAL(10,2) DEFAULT 0.00,
    ubicacion_bodega VARCHAR(50),
    fecha_actualizacion DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (id_producto) REFERENCES producto(id_producto)
);

CREATE TABLE producto_proveedor (
    id_producto INT,
    id_proveedor INT,
    PRIMARY KEY (id_producto, id_proveedor),
    FOREIGN KEY (id_producto) REFERENCES producto(id_producto),
    FOREIGN KEY (id_proveedor) REFERENCES proveedor(id_proveedor)
);

-- 4. TABLAS DE VENTAS Y FACTURACIÓN
CREATE TABLE pedido (
    id_pedido INT AUTO_INCREMENT PRIMARY KEY,
    id_usuario INT,
    fecha DATETIME DEFAULT CURRENT_TIMESTAMP,
    total DECIMAL(10,2) DEFAULT 0.00,
    estado ENUM('pendiente', 'pagado', 'enviado', 'entregado') DEFAULT 'pendiente',
    FOREIGN KEY (id_usuario) REFERENCES usuario(id_usuario)
);

CREATE TABLE detalle_pedido (
    id_detalle INT AUTO_INCREMENT PRIMARY KEY,
    id_pedido INT,
    id_producto INT,
    cantidad INT NOT NULL,
    precio_unitario DECIMAL(10,2) NOT NULL,
    subtotal DECIMAL(10,2),
    FOREIGN KEY (id_pedido) REFERENCES pedido(id_pedido),
    FOREIGN KEY (id_producto) REFERENCES producto(id_producto)
);

CREATE TABLE pago (
    id_pago INT AUTO_INCREMENT PRIMARY KEY,
    id_pedido INT,
    metodo_pago VARCHAR(50),
    estado ENUM('aprobado', 'rechazado') DEFAULT 'aprobado',
    fecha_pago DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (id_pedido) REFERENCES pedido(id_pedido)
);

CREATE TABLE factura (
    id_factura INT AUTO_INCREMENT PRIMARY KEY,
    id_pedido INT,
    fecha DATETIME DEFAULT CURRENT_TIMESTAMP,
    total DECIMAL(10,2),
    FOREIGN KEY (id_pedido) REFERENCES pedido(id_pedido)
);

-- 5. AUTOMATIZACIÓN (TRIGGERS)
-- Actualiza el stock automáticamente al insertar un detalle de pedido (Venta)
DELIMITER //
CREATE TRIGGER tr_actualizar_stock_venta
AFTER INSERT ON detalle_pedido
FOR EACH ROW
BEGIN
    UPDATE inventario 
    SET cantidad = cantidad - NEW.cantidad
    WHERE id_producto = NEW.id_producto;
END;
//
DELIMITER ;

-- 6. VISTAS DE CONTROL (REPORTES)
-- Vista para identificar productos que necesitan reabastecimiento (Punto de Reorden)
CREATE VIEW vista_alerta_stock AS
SELECT 
    p.nombre, 
    m.nombre AS marca, 
    i.cantidad AS stock_actual, 
    i.stock_minimo
FROM inventario i
JOIN producto p ON i.id_producto = p.id_producto
JOIN marcas m ON p.id_marca = m.id_marca
WHERE i.cantidad <= i.stock_minimo;

-- Registro de la orden de compra general
CREATE TABLE compra_proveedor (
    id_compra INT AUTO_INCREMENT PRIMARY KEY,
    id_proveedor INT,
    fecha_compra DATETIME DEFAULT CURRENT_TIMESTAMP,
    total_compra DECIMAL(10,2) DEFAULT 0.00,
    estado ENUM('solicitado', 'recibido', 'cancelado') DEFAULT 'solicitado',
    FOREIGN KEY (id_proveedor) REFERENCES proveedor(id_proveedor)
);

-- Detalle de qué productos y cuánta cantidad se compró
CREATE TABLE detalle_compra (
    id_detalle_compra INT AUTO_INCREMENT PRIMARY KEY,
    id_compra INT,
    id_producto INT,
    cantidad INT NOT NULL,
    precio_compra_unitario DECIMAL(10,2) NOT NULL,
    subtotal DECIMAL(10,2),
    FOREIGN KEY (id_compra) REFERENCES compra_proveedor(id_compra),
    FOREIGN KEY (id_producto) REFERENCES producto(id_producto)
);

DELIMITER //

CREATE TRIGGER tr_actualizar_stock_compra
AFTER UPDATE ON compra_proveedor
FOR EACH ROW
BEGIN
    -- Solo sumamos al inventario si el estado cambia a 'recibido'
    IF NEW.estado = 'recibido' AND OLD.estado = 'solicitado' THEN
        -- Usamos un cursor o una lógica de actualización basada en el detalle
        UPDATE inventario i
        JOIN detalle_compra dc ON i.id_producto = dc.id_producto
        SET i.cantidad = i.cantidad + dc.cantidad,
            i.fecha_actualizacion = CURRENT_TIMESTAMP
        WHERE dc.id_compra = NEW.id_compra;
    END IF;
END //

DELIMITER ;


-- 7. INSERCIÓN DE DATOS INICIALES (MUESTRA)
INSERT INTO categoria (nombre, descripcion) VALUES
('Tenis', 'Calzado deportivo casual'), ('Botas', 'Calzado alto'), ('Casuales', 'Uso diario');

INSERT INTO marcas (nombre) VALUES ('Nike'), ('Adidas'), ('Puma');

INSERT INTO producto (nombre, descripcion, precio, id_categoria, id_marca) VALUES
('Air Max 90', 'Tenis Nike clásicos', 350000, 1, 1),
('Ultraboost', 'Tenis Adidas running', 420000, 1, 2);

INSERT INTO inventario (id_producto, cantidad, stock_minimo, ubicacion_bodega) VALUES
(1, 20, 5, 'Pasillo A-1'),
(2, 15, 5, 'Pasillo A-2');

INSERT INTO usuario (nombre, correo, contraseña, rol) VALUES
('Admin Pro', 'admin@tienda.com', '123456', 'admin'),
('Cliente Test', 'cliente@gmail.com', '123456', 'cliente');