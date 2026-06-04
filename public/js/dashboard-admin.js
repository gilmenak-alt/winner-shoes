const fmt = (n) =>
  new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(
    Number(n) || 0
  );

let repChart;
let lastReport = null;
let selectedReportTipo = '';

async function api(path, options = {}) {
  const r = await fetch(path, { credentials: 'same-origin', ...options });
  const text = await r.text();
  let data;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { raw: text };
  }
  if (!r.ok) {
    const msg = data.message || r.statusText || 'Error';
    throw new Error(msg);
  }
  return data;
}

async function requireAdmin() {
  const me = await fetch('/api/me', { credentials: 'same-origin' }).then((x) => x.json());
  if (!me.user || me.user.rol !== 'admin') {
    window.location.href = 'login.html';
    return null;
  }
  return me.user;
}

function showTab(name) {
  document.querySelectorAll('.admin-side button[data-tab]').forEach((b) => {
    b.classList.toggle('active', b.getAttribute('data-tab') === name);
  });
  document.querySelectorAll('.admin-panel').forEach((p) => {
    p.classList.toggle('active', p.getAttribute('data-panel') === name);
  });
}

// ── NUEVO: manejo de subtabs dentro del panel unificado de proveedores ──────
function showSubTab(name) {
  document.querySelectorAll('.provs-subtab-btn').forEach((b) => {
    b.classList.toggle('active', b.getAttribute('data-subtab') === name);
  });
  document.querySelectorAll('.provs-subpanel').forEach((p) => {
    p.classList.toggle('active', p.getAttribute('data-subpanel') === name);
  });
}
// ────────────────────────────────────────────────────────────────────────────

async function loadCatsMarcas() {
  const [cats, marcas, prods] = await Promise.all([
    api('/api/categorias'),
    api('/api/marcas'),
    api('/api/admin/productos'),
  ]);

  const selCat = document.getElementById('prodCat');
  const selMarca = document.getElementById('prodMarca');
  const selEntrada = document.getElementById('entradaProd');
  const selAsoc = document.getElementById('asocProd');
  selCat.innerHTML = cats.map((c) => `<option value="${c.id_categoria}">${c.nombre}</option>`).join('');
  selMarca.innerHTML = marcas.map((m) => `<option value="${m.id_marca}">${m.nombre}</option>`).join('');
  const opts = prods
    .map(
      (p) =>
        `<option value="${p.id_producto}">${p.nombre} (${p.marca}) · stock ${p.stock}</option>`
    )
    .join('');
  selEntrada.innerHTML = opts;
  selAsoc.innerHTML = opts;

  const selProv = document.getElementById('asocProv');
  const proveedores = await api('/api/admin/proveedores');
  selProv.innerHTML = proveedores
    .map((pr) => `<option value="${pr.id_proveedor}">${pr.nombre}</option>`)
    .join('');

  const selOferta = document.getElementById('ofertaProd');
  if (selOferta) {
    selOferta.innerHTML = prods
      .map((p) => `<option value="${p.id_producto}">${p.nombre} (${p.marca})</option>`)
      .join('');
  }

  const alertaProv = document.getElementById('alertaProvSelect');
  if (alertaProv) {
    alertaProv.innerHTML = proveedores
      .map((pr) => `<option value="${pr.id_proveedor}">${pr.nombre}</option>`)
      .join('');
  }

  return { cats, marcas, prods, proveedores };
}

