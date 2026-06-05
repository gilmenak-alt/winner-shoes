require('dotenv').config();
const fs = require('fs');
const express = require('express');
const path = require('path');
const session = require('express-session');
const pgSession = require('connect-pg-simple')(session);
const bcrypt = require('bcryptjs');
const multer = require('multer');
const PDFDocument = require('pdfkit');
const ExcelJS = require('exceljs');
const db = require('./db');

const app = express();
const port = process.env.PORT || 3000;
const isProd = process.env.NODE_ENV === 'production' || !!process.env.VERCEL;

// En Vercel el filesystem es de solo lectura; usamos /tmp
const uploadsDir = isProd
  ? '/tmp/uploads/devoluciones'
  : path.join(__dirname, '../public/uploads/devoluciones');
try { fs.mkdirSync(uploadsDir, { recursive: true }); } catch (_) {}

const uploadDev = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, uploadsDir),
    filename: (_req, file, cb) => {
      const safe = String(file.originalname || 'img').replace(/[^a-zA-Z0-9._-]/g, '_');
      cb(null, `${Date.now()}_${safe}`);
    },
  }),
  limits: { fileSize: 4 * 1024 * 1024, files: 5 },
});

app.use(express.json({ limit: '15mb' }));

// Necesario para que las cookies secure funcionen detrás del proxy de Vercel
app.set('trust proxy', 1);

const pgStore = new pgSession({
  pool: db.pool,
  tableName: 'session',
  createTableIfMissing: true,
});
pgStore.on('error', (e) => console.error('Session store error:', e.message));

app.use(
  session({
    store: pgStore,
    secret: process.env.SESSION_SECRET || 'calzado-dev-secret-cambiar',
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      maxAge: 86400000,
      sameSite: isProd ? 'none' : 'lax',
      secure: isProd,
    },
  })
);
app.use(express.static(path.join(__dirname, '../public')));

function requireAuth(req, res, next) {
  if (!req.session.userId) {
    return res.status(401).json({ message: 'Debe iniciar sesión' });
  }
  next();
}

function requireAdmin(req, res, next) {
  if (!req.session.userId || req.session.rol !== 'admin') {
    return res.status(403).json({ message: 'Solo administradores' });
  }
  next();
}

function verifyPassword(plain, stored) {
  if (!stored) return false;
  if (String(stored).startsWith('$2')) {
    return bcrypt.compareSync(plain, stored);
  }
  return plain === stored;
}

/* --- Auth --- */
app.post('/api/registro', async (req, res) => {
  const { nombre, correo, contraseña, telefono, direccion } = req.body;
  if (!nombre || !correo || !contraseña) {
    return res.status(400).json({ message: 'Nombre, correo y contraseña son obligatorios' });
  }
  try {
    const hash = bcrypt.hashSync(contraseña, 10);
    await db.query(
      'INSERT INTO usuario (nombre, correo, contraseña, telefono, direccion, rol) VALUES (?, ?, ?, ?, ?, ?)',
      [nombre, correo, hash, telefono || null, direccion || null, 'cliente']
    );
    res.json({ message: 'Usuario registrado correctamente' });
  } catch (e) {
    if (e.code === '23505' || e.code === 'ER_DUP_ENTRY') {
      return res.status(400).json({ message: 'El correo ya está registrado' });
    }
    console.error(e);
    res.status(500).json({ message: 'Error al registrar' });
  }
});

app.post('/api/login', async (req, res) => {
  const { correo, contraseña } = req.body;
  if (!correo || !contraseña) {
    return res.status(400).json({ message: 'Credenciales incompletas' });
  }
  try {
    const [rows] = await db.query('SELECT * FROM usuario WHERE correo = ? AND estado = TRUE', [correo]);
    if (rows.length === 0) {
      return res.status(401).json({ message: 'Credenciales inválidas' });
    }
    const user = rows[0];
    if (!verifyPassword(contraseña, user.contraseña)) {
      return res.status(401).json({ message: 'Credenciales inválidas' });
    }
    req.session.userId = user.id_usuario;
    req.session.rol = user.rol;
    req.session.nombre = user.nombre;
    req.session.correo = user.correo;
    req.session.telefono = user.telefono;
    req.session.direccion = user.direccion;
    res.json({
      user: {
        id_usuario: user.id_usuario,
        nombre: user.nombre,
        correo: user.correo,
        rol: user.rol,
        telefono: user.telefono,
        direccion: user.direccion,
      },
      redirect: user.rol === 'admin' ? '/dashboard_admin.html' : '/dashboard_cliente.html',
    });
  } catch (e) {
    console.error('LOGIN ERROR:', e);
    res.status(500).json({ message: 'Error del servidor', detail: e.message });
  }
});

/* ─── DIAGNÓSTICO (quitar en producción final) ─────────────────────────── */
app.get('/api/health', async (_req, res) => {
  try {
    const [rows] = await db.query('SELECT current_database() AS db, NOW() AS ts');
    res.json({ ok: true, db: rows[0]?.db, ts: rows[0]?.ts });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message, code: e.code });
  }
});

