/**
 * Puebla marcas (30) y productos (10 por marca) si el catálogo tiene menos de 300 productos.
 * Ejecutar: node scripts/seed-catalog.js
 */
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const mysql = require('mysql2/promise');

const BRANDS = [
  'Nike', 'Adidas', 'Puma', 'Reebok', 'New Balance', 'Asics', 'Mizuno', 'Skechers', 'Fila', 'Converse',
  'Vans', 'Under Armour', 'Brooks', 'Hoka', 'Salomon', 'Merrell', 'Timberland', 'Dr. Martens', 'Clarks', 'Geox',
  'Bata', 'Lotto', 'Kappa', 'Diadora', 'Joma', 'Wilson', 'Champion', 'DC Shoes', 'Etnies', 'Oakley',
];

const CATS = ['Tenis', 'Botas', 'Sandalias', 'Tacones', 'Deportivos'];

async function main() {
  const pool = await mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    waitForConnections: true,
    connectionLimit: 5,
  });

  const [[{ n }]] = await pool.query('SELECT COUNT(*) AS n FROM producto');
  if (n >= 300) {
    console.log('Ya hay', n, 'productos. No se inserta nada.');
    await pool.end();
    return;
  }

  const [cats] = await pool.query(
    `SELECT id_categoria, nombre FROM categoria WHERE nombre IN (${CATS.map(() => '?').join(',')})`,
    CATS
  );
  const catIds = cats.map((c) => c.id_categoria);
  if (catIds.length < 5) {
    console.error('Faltan categorías en BD. Ejecute migration_winner_shoes.sql');
    await pool.end();
    process.exit(1);
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const marcaIds = {};
    for (const nombre of BRANDS) {
      const [ex] = await conn.query('SELECT id_marca FROM marcas WHERE nombre = ?', [nombre]);
      if (ex.length) {
        marcaIds[nombre] = ex[0].id_marca;
      } else {
        const [r] = await conn.query('INSERT INTO marcas (nombre) VALUES (?)', [nombre]);
        marcaIds[nombre] = r.insertId;
      }
    }

    let inserted = 0;
    for (const brand of BRANDS) {
      const idMarca = marcaIds[brand];
      const [[{ c }]] = await conn.query('SELECT COUNT(*) AS c FROM producto WHERE id_marca = ?', [idMarca]);
      const need = Math.max(0, 10 - Number(c));
      for (let i = 1; i <= need; i++) {
        const catId = catIds[(Number(c) + i - 1) % catIds.length];
        const idx = (Number(c) + i - 1) % 10;
        const nombre = `${brand} ${['Pro', 'Lite', 'Max', 'Air', 'Street', 'Run', 'Flex', 'Classic', 'Elite', 'Urban'][idx]} ${100 + Number(c) + i}`;
        const precio = 150000 + Math.floor(Math.random() * 450000);
        const img = `https://picsum.photos/seed/ws${idMarca}${i}/600/600`;
        const [ins] = await conn.query(
          `INSERT INTO producto (nombre, descripcion, precio, id_categoria, id_marca, imagen, estado)
           VALUES (?,?,?,?,?,?,TRUE)`,
          [nombre, `Referencia ${brand} línea ${i}.`, precio, catId, idMarca, img]
        );
        const pid = ins.insertId;
        const stock = 12 + Math.floor(Math.random() * 40);
        await conn.query(
          `INSERT INTO inventario (id_producto, cantidad, stock_minimo) VALUES (?,?,?)`,
          [pid, stock, 5]
        );
        inserted++;
      }
    }

    await conn.commit();
    console.log('Insertados', inserted, 'productos con inventario.');
  } catch (e) {
    await conn.rollback();
    console.error(e);
    process.exit(1);
  } finally {
    conn.release();
    await pool.end();
  }
}

main();