async function refreshProductos() {
  const wrap = document.getElementById('prodTableWrap');
  try {
    const rows = await api('/api/admin/productos');
    wrap.innerHTML =
      '<table class="admin-table"><thead><tr><th>ID</th><th>Nombre</th><th>Marca</th><th>Cat.</th><th>Precio</th><th>Stock</th><th>Activo</th><th></th></tr></thead><tbody>' +
      rows
        .map(
          (p) => `<tr data-row="${p.id_producto}">
        <td>${p.id_producto}</td>
        <td>${p.nombre}</td>
        <td>${p.marca}</td>
        <td>${p.categoria}</td>
        <td>${fmt(p.precio)}</td>
        <td>${p.stock}</td>
        <td>${p.estado ? 'Sí' : 'No'}</td>
        <td><button type="button" class="pill-ghost btn-edit">Editar</button>
        <button type="button" class="pill-danger btn-del">Ocultar</button></td>
      </tr>`
        )
        .join('') +
      '</tbody></table>';

    wrap.querySelectorAll('.btn-edit').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const id = e.target.closest('tr').dataset.row;
        const p = rows.find((x) => String(x.id_producto) === String(id));
        if (!p) return;
        document.getElementById('prodId').value = p.id_producto;
        document.getElementById('prodNombre').value = p.nombre;
        document.getElementById('prodDesc').value = p.descripcion || '';
        document.getElementById('prodPrecio').value = p.precio;
        document.getElementById('prodCat').value = p.id_categoria;
        document.getElementById('prodMarca').value = p.id_marca;
        document.getElementById('prodImg').value = p.imagen || '';
        document.getElementById('prodEstado').checked = !!p.estado;
        // Feedback visual + scroll al formulario
        const formCard = document.getElementById('prodNombre').closest('.card');
        formCard.classList.add('editing');
        const h3 = formCard.querySelector('h3');
        if (h3) h3.textContent = `✏️ Editando: ${p.nombre}`;
        document.getElementById('prodSave').textContent = 'Actualizar producto';
        formCard.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    });

    wrap.querySelectorAll('.btn-del').forEach((btn) => {
      btn.addEventListener('click', async (e) => {
        const id = e.target.closest('tr').dataset.row;
        if (!confirm('¿Ocultar este producto del catálogo?')) return;
        await api('/api/admin/productos/' + id, { method: 'DELETE' });
        refreshProductos();
        loadCatsMarcas();
      });
    });
  } catch (e) {
    wrap.textContent = e.message;
  }
}

async function refreshInventario() {
  const wrap = document.getElementById('invTableWrap');
  try {
    const rows = await api('/api/admin/inventario');
    wrap.innerHTML =
      '<table class="admin-table"><thead><tr><th>Producto</th><th>Cantidad</th><th>Mínimo</th><th>Ajustar cantidad</th></tr></thead><tbody>' +
      rows
        .map(
          (r) => `<tr>
      <td>${r.producto}</td>
      <td>${r.cantidad}</td>
      <td>${r.stock_minimo}</td>
      <td><input type="number" data-inv="${r.id_producto}" class="inv-input" style="width:100px;display:inline-block;">
          <button type="button" class="pill-ghost inv-save" data-id="${r.id_producto}">Guardar</button></td>
    </tr>`
        )
        .join('') +
      '</tbody></table>';

    wrap.querySelectorAll('.inv-save').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const id = btn.dataset.id;
        const input = wrap.querySelector(`input[data-inv="${id}"]`);
        const val = input.value;
        if (val === '') return;
        await api('/api/admin/inventario/' + id, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ cantidad: Number(val) }),
        });
        refreshInventario();
        loadCatsMarcas();
      });
    });
  } catch (e) {
    wrap.textContent = e.message;
  }
}

async function refreshAlertas() {
  const wrap = document.getElementById('alertasWrap');
  try {
    const rows = await api('/api/admin/inventario/alertas');
    if (!rows.length) {
      wrap.innerHTML = '<p class="muted">Sin alertas por debajo del mínimo.</p>';
      return;
    }
    wrap.innerHTML =
      '<table class="admin-table"><thead><tr><th>Producto</th><th>Marca</th><th>Stock</th><th>Mínimo</th><th></th></tr></thead><tbody>' +
      rows
        .map(
          (r) => `<tr>
      <td>${r.nombre}</td><td>${r.marca}</td><td>${r.cantidad}</td><td>${r.stock_minimo}</td>
      <td><button type="button" class="pill-ghost btn-pedir-prov" data-pid="${r.id_producto}" data-nombre="${String(r.nombre).replace(/"/g, '&quot;')}">Pedido a proveedor</button></td>
    </tr>`
        )
        .join('') +
      '</tbody></table>';

    wrap.querySelectorAll('.btn-pedir-prov').forEach((btn) => {
      btn.addEventListener('click', () => {
        document.getElementById('alertaPedidoPanel').style.display = 'block';
        document.getElementById('alertaProdId').value = btn.dataset.pid;
        document.getElementById('alertaProdNombre').textContent = btn.dataset.nombre;
        document.getElementById('alertaCant').value = '';
        document.getElementById('alertaPrecioUnit').value = '';
      });
    });
  } catch (e) {
    wrap.textContent = e.message;
  }
}