app.post('/api/logout', (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

app.get('/api/me', async (req, res) => {
  if (!req.session.userId) return res.json({ user: null });
  try {
    const [rows] = await db.query(
      'SELECT id_usuario, nombre, correo, rol, telefono, direccion FROM usuario WHERE id_usuario = ? AND estado = TRUE',
      [req.session.userId]
    );
    if (!rows.length) return res.json({ user: null });
    const u = rows[0];
    req.session.nombre = u.nombre;
    req.session.correo = u.correo;
    req.session.telefono = u.telefono;
    req.session.direccion = u.direccion;
    res.json({ user: u });
  } catch (e) {
    res.status(500).json({ message: 'Error' });
  }
});

app.patch('/api/me', requireAuth, async (req, res) => {
  const { nombre, telefono, direccion, correo } = req.body;
  try {
    if (correo && String(correo).trim() && correo !== req.session.correo) {
      const [dup] = await db.query('SELECT id_usuario FROM usuario WHERE correo = ? AND id_usuario <> ?', [
        correo.trim(),
        req.session.userId,
      ]);
      if (dup.length) return res.status(400).json({ message: 'El correo ya está en uso' });
    }
    const parts = [];
    const vals = [];
    if (nombre !== undefined && String(nombre).trim()) {
      parts.push('nombre = ?');
      vals.push(nombre.trim());
    }
    if (telefono !== undefined) {
      parts.push('telefono = ?');
      vals.push(telefono || null);
    }
    if (direccion !== undefined) {
      parts.push('direccion = ?');
      vals.push(direccion || null);
    }
    if (correo !== undefined && String(correo).trim()) {
      parts.push('correo = ?');
      vals.push(correo.trim());
    }
    if (parts.length) {
      vals.push(req.session.userId);
      await db.query(`UPDATE usuario SET ${parts.join(', ')} WHERE id_usuario = ?`, vals);
    }
    const [rows] = await db.query(
      'SELECT nombre, correo, telefono, direccion FROM usuario WHERE id_usuario = ?',
      [req.session.userId]
    );
    const u = rows[0];
    req.session.nombre = u.nombre;
    req.session.correo = u.correo;
    req.session.telefono = u.telefono;
    req.session.direccion = u.direccion;
    res.json({ ok: true, user: u });
  } catch (e) {
    res.status(500).json({ message: 'No se pudo actualizar' });
  }
});

async function logInvMov(conn, id_producto, tipo, cantidad, referencia, id_pedido) {
  try {
    await conn.query(
      `INSERT INTO inventario_movimiento (id_producto, tipo, cantidad, referencia, id_pedido) VALUES (?,?,?,?,?)`,
      [id_producto, tipo, cantidad, referencia || null, id_pedido || null]
    );
  } catch (_) {}
}

async function precioVentaProducto(conn, id_producto) {
  const [[row]] = await conn.query(
    `SELECT p.precio,
     o.porcentaje, o.activo,
     (o.fecha_inicio IS NULL OR o.fecha_inicio <= NOW()) AS fi_ok,
     (o.fecha_fin IS NULL OR o.fecha_fin >= NOW()) AS ff_ok
     FROM producto p
     LEFT JOIN oferta o ON o.id_producto = p.id_producto AND o.activo = TRUE
     WHERE p.id_producto = ?`,
    [id_producto]
  );
  if (!row) return null;
  let precio = Number(row.precio);
  if (row.porcentaje != null && row.activo && row.fi_ok && row.ff_ok) {
    precio = Math.round(precio * (1 - Number(row.porcentaje) / 100) * 100) / 100;
  }
  return precio;
}

/* --- Catálogo público (sin stock) --- */
const SQL_CATALOGO_BASE = `
  SELECT p.id_producto, p.nombre, p.descripcion, p.precio AS precio_lista, p.imagen,
         m.nombre AS marca, m.id_marca, c.nombre AS categoria, c.id_categoria,
         o.porcentaje AS oferta_porcentaje,
         CASE
           WHEN o.id_oferta IS NOT NULL AND o.activo = TRUE
            AND (o.fecha_inicio IS NULL OR o.fecha_inicio <= NOW())
            AND (o.fecha_fin IS NULL OR o.fecha_fin >= NOW())
           THEN ROUND(p.precio * (1 - o.porcentaje / 100), 2)
           ELSE p.precio
         END AS precio_venta
  FROM producto p
  JOIN marcas m ON p.id_marca = m.id_marca
  JOIN categoria c ON p.id_categoria = c.id_categoria
  LEFT JOIN oferta o ON o.id_producto = p.id_producto
  WHERE p.estado = TRUE`;

app.get('/api/productos', async (req, res) => {
  const { q, categoria, marca } = req.query;
  try {
    let sql = SQL_CATALOGO_BASE;
    const params = [];
    if (q) {
      sql += ' AND (p.nombre LIKE ? OR p.descripcion LIKE ? OR m.nombre LIKE ? OR c.nombre LIKE ?)';
      const term = `%${q}%`;
      params.push(term, term, term, term);
    }
    if (categoria) {
      sql += ' AND c.nombre = ?';
      params.push(categoria);
    }
    if (marca) {
      sql += ' AND m.nombre = ?';
      params.push(marca);
    }
    sql += ' ORDER BY p.id_producto DESC';
    const [rows] = await db.query(sql, params);
    res.json(rows);
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: 'Error al obtener productos' });
  }
});

app.get('/api/productos/:id', async (req, res) => {
  try {
    const [rows] = await db.query(`${SQL_CATALOGO_BASE} AND p.id_producto = ?`, [req.params.id]);
    if (rows.length === 0) return res.status(404).json({ message: 'No encontrado' });
    res.json(rows[0]);
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: 'Error' });
  }
});

app.get('/api/productos/:id/stock', requireAuth, async (req, res) => {
  try {
    const [[inv]] = await db.query(
      'SELECT COALESCE(i.cantidad,0) AS cantidad FROM inventario i WHERE i.id_producto = ?',
      [req.params.id]
    );
    res.json({ cantidad: inv ? inv.cantidad : 0 });
  } catch (e) {
    res.status(500).json({ message: 'Error' });
  }
});

app.get('/api/ofertas-activas', async (_req, res) => {
  try {
    const [rows] = await db.query(
      `${SQL_CATALOGO_BASE}
       AND o.id_oferta IS NOT NULL AND o.activo = TRUE
       AND (o.fecha_inicio IS NULL OR o.fecha_inicio <= NOW())
       AND (o.fecha_fin IS NULL OR o.fecha_fin >= NOW())
       ORDER BY o.porcentaje DESC LIMIT 24`
    );
    res.json(rows);
  } catch (e) {
    res.json([]);
  }
});

app.get('/api/marcas', async (_req, res) => {
  try {
    const [rows] = await db.query('SELECT * FROM marcas ORDER BY nombre');
    res.json(rows);
  } catch (e) {
    res.status(500).json({ message: 'Error' });
  }
});

app.get('/api/categorias', async (_req, res) => {
  try {
    const [rows] = await db.query('SELECT * FROM categoria ORDER BY nombre');
    res.json(rows);
  } catch (e) {
    res.status(500).json({ message: 'Error' });
  }
});

