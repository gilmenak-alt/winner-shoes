-- Ejecutar sobre la base `tienda_calzadoo` después del script principal.
USE tienda_calzadoo;

CREATE TABLE IF NOT EXISTS movimiento_contable (
    id_movimiento INT AUTO_INCREMENT PRIMARY KEY,
    tipo ENUM('ingreso', 'egreso') NOT NULL,
    concepto VARCHAR(255) NOT NULL,
    monto DECIMAL(12,2) NOT NULL DEFAULT 0,
    fecha DATETIME DEFAULT CURRENT_TIMESTAMP,
    referencia VARCHAR(120),
    id_pedido INT NULL,
    FOREIGN KEY (id_pedido) REFERENCES pedido(id_pedido)
);

-- Categorías tipo tienda (nav estilo Nike), solo si no existen por nombre.
INSERT INTO categoria (nombre, descripcion)
SELECT nombre, descr FROM (SELECT 'Hombre' AS nombre, 'Línea caballero' AS descr) t
WHERE NOT EXISTS (SELECT 1 FROM categoria WHERE nombre = 'Hombre');
INSERT INTO categoria (nombre, descripcion)
SELECT nombre, descr FROM (SELECT 'Mujer' AS nombre, 'Línea dama' AS descr) t
WHERE NOT EXISTS (SELECT 1 FROM categoria WHERE nombre = 'Mujer');
INSERT INTO categoria (nombre, descripcion)
SELECT nombre, descr FROM (SELECT 'Niños' AS nombre, 'Línea infantil' AS descr) t
WHERE NOT EXISTS (SELECT 1 FROM categoria WHERE nombre = 'Niños');