async function refreshComprasProv() {
  const wrap = document.getElementById('comprasProvWrap');
  if (!wrap) return;
  try {
    const rows = await api('/api/admin/compras-proveedor');
    if (!rows.length) {
      wrap.innerHTML = '<p class="muted">No hay compras registradas.</p>';
      return;
    }
    wrap.innerHTML =
      '<table class="admin-table"><thead><tr><th>ID</th><th>Proveedor</th><th>Fecha</th><th>Total</th><th>Estado</th><th></th></tr></thead><tbody>' +
      rows
        .map(
          (c) => `<tr>
      <td>${c.id_compra}</td><td>${c.proveedor}</td><td>${new Date(c.fecha_compra).toLocaleString('es-CO')}</td>
      <td>${fmt(c.total_compra)}</td><td>${c.estado}</td>
      <td>${c.estado === 'solicitado' ? `<button type="button" class="pill-ghost btn-recibir" data-id="${c.id_compra}">Marcar recibido</button>` : ''}</td>
    </tr>`
        )
        .join('') +
      '</tbody></table>';
    wrap.querySelectorAll('.btn-recibir').forEach((btn) => {
      btn.addEventListener('click', async () => {
        await api('/api/admin/compra-proveedor/' + btn.dataset.id + '/recibir', { method: 'PATCH' });
        refreshComprasProv();
        refreshInventario();
        loadCatsMarcas();
      });
    });
  } catch (e) {
    wrap.textContent = e.message;
  }
}

async function refreshOfertas() {
  const wrap = document.getElementById('ofertaTableWrap');
  if (!wrap) return;
  try {
    const rows = await api('/api/admin/ofertas');
    if (!rows.length) {
      wrap.innerHTML = '<p class="muted">No hay ofertas. Cree una con el formulario.</p>';
      return;
    }
    wrap.innerHTML =
      '<table class="admin-table"><thead><tr><th>Producto</th><th>%</th><th>Lista</th><th>Activa</th><th></th></tr></thead><tbody>' +
      rows
        .map(
          (o) => `<tr>
      <td>${o.producto}</td><td>${o.porcentaje}</td><td>${fmt(o.precio_lista)}</td><td>${o.activo ? 'Sí' : 'No'}</td>
      <td><button type="button" class="pill-danger of-del" data-id="${o.id_oferta}">Eliminar</button></td>
    </tr>`
        )
        .join('') +
      '</tbody></table>';
    wrap.querySelectorAll('.of-del').forEach((btn) => {
      btn.addEventListener('click', async () => {
        if (!confirm('¿Eliminar oferta?')) return;
        await api('/api/admin/ofertas/' + btn.dataset.id, { method: 'DELETE' });
        refreshOfertas();
        loadCatsMarcas();
      });
    });
  } catch (e) {
    wrap.textContent = e.message || 'Sin tabla oferta en BD';
  }
}

async function refreshDevolucionesAdmin() {
  const wrap = document.getElementById('devolucionesAdminWrap');
  if (!wrap) return;
  try {
    const rows = await api('/api/admin/devoluciones');
    wrap.innerHTML =
      '<table class="admin-table"><thead><tr><th>ID</th><th>Cliente</th><th>Producto</th><th>Estado</th><th>Fecha</th><th>Evidencias</th></tr></thead><tbody>' +
      rows
        .map((d) => {
          let ev = '—';
          try {
            const arr = JSON.parse(d.evidencias || '[]');
            if (arr[0]) ev = `<a href="${arr[0]}" target="_blank" rel="noopener">Ver archivos</a>`;
          } catch (_) {}
          return `<tr>
      <td>${d.id_devolucion}</td><td>${d.cliente}</td><td>${d.nombre_producto}</td>
      <td>
        <select class="dev-estado" data-id="${d.id_devolucion}">
          ${['solicitada', 'en_revision', 'aprobada', 'rechazada', 'completada']
            .map((s) => `<option value="${s}" ${d.estado === s ? 'selected' : ''}>${s}</option>`)
            .join('')}
        </select>
      </td>
      <td>${new Date(d.fecha_creacion).toLocaleString('es-CO')}</td>
      <td>${ev}</td>
    </tr>`;
        })
        .join('') +
      '</tbody></table>';
    wrap.querySelectorAll('.dev-estado').forEach((sel) => {
      sel.addEventListener('change', async () => {
        await api('/api/admin/devoluciones/' + sel.dataset.id + '/estado', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ estado: sel.value }),
        });
      });
    });
  } catch (e) {
    wrap.textContent = e.message;
  }
}