/* --- Pedidos cliente --- */
app.post('/api/pedidos', requireAuth, async (req, res) => {
  const { items, metodo_pago } = req.body;
  if (!items || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ message: 'El carrito está vacío' });
  }
  const metodo = metodo_pago || 'tarjeta_simulada';
  const userId = req.session.userId;

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    let total = 0;
    const lineas = [];
    for (const item of items) {
      const pid = Number(item.id_producto);
      const qty = parseInt(item.cantidad, 10);
      if (!pid || !qty || qty < 1) {
        throw new Error('Ítem inválido');
      }

      const [[prod]] = await conn.query(
        'SELECT id_producto FROM producto WHERE id_producto = ? AND estado = TRUE FOR UPDATE',
        [pid]
      );
      if (!prod) throw new Error(`Producto ${pid} no disponible`);

      const [[inv]] = await conn.query(
        'SELECT cantidad FROM inventario WHERE id_producto = ? FOR UPDATE',
        [pid]
      );
      const stock = inv ? inv.cantidad : 0;
      if (stock < qty) throw new Error(`Stock insuficiente: producto #${pid}`);

      const precioUnit = await precioVentaProducto(conn, pid);
      const subtotal = Math.round(precioUnit * qty * 100) / 100;
      total += subtotal;
      lineas.push({ id_producto: pid, cantidad: qty, precio_unitario: precioUnit, subtotal });
    }

    const [[pedidoIns]] = await conn.query(
      'INSERT INTO pedido (id_usuario, total, estado) VALUES (?, ?, ?) RETURNING id_pedido',
      [userId, total, 'pendiente']
    );
    const pedidoId = pedidoIns.id_pedido;

    for (const L of lineas) {
      await conn.query(
        `INSERT INTO detalle_pedido (id_pedido, id_producto, cantidad, precio_unitario, subtotal)
         VALUES (?,?,?,?,?)`,
        [pedidoId, L.id_producto, L.cantidad, L.precio_unitario, L.subtotal]
      );
      await logInvMov(conn, L.id_producto, 'salida', L.cantidad, `Venta pedido ${pedidoId}`, pedidoId);
    }

    await conn.query('INSERT INTO pago (id_pedido, metodo_pago, estado) VALUES (?,?,?)', [
      pedidoId,
      metodo,
      'aprobado',
    ]);
    await conn.query('UPDATE pedido SET estado = ? WHERE id_pedido = ?', ['pagado', pedidoId]);
    await conn.query('INSERT INTO factura (id_pedido, total) VALUES (?,?)', [pedidoId, total]);

    try {
      await conn.query(
        `INSERT INTO movimiento_contable (tipo, concepto, monto, referencia, id_pedido)
         VALUES ('ingreso', ?, ?, ?, ?)`,
        [`Venta pedido #${pedidoId}`, total, `PED-${pedidoId}`, pedidoId]
      );
    } catch (_) {
      /* tabla opcional hasta migración */
    }

    await conn.commit();
    res.json({ message: 'Pago confirmado y pedido registrado', id_pedido: pedidoId, total });
  } catch (err) {
    await conn.rollback();
    console.error(err);
    res.status(400).json({ message: err.message || 'No se pudo procesar el pedido' });
  } finally {
    conn.release();
  }
});

app.get('/api/mis-pedidos', requireAuth, async (req, res) => {
  try {
    const [pedidos] = await db.query(
      `SELECT id_pedido, fecha, total, estado, tracking_codigo, fecha_enviado, fecha_entregado
       FROM pedido WHERE id_usuario = ? ORDER BY fecha DESC`,
      [req.session.userId]
    );
    const result = [];
    for (const p of pedidos) {
      const [det] = await db.query(
        `SELECT d.*, pr.nombre AS nombre_producto FROM detalle_pedido d
         JOIN producto pr ON pr.id_producto = d.id_producto WHERE d.id_pedido = ?`,
        [p.id_pedido]
      );
      const [pagos] = await db.query('SELECT * FROM pago WHERE id_pedido = ?', [p.id_pedido]);
      result.push({ ...p, detalles: det, pagos });
    }
    res.json(result);
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: 'Error' });
  }
});

app.get('/api/mis-devoluciones', requireAuth, async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT d.*, p.nombre AS nombre_producto FROM devolucion d
       JOIN producto p ON p.id_producto = d.id_producto
       WHERE d.id_usuario = ? ORDER BY d.fecha_creacion DESC`,
      [req.session.userId]
    );
    res.json(rows);
  } catch (e) {
    res.status(500).json({ message: 'Error' });
  }
});

app.post('/api/devoluciones', requireAuth, uploadDev.array('evidencias', 5), async (req, res) => {
  const id_pedido = Number(req.body.id_pedido);
  const id_producto = Number(req.body.id_producto);
  const motivo = (req.body.motivo || '').trim();
  const id_detalle = req.body.id_detalle_pedido ? Number(req.body.id_detalle_pedido) : null;
  if (!id_pedido || !id_producto || !motivo) {
    return res.status(400).json({ message: 'Pedido, producto y motivo son obligatorios' });
  }
  const evidencias = JSON.stringify((req.files || []).map((f) => `/uploads/devoluciones/${f.filename}`));
  try {
    const [[ped]] = await db.query(
      'SELECT id_pedido FROM pedido WHERE id_pedido = ? AND id_usuario = ?',
      [id_pedido, req.session.userId]
    );
    if (!ped) return res.status(403).json({ message: 'Pedido no válido' });
    const [det] = await db.query(
      'SELECT id_detalle FROM detalle_pedido WHERE id_pedido = ? AND id_producto = ? LIMIT 1',
      [id_pedido, id_producto]
    );
    if (!det.length) return res.status(400).json({ message: 'El producto no pertenece a ese pedido' });
    await db.query(
      `INSERT INTO devolucion (id_usuario, id_pedido, id_producto, id_detalle_pedido, motivo, evidencias, estado)
       VALUES (?,?,?,?,?,?, 'solicitada')`,
      [req.session.userId, id_pedido, id_producto, id_detalle || det[0].id_detalle, motivo, evidencias]
    );
    res.json({ message: 'Solicitud registrada. Un asesor revisará las evidencias.' });
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: 'No se pudo registrar la devolución' });
  }
});

/* --- Admin productos --- */
app.get('/api/admin/productos', requireAdmin, async (_req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT p.*, m.nombre AS marca, c.nombre AS categoria,
      COALESCE(i.cantidad,0) AS stock
      FROM producto p
      JOIN marcas m ON p.id_marca = m.id_marca
      JOIN categoria c ON p.id_categoria = c.id_categoria
      LEFT JOIN inventario i ON i.id_producto = p.id_producto
      ORDER BY p.id_producto DESC`);
    res.json(rows);
  } catch (e) {
    res.status(500).json({ message: 'Error' });
  }
});

app.post('/api/admin/productos', requireAdmin, async (req, res) => {
  const { nombre, descripcion, precio, id_categoria, id_marca, imagen, stock_inicial } = req.body;
  if (!nombre || precio == null || !id_categoria || !id_marca) {
    return res.status(400).json({ message: 'Nombre, precio, categoría y marca son obligatorios' });
  }
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    const [[r]] = await conn.query(
      `INSERT INTO producto (nombre, descripcion, precio, id_categoria, id_marca, imagen, estado)
       VALUES (?,?,?,?,?,?,TRUE) RETURNING id_producto`,
      [nombre, descripcion || '', precio, id_categoria, id_marca, imagen || null]
    );
    const pid = r.id_producto;
    const stock = Math.max(0, parseInt(stock_inicial, 10) || 0);
    await conn.query(
      `INSERT INTO inventario (id_producto, cantidad, stock_minimo) VALUES (?,?,5)`,
      [pid, stock]
    );
    await conn.commit();
    res.json({ id_producto: pid });
  } catch (e) {
    await conn.rollback();
    console.error(e);
    res.status(500).json({ message: 'Error al crear producto' });
  } finally {
    conn.release();
  }
});

app.put('/api/admin/productos/:id', requireAdmin, async (req, res) => {
  const id = req.params.id;
  const { nombre, descripcion, precio, id_categoria, id_marca, imagen, estado } = req.body;
  try {
    await db.query(
      `UPDATE producto SET nombre=?, descripcion=?, precio=?, id_categoria=?, id_marca=?, imagen=?, estado=?
       WHERE id_producto=?`,
      [
        nombre,
        descripcion,
        precio,
        id_categoria,
        id_marca,
        imagen,
        estado !== false && estado !== 0,
        id,
      ]
    );
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ message: 'Error' });
  }
});

app.delete('/api/admin/productos/:id', requireAdmin, async (req, res) => {
  try {
    await db.query('UPDATE producto SET estado = FALSE WHERE id_producto = ?', [req.params.id]);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ message: 'Error' });
  }
});

/* --- Admin inventario --- */
app.get('/api/admin/inventario', requireAdmin, async (_req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT i.*, p.nombre AS producto, m.nombre AS marca
      FROM inventario i
      JOIN producto p ON p.id_producto = i.id_producto
      JOIN marcas m ON p.id_marca = m.id_marca`);
    res.json(rows);
  } catch (e) {
    res.status(500).json({ message: 'Error' });
  }
});

app.get('/api/admin/inventario/alertas', requireAdmin, async (_req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT p.id_producto, p.nombre, m.nombre AS marca, i.cantidad, i.stock_minimo
      FROM inventario i
      JOIN producto p ON i.id_producto = p.id_producto
      JOIN marcas m ON p.id_marca = m.id_marca
      WHERE i.cantidad <= i.stock_minimo AND p.estado = TRUE`);
    res.json(rows);
  } catch (e) {
    res.status(500).json({ message: 'Error' });
  }
});

app.patch('/api/admin/inventario/:productoId', requireAdmin, async (req, res) => {
  const { cantidad, stock_minimo } = req.body;
  const conn = await db.getConnection();
  try {
    if (cantidad != null) {
      const [[before]] = await conn.query('SELECT cantidad FROM inventario WHERE id_producto = ?', [
        req.params.productoId,
      ]);
      await conn.query('UPDATE inventario SET cantidad = ? WHERE id_producto = ?', [
        cantidad,
        req.params.productoId,
      ]);
      const diff = Number(cantidad) - Number(before?.cantidad || 0);
      if (diff !== 0) {
        await logInvMov(conn, req.params.productoId, 'ajuste', Math.abs(diff), `Ajuste manual a ${cantidad}`, null);
      }
    }
    if (stock_minimo != null) {
      await conn.query('UPDATE inventario SET stock_minimo = ? WHERE id_producto = ?', [
        stock_minimo,
        req.params.productoId,
      ]);
    }
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ message: 'Error' });
  } finally {
    conn.release();
  }
});

app.post('/api/admin/inventario/entrada', requireAdmin, async (req, res) => {
  const { id_producto, cantidad } = req.body;
  const qty = parseInt(cantidad, 10);
  if (!id_producto || !qty || qty < 1) {
    return res.status(400).json({ message: 'Producto y cantidad válidos requeridos' });
  }
  const conn = await db.getConnection();
  try {
    await conn.query('UPDATE inventario SET cantidad = cantidad + ? WHERE id_producto = ?', [
      qty,
      id_producto,
    ]);
    await logInvMov(conn, id_producto, 'entrada', qty, 'Entrada manual / recepción', null);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ message: 'Error al registrar entrada' });
  } finally {
    conn.release();
  }
});

/* --- Admin proveedores --- */
app.get('/api/admin/proveedores', requireAdmin, async (_req, res) => {
  try {
    const [rows] = await db.query('SELECT * FROM proveedor ORDER BY nombre');
    res.json(rows);
  } catch (e) {
    res.status(500).json({ message: 'Error' });
  }
});

app.post('/api/admin/proveedores', requireAdmin, async (req, res) => {
  const { nombre, telefono, correo, direccion } = req.body;
  if (!nombre) return res.status(400).json({ message: 'Nombre requerido' });
  try {
    const [[r]] = await db.query(
      'INSERT INTO proveedor (nombre, telefono, correo, direccion) VALUES (?,?,?,?) RETURNING id_proveedor',
      [nombre, telefono || null, correo || null, direccion || null]
    );
    res.json({ id_proveedor: r.id_proveedor });
  } catch (e) {
    res.status(500).json({ message: 'Error' });
  }
});

app.put('/api/admin/proveedores/:id', requireAdmin, async (req, res) => {
  const { nombre, telefono, correo, direccion } = req.body;
  try {
    await db.query(
      'UPDATE proveedor SET nombre=?, telefono=?, correo=?, direccion=? WHERE id_proveedor=?',
      [nombre, telefono, correo, direccion, req.params.id]
    );
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ message: 'Error' });
  }
});

app.delete('/api/admin/proveedores/:id', requireAdmin, async (req, res) => {
  try {
    await db.query('DELETE FROM proveedor WHERE id_proveedor = ?', [req.params.id]);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ message: 'No se puede eliminar si tiene compras asociadas' });
  }
});

app.get('/api/admin/producto-proveedor', requireAdmin, async (_req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT pp.id_producto, pp.id_proveedor, p.nombre AS producto, pr.nombre AS proveedor
      FROM producto_proveedor pp
      JOIN producto p ON p.id_producto = pp.id_producto
      JOIN proveedor pr ON pr.id_proveedor = pp.id_proveedor`);
    res.json(rows);
  } catch (e) {
    res.status(500).json({ message: 'Error' });
  }
});

app.post('/api/admin/producto-proveedor', requireAdmin, async (req, res) => {
  const { id_producto, id_proveedor } = req.body;
  try {
    await db.query(
      'INSERT INTO producto_proveedor (id_producto, id_proveedor) VALUES (?,?) ON CONFLICT DO NOTHING',
      [id_producto, id_proveedor]
    );
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ message: 'Error' });
  }
});

app.delete('/api/admin/producto-proveedor', requireAdmin, async (req, res) => {
  const { id_producto, id_proveedor } = req.body;
  try {
    await db.query('DELETE FROM producto_proveedor WHERE id_producto=? AND id_proveedor=?', [
      id_producto,
      id_proveedor,
    ]);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ message: 'Error' });
  }
});

/* --- Admin usuarios --- */
app.get('/api/admin/usuarios', requireAdmin, async (_req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT id_usuario, nombre, correo, telefono, direccion, rol, estado, fecha_registro
       FROM usuario ORDER BY id_usuario DESC`
    );
    res.json(rows);
  } catch (e) {
    res.status(500).json({ message: 'Error' });
  }
});