async function refreshPedidosAdmin() {
  const wrap = document.getElementById('pedidosAdminWrap');
  try {
    const rows = await api('/api/admin/pedidos');
    wrap.innerHTML =
      '<table class="admin-table"><thead><tr><th>#</th><th>Cliente</th><th>Fecha</th><th>Total</th><th>Estado</th><th>Detalle</th></tr></thead><tbody>' +
      rows
        .map((p) => {
          const det = (p.detalles || []).map((d) => `${d.nombre_producto}×${d.cantidad}`).join(', ');
          return `<tr>
          <td>${p.id_pedido}</td>
          <td>${p.cliente_nombre}<br><span class="muted">${p.cliente_correo}</span></td>
          <td>${new Date(p.fecha).toLocaleString('es-CO')}</td>
          <td>${fmt(p.total)}</td>
          <td>
            <select data-pedido="${p.id_pedido}" class="pedido-estado">
              ${['pendiente', 'pagado', 'enviado', 'entregado']
                .map((s) => `<option value="${s}" ${p.estado === s ? 'selected' : ''}>${s}</option>`)
                .join('')}
            </select>
          </td>
          <td style="max-width:220px;">${det}</td>
        </tr>`;
        })
        .join('') +
      '</tbody></table>';

    wrap.querySelectorAll('.pedido-estado').forEach((sel) => {
      sel.addEventListener('change', async () => {
        const id = sel.dataset.pedido;
        const estado = sel.value;
        let tracking_codigo = null;
        if (estado === 'enviado') {
          tracking_codigo = window.prompt('Código de seguimiento de envío (opcional):') || null;
        }
        await api('/api/admin/pedidos/' + id + '/estado', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ estado, tracking_codigo }),
        });
      });
    });
  } catch (e) {
    wrap.textContent = e.message;
  }
}

async function refreshProveedores() {
  const wrap = document.getElementById('provTableWrap');
  try {
    const rows = await api('/api/admin/proveedores');
    wrap.innerHTML =
      '<table class="admin-table"><thead><tr><th>ID</th><th>Nombre</th><th>Tel</th><th>Correo</th><th></th></tr></thead><tbody>' +
      rows
        .map(
          (p) => `<tr data-prov="${p.id_proveedor}">
      <td>${p.id_proveedor}</td>
      <td>${p.nombre}</td>
      <td>${p.telefono || ''}</td>
      <td>${p.correo || ''}</td>
      <td><button type="button" class="pill-ghost prov-edit">Editar</button>
          <button type="button" class="pill-danger prov-del">Eliminar</button></td>
    </tr>`
        )
        .join('') +
      '</tbody></table>';

    wrap.querySelectorAll('.prov-edit').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const id = e.target.closest('tr').dataset.prov;
        const p = rows.find((x) => String(x.id_proveedor) === String(id));
        document.getElementById('provId').value = p.id_proveedor;
        document.getElementById('provNombre').value = p.nombre;
        document.getElementById('provTel').value = p.telefono || '';
        document.getElementById('provCorreo').value = p.correo || '';
        document.getElementById('provDir').value = p.direccion || '';
      });
    });

    wrap.querySelectorAll('.prov-del').forEach((btn) => {
      btn.addEventListener('click', async (e) => {
        const id = e.target.closest('tr').dataset.prov;
        if (!confirm('¿Eliminar proveedor?')) return;
        await api('/api/admin/proveedores/' + id, { method: 'DELETE' });
        refreshProveedores();
        loadCatsMarcas();
      });
    });
  } catch (e) {
    wrap.textContent = e.message;
  }
}