app.patch('/api/admin/usuarios/:id', requireAdmin, async (req, res) => {
  const id = Number(req.params.id);
  const { rol, estado } = req.body;
  if (id === req.session.userId && estado === false) {
    return res.status(400).json({ message: 'No puede desactivarse a sí mismo' });
  }
  try {
    const parts = [];
    const vals = [];
    if (rol) {
      parts.push('rol = ?');
      vals.push(rol);
    }
    if (estado !== undefined) {
      parts.push('estado = ?');
      vals.push(!!estado);
    }
    if (!parts.length) return res.json({ ok: true });
    vals.push(id);
    await db.query(`UPDATE usuario SET ${parts.join(', ')} WHERE id_usuario = ?`, vals);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ message: 'Error' });
  }
});

/* --- Admin pedidos (todos) --- */
app.get('/api/admin/pedidos', requireAdmin, async (_req, res) => {
  try {
    const [pedidos] = await db.query(`
      SELECT pe.*, u.nombre AS cliente_nombre, u.correo AS cliente_correo
      FROM pedido pe
      JOIN usuario u ON u.id_usuario = pe.id_usuario
      ORDER BY pe.fecha DESC
      LIMIT 200`);
    const result = [];
    for (const p of pedidos) {
      const [det] = await db.query(
        `SELECT d.*, pr.nombre AS nombre_producto FROM detalle_pedido d
         JOIN producto pr ON pr.id_producto = d.id_producto WHERE d.id_pedido = ?`,
        [p.id_pedido]
      );
      result.push({ ...p, detalles: det });
    }
    res.json(result);
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: 'Error' });
  }
});

app.patch('/api/admin/pedidos/:id/estado', requireAdmin, async (req, res) => {
  const { estado, tracking_codigo } = req.body;
  const allowed = ['pendiente', 'pagado', 'enviado', 'entregado'];
  if (!allowed.includes(estado)) {
    return res.status(400).json({ message: 'Estado no válido' });
  }
  try {
    let sql =
      'UPDATE pedido SET estado = ?, tracking_codigo = COALESCE(?, tracking_codigo) WHERE id_pedido = ?';
    const params = [estado, tracking_codigo || null, req.params.id];
    if (estado === 'enviado') {
      sql =
        'UPDATE pedido SET estado = ?, fecha_enviado = COALESCE(fecha_enviado, NOW()), tracking_codigo = COALESCE(?, tracking_codigo) WHERE id_pedido = ?';
    }
    if (estado === 'entregado') {
      sql =
        'UPDATE pedido SET estado = ?, fecha_entregado = COALESCE(fecha_entregado, NOW()), tracking_codigo = COALESCE(?, tracking_codigo) WHERE id_pedido = ?';
    }
    await db.query(sql, params);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ message: 'Error' });
  }
});

app.post('/api/admin/compra-proveedor', requireAdmin, async (req, res) => {
  const { id_proveedor, items } = req.body;
  if (!id_proveedor || !items || !Array.isArray(items) || !items.length) {
    return res.status(400).json({ message: 'Proveedor e ítems requeridos' });
  }
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    let total = 0;
    const lineas = [];
    for (const it of items) {
      const pid = Number(it.id_producto);
      const qty = parseInt(it.cantidad, 10);
      const punit = Number(it.precio_compra_unitario);
      if (!pid || !qty || !punit) throw new Error('Cada ítem necesita producto, cantidad y precio unitario');
      const sub = qty * punit;
      total += sub;
      lineas.push({ pid, qty, punit, sub });
    }
    const [[ins]] = await conn.query(
      'INSERT INTO compra_proveedor (id_proveedor, total_compra, estado) VALUES (?,?,?) RETURNING id_compra',
      [id_proveedor, total, 'solicitado']
    );
    const idCompra = ins.id_compra;
    for (const L of lineas) {
      await conn.query(
        `INSERT INTO detalle_compra (id_compra, id_producto, cantidad, precio_compra_unitario, subtotal)
         VALUES (?,?,?,?,?)`,
        [idCompra, L.pid, L.qty, L.punit, L.sub]
      );
    }
    await conn.commit();
    res.json({ id_compra: idCompra, message: 'Pedido a proveedor creado (estado solicitado)' });
  } catch (err) {
    await conn.rollback();
    res.status(400).json({ message: err.message || 'Error' });
  } finally {
    conn.release();
  }
});

app.patch('/api/admin/compra-proveedor/:id/recibir', requireAdmin, async (req, res) => {
  try {
    await db.query('UPDATE compra_proveedor SET estado = ? WHERE id_compra = ?', ['recibido', req.params.id]);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ message: 'Error al marcar como recibido' });
  }
});

app.get('/api/admin/compras-proveedor', requireAdmin, async (_req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT c.*, p.nombre AS proveedor FROM compra_proveedor c
       JOIN proveedor p ON p.id_proveedor = c.id_proveedor ORDER BY c.id_compra DESC LIMIT 120`
    );
    res.json(rows);
  } catch (e) {
    res.json([]);
  }
});

app.get('/api/admin/ofertas', requireAdmin, async (_req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT o.*, p.nombre AS producto, p.precio AS precio_lista FROM oferta o
       JOIN producto p ON p.id_producto = o.id_producto ORDER BY o.id_oferta DESC`
    );
    res.json(rows);
  } catch (e) {
    res.json([]);
  }
});

app.post('/api/admin/ofertas', requireAdmin, async (req, res) => {
  const { id_producto, porcentaje, activo, fecha_inicio, fecha_fin } = req.body;
  if (!id_producto || porcentaje == null) {
    return res.status(400).json({ message: 'Producto y porcentaje requeridos' });
  }
  try {
    await db.query(
      `INSERT INTO oferta (id_producto, porcentaje, activo, fecha_inicio, fecha_fin)
       VALUES (?,?,?,?,?)
       ON CONFLICT (id_producto) DO UPDATE SET
         porcentaje = EXCLUDED.porcentaje,
         activo = EXCLUDED.activo,
         fecha_inicio = EXCLUDED.fecha_inicio,
         fecha_fin = EXCLUDED.fecha_fin`,
      [
        id_producto,
        porcentaje,
        activo !== false,
        fecha_inicio || null,
        fecha_fin || null,
      ]
    );
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: 'No se pudo guardar la oferta' });
  }
});