async function refreshAsociaciones() {
  const list = document.getElementById('asocList');
  try {
    const rows = await api('/api/admin/producto-proveedor');
    list.innerHTML =
      '<table class="admin-table"><thead><tr><th>Producto</th><th>Proveedor</th><th></th></tr></thead><tbody>' +
      rows
        .map(
          (r) => `<tr>
      <td>${r.producto}</td>
      <td>${r.proveedor}</td>
      <td><button type="button" class="pill-danger asoc-del" data-p="${r.id_producto}" data-v="${r.id_proveedor}">Quitar</button></td>
    </tr>`
        )
        .join('') +
      '</tbody></table>';

    list.querySelectorAll('.asoc-del').forEach((btn) => {
      btn.addEventListener('click', async () => {
        await api('/api/admin/producto-proveedor', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id_producto: Number(btn.dataset.p),
            id_proveedor: Number(btn.dataset.v),
          }),
        });
        refreshAsociaciones();
      });
    });
  } catch (e) {
    list.textContent = e.message;
  }
}

async function refreshUsuarios() {
  const wrap = document.getElementById('usuariosWrap');
  try {
    const rows = await api('/api/admin/usuarios');
    wrap.innerHTML =
      '<table class="admin-table"><thead><tr><th>ID</th><th>Nombre</th><th>Correo</th><th>Rol</th><th>Estado</th><th></th></tr></thead><tbody>' +
      rows
        .map(
          (u) => `<tr>
      <td>${u.id_usuario}</td>
      <td>${u.nombre}</td>
      <td>${u.correo}</td>
      <td>
        <select data-user="${u.id_usuario}" class="user-rol">
          <option value="cliente" ${u.rol === 'cliente' ? 'selected' : ''}>cliente</option>
          <option value="admin" ${u.rol === 'admin' ? 'selected' : ''}>admin</option>
        </select>
      </td>
      <td>
        <select data-user="${u.id_usuario}" class="user-estado">
          <option value="true" ${u.estado ? 'selected' : ''}>activo</option>
          <option value="false" ${!u.estado ? 'selected' : ''}>inactivo</option>
        </select>
      </td>
      <td><button type="button" class="pill-ghost user-save" data-id="${u.id_usuario}">Aplicar</button></td>
    </tr>`
        )
        .join('') +
      '</tbody></table>';

    wrap.querySelectorAll('.user-save').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const id = btn.dataset.id;
        const rol = wrap.querySelector(`select.user-rol[data-user="${id}"]`).value;
        const estado = wrap.querySelector(`select.user-estado[data-user="${id}"]`).value === 'true';
        await api('/api/admin/usuarios/' + id, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ rol, estado }),
        });
        alert('Usuario actualizado');
      });
    });
  } catch (e) {
    wrap.textContent = e.message;
  }
}

const REPORT_TYPES = [
  { id: 'ventas_diarias', label: 'Ventas diarias', dates: true },
  { id: 'ventas_semanales', label: 'Ventas semanales', dates: true },
  { id: 'ventas_mensuales', label: 'Ventas mensuales', dates: true },
  { id: 'productos_mas_vendidos', label: 'Productos más vendidos', dates: true },
  { id: 'productos_menos_vendidos', label: 'Productos menos vendidos', dates: true },
  { id: 'ganancias_totales', label: 'Ganancias totales', dates: true },
  { id: 'inventario_movimientos', label: 'Entradas y salidas de inventario', dates: true },
  { id: 'productos_mas_comprados_clientes', label: 'Productos más comprados por clientes', dates: true },
  { id: 'historial_compras', label: 'Historial de compras', dates: true },
  { id: 'ingresos_generados', label: 'Ingresos generados', dates: true },
  { id: 'facturacion', label: 'Facturación', dates: true },
  { id: 'productos_devueltos', label: 'Productos devueltos', dates: false },
  { id: 'tiempo_promedio_entrega', label: 'Tiempo promedio de entrega', dates: true },
  { id: 'seguimiento_envios', label: 'Seguimiento de envíos', dates: false },
];

function buildReportMenu() {
  const host = document.getElementById('repTipoMenu');
  if (!host) return;
  host.innerHTML = REPORT_TYPES.map((def) => {
    const dateBlock = def.dates
      ? `<div class="rep-inner">
          <p class="muted" style="margin:0 0 8px;font-size:13px;">Periodo del reporte</p>
          <p><label>Rango <select class="rep-preset">
            <option value="all">Todo el historial</option>
            <option value="7">Últimos 7 días</option>
            <option value="30">Últimos 30 días</option>
            <option value="custom">Personalizado (desde / hasta)</option>
          </select></label></p>
          <div class="rep-custom" style="display:none;margin-top:8px;gap:8px;">
            <p><label>Desde <input type="date" class="rep-d"></label></p>
            <p><label>Hasta <input type="date" class="rep-h"></label></p>
          </div>
        </div>`
      : `<div class="rep-inner"><p class="muted" style="margin:0;font-size:13px;">Sin filtro por fechas.</p></div>`;
    return `<details class="rep-acc" data-tipo="${def.id}">
      <summary>${def.label}</summary>
      ${dateBlock}
      <p style="margin-top:12px;"><button type="button" class="btn-checkout rep-gen" style="width:auto;">Generar vista previa</button></p>
    </details>`;
  }).join('');

  host.querySelectorAll('.rep-preset').forEach((sel) => {
    sel.addEventListener('change', () => {
      const det = sel.closest('details.rep-acc');
      const custom = det?.querySelector('.rep-custom');
      if (!custom) return;
      custom.style.display = sel.value === 'custom' ? 'block' : 'none';
    });
  });

  host.querySelectorAll('details.rep-acc').forEach((det) => {
    det.addEventListener('toggle', () => {
      if (det.open) {
        host.querySelectorAll('details.rep-acc').forEach((d) => {
          if (d !== det) d.open = false;
        });
      }
    });
  });

  host.querySelectorAll('.rep-gen').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const det = btn.closest('details.rep-acc');
      const tipo = det?.dataset.tipo;
      if (!tipo) return;
      const def = REPORT_TYPES.find((x) => x.id === tipo);
      let desde = '';
      let hasta = '';
      if (def?.dates) {
        const preset = det.querySelector('.rep-preset')?.value || 'all';
        if (preset === 'custom') {
          desde = det.querySelector('.rep-d')?.value || '';
          hasta = det.querySelector('.rep-h')?.value || '';
          if (!desde || !hasta) {
            alert('Completa desde y hasta para el rango personalizado.');
            return;
          }
        } else if (preset === '7' || preset === '30') {
          const days = Number(preset);
          const end = new Date();
          const start = new Date();
          start.setDate(start.getDate() - days);
          desde = start.toISOString().slice(0, 10);
          hasta = end.toISOString().slice(0, 10);
        }
      }
      selectedReportTipo = tipo;
      await runReport(tipo, desde, hasta);
    });
  });
}

async function runReport(tipo, desde, hasta) {
  const qs = new URLSearchParams({ tipo, desde, hasta });
  try {
    lastReport = await api('/api/admin/reportes/consulta?' + qs.toString());
    const tw = document.getElementById('repTablaWrap');
    if (!tw) return;
    if (!lastReport.filas || !lastReport.filas.length) {
      tw.innerHTML = '<p class="muted">Sin datos en el periodo.</p>';
    } else {
      const keys = Object.keys(lastReport.filas[0]);
      tw.innerHTML =
        '<table class="admin-table"><thead><tr>' +
        keys.map((k) => `<th>${k}</th>`).join('') +
        '</tr></thead><tbody>' +
        lastReport.filas
          .map((row) => '<tr>' + keys.map((k) => `<td>${row[k] ?? ''}</td>`).join('') + '</tr>')
          .join('') +
        '</tbody></table>';
    }
    const ctx = document.getElementById('repChart');
    if (repChart) repChart.destroy();
    if (lastReport.chart && lastReport.chart.labels && lastReport.chart.labels.length) {
      repChart = new Chart(ctx, {
        type: 'bar',
        data: {
          labels: lastReport.chart.labels,
          datasets: [
            {
              label: lastReport.titulo,
              data: lastReport.chart.values,
              backgroundColor: '#111',
            },
          ],
        },
        options: { responsive: true, plugins: { legend: { display: false } } },
      });
    } else {
      repChart = null;
    }
  } catch (e) {
    alert(e.message);
  }
}