app.delete('/api/admin/ofertas/:id', requireAdmin, async (req, res) => {
  try {
    await db.query('DELETE FROM oferta WHERE id_oferta = ?', [req.params.id]);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ message: 'Error' });
  }
});

app.put('/api/admin/ofertas/:id', requireAdmin, async (req, res) => {
  const { porcentaje, activo, fecha_inicio, fecha_fin } = req.body;
  try {
    await db.query(
      `UPDATE oferta SET porcentaje=?, activo=?, fecha_inicio=?, fecha_fin=? WHERE id_oferta=?`,
      [porcentaje, activo !== false, fecha_inicio || null, fecha_fin || null, req.params.id]
    );
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ message: 'Error' });
  }
});

app.get('/api/admin/devoluciones', requireAdmin, async (_req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT d.*, u.nombre AS cliente, u.correo, p.nombre AS nombre_producto
       FROM devolucion d
       JOIN usuario u ON u.id_usuario = d.id_usuario
       JOIN producto p ON p.id_producto = d.id_producto
       ORDER BY d.fecha_creacion DESC`
    );
    res.json(rows);
  } catch (e) {
    res.json([]);
  }
});

app.patch('/api/admin/devoluciones/:id/estado', requireAdmin, async (req, res) => {
  const { estado } = req.body;
  const ok = ['solicitada', 'en_revision', 'aprobada', 'rechazada', 'completada'];
  if (!ok.includes(estado)) return res.status(400).json({ message: 'Estado inválido' });
  try {
    await db.query('UPDATE devolucion SET estado = ? WHERE id_devolucion = ?', [estado, req.params.id]);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ message: 'Error' });
  }
});

function periodoWhere(alias, desde, hasta, params) {
  let w = '';
  if (desde) {
    w += ` AND ${alias}.fecha >= ?`;
    params.push(desde);
  }
  if (hasta) {
    w += ` AND ${alias}.fecha < DATE_ADD(?, INTERVAL 1 DAY)`;
    params.push(hasta);
  }
  return w;
}

app.get('/api/admin/reportes/consulta', requireAdmin, async (req, res) => {
  const { tipo, desde, hasta } = req.query;
  const params = [];
  try {
    switch (tipo) {
      case 'ventas_diarias': {
        let w = ` WHERE estado IN ('pagado','enviado','entregado')`;
        w += periodoWhere('pedido', desde, hasta, params);
        const [rows] = await db.query(
          `SELECT DATE(fecha) AS etiqueta, COUNT(*) AS valor, SUM(total) AS monto FROM pedido ${w} GROUP BY DATE(fecha) ORDER BY etiqueta`,
          params
        );
        return res.json({ titulo: 'Ventas diarias', filas: rows, chart: { labels: rows.map((r) => r.etiqueta), values: rows.map((r) => Number(r.monto)) } });
      }
      case 'ventas_semanales': {
        const p = [];
        let w = ` WHERE estado IN ('pagado','enviado','entregado')`;
        w += periodoWhere('pedido', desde, hasta, p);
        const [rows] = await db.query(
          `SELECT YEARWEEK(fecha,1) AS etiqueta, COUNT(*) AS pedidos, SUM(total) AS monto FROM pedido ${w} GROUP BY YEARWEEK(fecha,1) ORDER BY etiqueta`,
          p
        );
        return res.json({ titulo: 'Ventas semanales', filas: rows, chart: { labels: rows.map((r) => String(r.etiqueta)), values: rows.map((r) => Number(r.monto)) } });
      }
      case 'ventas_mensuales': {
        const p = [];
        let w = ` WHERE estado IN ('pagado','enviado','entregado')`;
        w += periodoWhere('pedido', desde, hasta, p);
        const [rows] = await db.query(
          `SELECT DATE_FORMAT(fecha,'%Y-%m') AS etiqueta, COUNT(*) AS pedidos, SUM(total) AS monto FROM pedido ${w} GROUP BY DATE_FORMAT(fecha,'%Y-%m') ORDER BY etiqueta`,
          p
        );
        return res.json({ titulo: 'Ventas mensuales', filas: rows, chart: { labels: rows.map((r) => r.etiqueta), values: rows.map((r) => Number(r.monto)) } });
      }
      case 'productos_mas_vendidos': {
        const p = [];
        let sql = `SELECT pr.nombre AS etiqueta, SUM(d.cantidad) AS unidades, SUM(d.subtotal) AS monto
          FROM detalle_pedido d JOIN pedido pe ON pe.id_pedido=d.id_pedido JOIN producto pr ON pr.id_producto=d.id_producto
          WHERE pe.estado IN ('pagado','enviado','entregado')`;
        if (desde) {
          sql += ' AND pe.fecha >= ?';
          p.push(desde);
        }
        if (hasta) {
          sql += ' AND pe.fecha < DATE_ADD(?, INTERVAL 1 DAY)';
          p.push(hasta);
        }
        sql += ' GROUP BY pr.id_producto, pr.nombre ORDER BY unidades DESC LIMIT 30';
        const [rows] = await db.query(sql, p);
        return res.json({ titulo: 'Productos más vendidos', filas: rows, chart: { labels: rows.map((r) => r.etiqueta), values: rows.map((r) => Number(r.unidades)) } });
      }
      case 'productos_menos_vendidos': {
        const p = [];
        let sub = `SELECT d.id_producto, SUM(d.cantidad) AS unidades FROM detalle_pedido d
          JOIN pedido pe ON pe.id_pedido=d.id_pedido WHERE pe.estado IN ('pagado','enviado','entregado')`;
        if (desde) {
          sub += ' AND pe.fecha >= ?';
          p.push(desde);
        }
        if (hasta) {
          sub += ' AND pe.fecha < DATE_ADD(?, INTERVAL 1 DAY)';
          p.push(hasta);
        }
        sub += ' GROUP BY d.id_producto';
        const [rows] = await db.query(
          `SELECT pr.nombre AS etiqueta, COALESCE(t.unidades,0) AS unidades FROM producto pr
           LEFT JOIN (${sub}) t ON t.id_producto=pr.id_producto WHERE pr.estado=TRUE
           ORDER BY unidades ASC, pr.nombre LIMIT 40`,
          p
        );
        return res.json({ titulo: 'Productos menos vendidos', filas: rows, chart: { labels: rows.map((r) => r.etiqueta), values: rows.map((r) => Number(r.unidades)) } });
      }
      case 'ganancias_totales': {
        const p = [];
        let w = ` WHERE pe.estado IN ('pagado','enviado','entregado')`;
        if (desde) {
          w += ' AND pe.fecha >= ?';
          p.push(desde);
        }
        if (hasta) {
          w += ' AND pe.fecha < DATE_ADD(?, INTERVAL 1 DAY)';
          p.push(hasta);
        }
        const [[sum]] = await db.query(
          `SELECT COALESCE(SUM(d.subtotal),0) AS ventas,
           COALESCE(SUM(d.cantidad * COALESCE(inv.costo_promedio,0)),0) AS costo_estimado
           FROM detalle_pedido d
           JOIN pedido pe ON pe.id_pedido=d.id_pedido
           LEFT JOIN inventario inv ON inv.id_producto=d.id_producto ${w}`,
          p
        );
        const ganancia = Number(sum.ventas) - Number(sum.costo_estimado);
        return res.json({
          titulo: 'Ganancias totales (ventas − costo promedio inventario)',
          filas: [{ concepto: 'Ventas', valor: sum.ventas }, { concepto: 'Costo estimado', valor: sum.costo_estimado }, { concepto: 'Ganancia', valor: ganancia }],
          chart: { labels: ['Ventas', 'Costo', 'Ganancia'], values: [Number(sum.ventas), Number(sum.costo_estimado), ganancia] },
        });
      }
      case 'inventario_movimientos': {
        const p = [];
        let w = ' WHERE 1=1';
        if (desde) {
          w += ' AND m.fecha >= ?';
          p.push(desde);
        }
        if (hasta) {
          w += ' AND m.fecha < DATE_ADD(?, INTERVAL 1 DAY)';
          p.push(hasta);
        }
        const [rows] = await db.query(
          `SELECT m.fecha, m.tipo, m.cantidad, m.referencia, p.nombre AS producto
           FROM inventario_movimiento m JOIN producto p ON p.id_producto=m.id_producto ${w} ORDER BY m.fecha DESC LIMIT 500`,
          p
        );
        return res.json({ titulo: 'Entradas y salidas de inventario', filas: rows, chart: null });
      }
      case 'historial_compras':
      case 'ingresos_generados':
      case 'facturacion': {
        const p = [];
        let w = ` WHERE pe.estado IN ('pagado','enviado','entregado')`;
        if (desde) {
          w += ' AND pe.fecha >= ?';
          p.push(desde);
        }
        if (hasta) {
          w += ' AND pe.fecha < DATE_ADD(?, INTERVAL 1 DAY)';
          p.push(hasta);
        }
        if (tipo === 'facturacion') {
          const [rows] = await db.query(
            `SELECT f.id_factura, f.fecha, f.total, pe.id_pedido, u.nombre AS cliente
             FROM factura f
             JOIN pedido pe ON pe.id_pedido=f.id_pedido
             JOIN usuario u ON u.id_usuario=pe.id_usuario ${w} ORDER BY f.fecha DESC LIMIT 300`,
            p
          );
          return res.json({ titulo: 'Facturación', filas: rows, chart: null });
        }
        const [rows] = await db.query(
          `SELECT pe.id_pedido, pe.fecha, pe.total, pe.estado, u.nombre AS cliente, u.correo FROM pedido pe
           JOIN usuario u ON u.id_usuario=pe.id_usuario ${w} ORDER BY pe.fecha DESC LIMIT 300`,
          p
        );
        const titulo = tipo === 'ingresos_generados' ? 'Ingresos generados' : 'Historial de compras';
        return res.json({ titulo, filas: rows, chart: { labels: rows.slice(0, 15).map((r) => String(r.id_pedido)), values: rows.slice(0, 15).map((r) => Number(r.total)) } });
      }
      case 'productos_devueltos': {
        const [rows] = await db.query(
          `SELECT d.estado, COUNT(*) AS casos, p.nombre FROM devolucion d
           JOIN producto p ON p.id_producto=d.id_producto GROUP BY d.estado, p.id_producto, p.nombre ORDER BY casos DESC`
        );
        return res.json({ titulo: 'Productos devueltos (solicitudes)', filas: rows, chart: { labels: rows.map((r) => r.nombre), values: rows.map((r) => Number(r.casos)) } });
      }
      case 'tiempo_promedio_entrega': {
        const p = [];
        let w = ` WHERE pe.estado='entregado' AND pe.fecha_entregado IS NOT NULL`;
        if (desde) {
          w += ' AND pe.fecha >= ?';
          p.push(desde);
        }
        if (hasta) {
          w += ' AND pe.fecha < DATE_ADD(?, INTERVAL 1 DAY)';
          p.push(hasta);
        }
        const [[avg]] = await db.query(
          `SELECT AVG(TIMESTAMPDIFF(HOUR, pe.fecha, pe.fecha_entregado)) AS horas_promedio FROM pedido pe ${w}`,
          p
        );
        return res.json({
          titulo: 'Tiempo promedio de entrega (horas)',
          filas: [{ horas_promedio: avg.horas_promedio }],
          chart: { labels: ['Horas'], values: [Number(avg.horas_promedio) || 0] },
        });
      }
      case 'seguimiento_envios': {
        const [rows] = await db.query(
          `SELECT id_pedido, fecha, estado, tracking_codigo, fecha_enviado, fecha_entregado, total FROM pedido
           WHERE estado IN ('enviado','entregado','pagado') ORDER BY fecha DESC LIMIT 200`
        );
        return res.json({ titulo: 'Seguimiento de envíos', filas: rows, chart: null });
      }
      case 'productos_mas_comprados_clientes': {
        const p = [];
        let sql = `SELECT u.nombre AS cliente, pr.nombre AS producto, SUM(d.cantidad) AS unidades
          FROM detalle_pedido d
          JOIN pedido pe ON pe.id_pedido=d.id_pedido AND pe.estado IN ('pagado','enviado','entregado')
          JOIN usuario u ON u.id_usuario=pe.id_usuario
          JOIN producto pr ON pr.id_producto=d.id_producto WHERE 1=1`;
        if (desde) {
          sql += ' AND pe.fecha >= ?';
          p.push(desde);
        }
        if (hasta) {
          sql += ' AND pe.fecha < DATE_ADD(?, INTERVAL 1 DAY)';
          p.push(hasta);
        }
        sql += ' GROUP BY u.id_usuario, pr.id_producto, u.nombre, pr.nombre ORDER BY unidades DESC LIMIT 80';
        const [rows] = await db.query(sql, p);
        return res.json({ titulo: 'Productos más comprados por clientes', filas: rows, chart: null });
      }
      default:
        return res.status(400).json({ message: 'Tipo de reporte no reconocido' });
    }
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: e.message || 'Error en reporte' });
  }
});

app.post('/api/admin/export/pdf', requireAdmin, async (req, res) => {
  const { titulo, filas, headers, chartBase64 } = req.body;
  try {
    const doc = new PDFDocument({ margin: 36, size: 'A4' });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="reporte-winner-shoes.pdf"');
    doc.pipe(res);
    doc.fontSize(16).text(titulo || 'Reporte', { align: 'center' });
    doc.moveDown();
    if (chartBase64) {
      const b64 = chartBase64.replace(/^data:image\/\w+;base64,/, '');
      const buf = Buffer.from(b64, 'base64');
      doc.image(buf, { fit: [520, 220], align: 'center' });
      doc.moveDown();
    }
    if (Array.isArray(filas) && filas.length) {
      const h = headers || Object.keys(filas[0]);
      doc.fontSize(10);
      doc.text(h.join('  |  '), { width: 520 });
      doc.moveDown(0.3);
      filas.slice(0, 80).forEach((row) => {
        const line = h.map((k) => String(row[k] ?? '')).join('  |  ');
        doc.text(line, { width: 520 });
      });
    }
    doc.end();
  } catch (e) {
    console.error(e);
    if (!res.headersSent) res.status(500).json({ message: 'Error PDF' });
  }
});

app.post('/api/admin/export/xlsx', requireAdmin, async (req, res) => {
  const { titulo, filas, headers, chartBase64 } = req.body;
  try {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Datos');
    ws.addRow([titulo || 'Reporte']);
    const h = headers || (filas && filas.length ? Object.keys(filas[0]) : []);
    if (h.length) ws.addRow(h);
    (filas || []).forEach((row) => {
      ws.addRow(h.map((k) => row[k]));
    });
    if (chartBase64) {
      const b64 = chartBase64.replace(/^data:image\/\w+;base64,/, '');
      const buf = Buffer.from(b64, 'base64');
      const imgId = wb.addImage({ base64: buf, extension: 'png' });
      ws.addImage(imgId, {
        tl: { col: 0, row: (filas?.length || 0) + 4 },
        ext: { width: 480, height: 220 },
      });
    }
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="reporte-winner-shoes.xlsx"');
    await wb.xlsx.write(res);
  } catch (e) {
    console.error(e);
    if (!res.headersSent) res.status(500).json({ message: 'Error Excel' });
  }
});

/* --- Reportes --- */
app.get('/api/admin/reportes/ventas', requireAdmin, async (req, res) => {
  const { desde, hasta } = req.query;
  try {
    let filt = ` WHERE estado IN ('pagado','enviado','entregado')`;
    const params = [];
    if (desde) {
      filt += ' AND fecha >= ?';
      params.push(desde);
    }
    if (hasta) {
      filt += ' AND fecha < DATE_ADD(?, INTERVAL 1 DAY)';
      params.push(hasta);
    }
    const [porDia] = await db.query(
      `SELECT DATE(fecha) AS dia, COUNT(*) AS num_pedidos, SUM(total) AS ingresos
       FROM pedido ${filt} GROUP BY DATE(fecha) ORDER BY dia`,
      params
    );
    const [tot] = await db.query(
      `SELECT COUNT(*) AS pedidos, COALESCE(SUM(total),0) AS total FROM pedido ${filt}`,
      params
    );
    res.json({ por_dia: porDia, resumen: tot[0] });
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: 'Error' });
  }
});

app.get('/api/admin/reportes/top-productos', requireAdmin, async (req, res) => {
  const { desde, hasta, limite } = req.query;
  const lim = Math.min(parseInt(limite, 10) || 10, 50);
  try {
    let sql = `
      SELECT pr.id_producto, pr.nombre, SUM(d.cantidad) AS unidades, SUM(d.subtotal) AS monto
      FROM detalle_pedido d
      JOIN pedido pe ON pe.id_pedido = d.id_pedido
      JOIN producto pr ON pr.id_producto = d.id_producto
      WHERE pe.estado IN ('pagado','enviado','entregado')`;
    const params = [];
    if (desde) {
      sql += ' AND pe.fecha >= ?';
      params.push(desde);
    }
    if (hasta) {
      sql += ' AND pe.fecha < DATE_ADD(?, INTERVAL 1 DAY)';
      params.push(hasta);
    }
    sql += ' GROUP BY pr.id_producto, pr.nombre ORDER BY unidades DESC LIMIT ?';
    params.push(lim);
    const [rows] = await db.query(sql, params);
    res.json(rows);
  } catch (e) {
    res.status(500).json({ message: 'Error' });
  }
});

/* --- Contabilidad --- */
app.get('/api/admin/contabilidad/movimientos', requireAdmin, async (_req, res) => {
  try {
    const [rows] = await db.query(
      'SELECT * FROM movimiento_contable ORDER BY fecha DESC LIMIT 500'
    );
    res.json(rows);
  } catch (e) {
    res.json([]);
  }
});

app.post('/api/admin/contabilidad/movimiento', requireAdmin, async (req, res) => {
  const { tipo, concepto, monto, referencia } = req.body;
  if (!tipo || !concepto || monto == null) {
    return res.status(400).json({ message: 'Tipo, concepto y monto son obligatorios' });
  }
  if (!['ingreso', 'egreso'].includes(tipo)) {
    return res.status(400).json({ message: 'Tipo debe ser ingreso o egreso' });
  }
  try {
    await db.query(
      `INSERT INTO movimiento_contable (tipo, concepto, monto, referencia) VALUES (?,?,?,?)`,
      [tipo, concepto, Number(monto), referencia || null]
    );
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({
      message: 'No se pudo registrar. Ejecute database/migration_contable_y_catalogo.sql',
    });
  }
});

app.get('/api/admin/contabilidad/resumen', requireAdmin, async (_req, res) => {
  try {
    const [ing] = await db.query(
      `SELECT COALESCE(SUM(monto),0) AS t FROM movimiento_contable WHERE tipo='ingreso'`
    );
    const [egr] = await db.query(
      `SELECT COALESCE(SUM(monto),0) AS t FROM movimiento_contable WHERE tipo='egreso'`
    );
    const ti = Number(ing[0].t);
    const te = Number(egr[0].t);
    res.json({ ingresos: ti, egresos: te, balance: ti - te });
  } catch (e) {
    res.json({ ingresos: 0, egresos: 0, balance: 0 });
  }
});

app.listen(port, () => {
  console.log(`Winner Shoes — http://localhost:${port}`);
});