async function exportReport(kind) {
  if (!lastReport || !lastReport.filas) {
    alert('Genere primero la vista previa.');
    return;
  }
  const keys = Object.keys(lastReport.filas[0] || {});
  let chartBase64 = null;
  if (repChart) chartBase64 = repChart.toBase64Image();

  const body = {
    titulo: lastReport.titulo,
    headers: keys,
    filas: lastReport.filas,
    chartBase64,
  };

  const r = await fetch('/api/admin/export/' + kind, {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!r.ok) {
    alert('Error al exportar');
    return;
  }
  const blob = await r.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = kind === 'pdf' ? 'reporte-winner-shoes.pdf' : 'reporte-winner-shoes.xlsx';
  a.click();
  URL.revokeObjectURL(url);
}

async function refreshContabilidad() {
  const sum = document.getElementById('contaResumen');
  const wrap = document.getElementById('movTableWrap');
  try {
    const res = await api('/api/admin/contabilidad/resumen');
    sum.innerHTML = `<strong>Ingresos:</strong> ${fmt(res.ingresos)} · <strong>Egresos:</strong> ${fmt(
      res.egresos
    )}<br><strong>Balance:</strong> ${fmt(res.balance)}`;

    const movs = await api('/api/admin/contabilidad/movimientos');
    wrap.innerHTML =
      '<table class="admin-table"><thead><tr><th>Fecha</th><th>Tipo</th><th>Concepto</th><th>Monto</th><th>Ref.</th></tr></thead><tbody>' +
      movs
        .map(
          (m) => `<tr>
      <td>${new Date(m.fecha).toLocaleString('es-CO')}</td>
      <td>${m.tipo}</td>
      <td>${m.concepto}</td>
      <td>${fmt(m.monto)}</td>
      <td>${m.referencia || ''}</td>
    </tr>`
        )
        .join('') +
      '</tbody></table>';
  } catch (e) {
    sum.textContent = 'Ejecute la migración SQL de movimiento_contable para habilitar esta vista.';
    wrap.textContent = e.message;
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  const ok = await requireAdmin();
  if (!ok) return;

  document.querySelectorAll('.admin-side button[data-tab]').forEach((b) => {
    b.addEventListener('click', () => showTab(b.getAttribute('data-tab')));
  });

  // ── NUEVO: inicializar subtabs del panel unificado de proveedores ──────────
  document.querySelectorAll('.provs-subtab-btn').forEach((b) => {
    b.addEventListener('click', () => showSubTab(b.getAttribute('data-subtab')));
  });
  showSubTab('directorio'); // subtab activo por defecto al cargar
  // ──────────────────────────────────────────────────────────────────────────

  document.getElementById('adminLogout').addEventListener('click', async () => {
    await fetch('/api/logout', { method: 'POST', credentials: 'same-origin' });
    localStorage.removeItem('usuario');
    window.location.href = 'index.html';
  });

  document.getElementById('prodClear').addEventListener('click', () => {
    document.getElementById('prodId').value = '';
    document.getElementById('prodNombre').value = '';
    document.getElementById('prodDesc').value = '';
    document.getElementById('prodPrecio').value = '';
    // Resetear feedback visual
    const formCard = document.getElementById('prodNombre').closest('.card');
    formCard.classList.remove('editing');
    const h3 = formCard.querySelector('h3');
    if (h3) h3.textContent = 'Nuevo / Editar producto';
    document.getElementById('prodSave').textContent = 'Guardar';
    document.getElementById('prodImg').value = '';
    document.getElementById('prodStock').value = '';
    document.getElementById('prodEstado').checked = true;
  });

  document.getElementById('prodSave').addEventListener('click', async () => {
    const id = document.getElementById('prodId').value;
    const body = {
      nombre: document.getElementById('prodNombre').value,
      descripcion: document.getElementById('prodDesc').value,
      precio: Number(document.getElementById('prodPrecio').value),
      id_categoria: Number(document.getElementById('prodCat').value),
      id_marca: Number(document.getElementById('prodMarca').value),
      imagen: document.getElementById('prodImg').value || null,
      estado: document.getElementById('prodEstado').checked,
    };
    try {
      if (id) {
        await api('/api/admin/productos/' + id, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
      } else {
        body.stock_inicial = Number(document.getElementById('prodStock').value || 0);
        await api('/api/admin/productos', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
      }
      alert('Guardado');
      document.getElementById('prodClear').click();
      refreshProductos();
      loadCatsMarcas();
    } catch (e) {
      alert(e.message);
    }
  });

  document.getElementById('entradaBtn').addEventListener('click', async () => {
    const id_producto = Number(document.getElementById('entradaProd').value);
    const cantidad = Number(document.getElementById('entradaCant').value);
    try {
      await api('/api/admin/inventario/entrada', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id_producto, cantidad }),
      });
      document.getElementById('entradaCant').value = '';
      refreshInventario();
      loadCatsMarcas();
      alert('Entrada registrada');
    } catch (e) {
      alert(e.message);
    }
  });

  document.getElementById('provClear').addEventListener('click', () => {
    document.getElementById('provId').value = '';
    document.getElementById('provNombre').value = '';
    document.getElementById('provTel').value = '';
    document.getElementById('provCorreo').value = '';
    document.getElementById('provDir').value = '';
  });

  document.getElementById('provSave').addEventListener('click', async () => {
    const id = document.getElementById('provId').value;
    const body = {
      nombre: document.getElementById('provNombre').value,
      telefono: document.getElementById('provTel').value,
      correo: document.getElementById('provCorreo').value,
      direccion: document.getElementById('provDir').value,
    };
    try {
      if (id) {
        await api('/api/admin/proveedores/' + id, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
      } else {
        await api('/api/admin/proveedores', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
      }
      document.getElementById('provClear').click();
      refreshProveedores();
      loadCatsMarcas();
    } catch (e) {
      alert(e.message);
    }
  });

  document.getElementById('asocBtn').addEventListener('click', async () => {
    try {
      await api('/api/admin/producto-proveedor', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id_producto: Number(document.getElementById('asocProd').value),
          id_proveedor: Number(document.getElementById('asocProv').value),
        }),
      });
      refreshAsociaciones();
    } catch (e) {
      alert(e.message);
    }
  });

  buildReportMenu();
  document.getElementById('expPdf')?.addEventListener('click', () => exportReport('pdf'));
  document.getElementById('expXlsx')?.addEventListener('click', () => exportReport('xlsx'));

  document.getElementById('ofertaSave')?.addEventListener('click', async () => {
    try {
      await api('/api/admin/ofertas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id_producto: Number(document.getElementById('ofertaProd').value),
          porcentaje: Number(document.getElementById('ofertaPct').value),
          activo: document.getElementById('ofertaAct').checked,
          fecha_inicio: document.getElementById('ofertaIni').value || null,
          fecha_fin: document.getElementById('ofertaFin').value || null,
        }),
      });
      alert('Oferta guardada');
      refreshOfertas();
    } catch (e) {
      alert(e.message);
    }
  });

  document.getElementById('alertaPedidoCancel')?.addEventListener('click', () => {
    document.getElementById('alertaPedidoPanel').style.display = 'none';
  });

  document.getElementById('alertaPedidoBtn')?.addEventListener('click', async () => {
    const id_producto = Number(document.getElementById('alertaProdId').value);
    const id_proveedor = Number(document.getElementById('alertaProvSelect').value);
    const cantidad = Number(document.getElementById('alertaCant').value);
    const precio_compra_unitario = Number(document.getElementById('alertaPrecioUnit').value);
    try {
      await api('/api/admin/compra-proveedor', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id_proveedor, items: [{ id_producto, cantidad, precio_compra_unitario }] }),
      });
      alert('Pedido a proveedor registrado');
      document.getElementById('alertaPedidoPanel').style.display = 'none';
      refreshComprasProv();
    } catch (e) {
      alert(e.message);
    }
  });

  document.getElementById('movBtn').addEventListener('click', async () => {
    try {
      await api('/api/admin/contabilidad/movimiento', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tipo: document.getElementById('movTipo').value,
          concepto: document.getElementById('movConcepto').value,
          monto: Number(document.getElementById('movMonto').value),
          referencia: document.getElementById('movRef').value,
        }),
      });
      document.getElementById('movConcepto').value = '';
      document.getElementById('movMonto').value = '';
      refreshContabilidad();
    } catch (e) {
      alert(e.message);
    }
  });

  await loadCatsMarcas();
  refreshProductos();
  refreshInventario();
  refreshAlertas();
  refreshPedidosAdmin();
  refreshProveedores();
  refreshAsociaciones();
  refreshUsuarios();
  refreshContabilidad();
  refreshOfertas();
  refreshComprasProv();
  refreshDevolucionesAdmin();
});