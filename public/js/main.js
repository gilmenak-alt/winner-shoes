const CART_KEY = 'carrito_calzado';

let productosGlobal = [];
let marcasGlobal = [];
let filtroCategoria = '';
let filtroMarca = '';
let filtroEspecial = '';
let busquedaTexto = '';
let loggedInUser = null;
let searchTimer = null;

const fmt = (n) =>
  new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(
    Number(n) || 0
  );

function getCart() {
  try {
    return JSON.parse(localStorage.getItem(CART_KEY)) || [];
  } catch {
    return [];
  }
}

function setCart(items) {
  localStorage.setItem(CART_KEY, JSON.stringify(items));
  updateCartBadge();
}

function updateCartBadge() {
  const cart = getCart();
  const n = cart.reduce((a, x) => a + Number(x.cantidad || 0), 0);
  const badge = document.getElementById('cartBadge');
  if (!badge) return;
  badge.hidden = n === 0;
  badge.textContent = String(n);
}

function precioMostrar(p) {
  const venta = Number(p.precio_venta != null ? p.precio_venta : p.precio_lista || p.precio);
  const lista = Number(p.precio_lista != null ? p.precio_lista : p.precio);
  const pct = p.oferta_porcentaje != null ? Number(p.oferta_porcentaje) : null;
  if (pct != null && pct > 0 && venta < lista) {
    return `<span class="price-old">${fmt(lista)}</span><span class="pct-badge">-${pct}%</span><br><span class="price-new">${fmt(venta)}</span>`;
  }
  return `<span class="price-new">${fmt(venta)}</span>`;
}

async function fetchStock(id) {
  const r = await fetch(`/api/productos/${id}/stock`, { credentials: 'same-origin' });
  if (!r.ok) return 0;
  const d = await r.json();
  return Number(d.cantidad || 0);
}

async function requireUserForCart() {
  const r = await fetch('/api/me', { credentials: 'same-origin' });
  const d = await r.json();
  if (!d.user) {
    alert('Debes iniciar sesión o registrarte para usar el carrito.');
    window.location.href = 'login.html?next=' + encodeURIComponent(location.pathname + location.search + location.hash);
    return false;
  }
  loggedInUser = d.user;
  return true;
}

async function addToCart(producto, qty = 1) {
  if (!(await requireUserForCart())) return;
  const cart = getCart();
  const id = producto.id_producto;
  const max = await fetchStock(id);
  const add = Math.max(1, Number(qty) || 1);
  if (max <= 0) {
    alert('Producto no disponible en este momento.');
    return;
  }
  const precioUnit = Number(producto.precio_venta != null ? producto.precio_venta : producto.precio_lista || producto.precio);
  const lista = Number(producto.precio_lista != null ? producto.precio_lista : producto.precio);
  const existing = cart.find((x) => x.id_producto === id);
  if (existing) {
    existing.cantidad = Math.min(max, Number(existing.cantidad) + add);
    existing.stock = max;
    existing.precio = precioUnit;
  } else {
    cart.push({
      id_producto: id,
      nombre: producto.nombre,
      precio: precioUnit,
      precio_lista: lista,
      imagen: producto.imagen,
      cantidad: Math.min(max, add),
      stock: max,
    });
  }
  setCart(cart);
}

function changeQty(id_producto, delta) {
  const cart = getCart();
  const item = cart.find((x) => x.id_producto === id_producto);
  if (!item) return;
  item.cantidad = Number(item.cantidad) + delta;
  if (item.cantidad <= 0) {
    cart.splice(cart.indexOf(item), 1);
  } else if (item.stock != null && item.cantidad > item.stock) {
    item.cantidad = item.stock;
  }
  setCart(cart);
  renderCartDrawer();
}

function removeLine(id_producto) {
  setCart(getCart().filter((x) => x.id_producto !== id_producto));
  renderCartDrawer();
}

function cartTotal() {
  return getCart().reduce((t, x) => t + Number(x.precio) * Number(x.cantidad), 0);
}

function renderCartDrawer() {
  const wrap = document.getElementById('cartLines');
  const totalEl = document.getElementById('cartTotal');
  if (!wrap) return;
  const cart = getCart();
  if (!cart.length) {
    wrap.innerHTML = '<p class="muted">Tu carrito está vacío.</p>';
  } else {
    wrap.innerHTML = cart
      .map(
        (x) => `
      <div class="cart-line">
        <img src="${x.imagen || 'https://via.placeholder.com/120?text=Calzado'}" alt="">
        <div>
          <strong>${x.nombre}</strong>
          <div class="muted">${fmt(x.precio)} c/u</div>
          <div class="qty-row">
            <button type="button" aria-label="Menos" data-qty="${x.id_producto}" data-d="-1">−</button>
            <span>${x.cantidad}</span>
            <button type="button" aria-label="Más" data-qty="${x.id_producto}" data-d="1">+</button>
          </div>
        </div>
        <button type="button" class="btn-sm" data-remove="${x.id_producto}">Quitar</button>
      </div>`
      )
      .join('');
    wrap.querySelectorAll('[data-qty]').forEach((btn) => {
      btn.addEventListener('click', () =>
        changeQty(Number(btn.getAttribute('data-qty')), Number(btn.getAttribute('data-d')))
      );
    });
    wrap.querySelectorAll('[data-remove]').forEach((btn) => {
      btn.addEventListener('click', () => removeLine(Number(btn.getAttribute('data-remove'))));
    });
  }
  if (totalEl) totalEl.textContent = fmt(cartTotal());
}

function openDrawer() {
  document.getElementById('cartDrawer')?.classList.add('open');
  document.getElementById('cartBackdrop')?.classList.add('open');
  renderCartDrawer();
}

function closeDrawer() {
  document.getElementById('cartDrawer')?.classList.remove('open');
  document.getElementById('cartBackdrop')?.classList.remove('open');
}

function openHelp() {
  document.getElementById('helpModal')?.classList.add('open');
  document.getElementById('helpBackdrop')?.classList.add('open');
}

function closeHelp() {
  document.getElementById('helpModal')?.classList.remove('open');
  document.getElementById('helpBackdrop')?.classList.remove('open');
}

function initAllCarousels() {
  document.querySelectorAll('.carousel').forEach((root) => {
    const track = root.querySelector('.carousel-track');
    if (!track) return;
    const slides = track.children.length;
    if (!slides) return;
    let i = 0;
    const go = () => {
      track.style.transform = `translateX(-${i * 100}%)`;
    };
    root.querySelector('.carousel-prev')?.addEventListener('click', () => {
      i = (i - 1 + slides) % slides;
      go();
    });
    root.querySelector('.carousel-next')?.addEventListener('click', () => {
      i = (i + 1) % slides;
      go();
    });
    go();
  });
}

async function cargarCatalogo() {
  if (filtroEspecial === 'ofertas') {
    const r = await fetch('/api/ofertas-activas');
    const j = await r.json();
    productosGlobal = Array.isArray(j) ? j : [];
    mostrarProductos(productosGlobal);
    return;
  }
  const params = new URLSearchParams();
  if (busquedaTexto) params.set('q', busquedaTexto);
  if (filtroCategoria) params.set('categoria', filtroCategoria);
  if (filtroMarca) params.set('marca', filtroMarca);
  const r = await fetch('/api/productos?' + params.toString());
  const j = await r.json();
  productosGlobal = Array.isArray(j) ? j : [];
  let lista = [...productosGlobal];
  if (filtroEspecial === 'novedades') {
    lista = lista.slice(0, 12);
  }
  mostrarProductos(lista);
}

async function cargarOfertasHome() {
  const el = document.getElementById('ofertasGrid');
  if (!el) return;
  try {
    const rows = await fetch('/api/ofertas-activas').then((x) => x.json());
    if (!Array.isArray(rows) || !rows.length) {
      el.innerHTML = '<p class="muted">No hay ofertas activas por ahora. Vuelve pronto.</p>';
      return;
    }
    el.innerHTML = '';
    rows.slice(0, 8).forEach((p) => {
      const card = document.createElement('article');
      card.className = 'card-product';
      card.innerHTML = `
        <div class="card-media">
          <img src="${p.imagen || 'https://via.placeholder.com/400?text=Calzado'}" alt="${p.nombre}">
        </div>
        <div class="card-body">
          <h3>${p.nombre}</h3>
          <div class="card-meta">${p.marca} · ${p.categoria}</div>
          <div class="card-price">${precioMostrar(p)}</div>
          <button type="button" class="btn-sm primary" style="margin-top:12px;width:100%;">Añadir al carrito</button>
        </div>`;
      card.addEventListener('click', async (ev) => {
        if (!ev.target.closest('button')) {
          location.href = `producto.html?id=${p.id_producto}`;
          return;
        }
        ev.stopPropagation();
        await addToCart(p, 1);
        openDrawer();
      });
      el.appendChild(card);
    });
  } catch {
    el.innerHTML = '<p class="muted">No se pudieron cargar ofertas.</p>';
  }
}

function mostrarProductos(lista) {
  const contenedor = document.getElementById('productos');
  if (!contenedor) return;
  contenedor.innerHTML = '';
  if (!lista.length) {
    contenedor.innerHTML = '<p class="muted">No hay resultados. Prueba otra búsqueda o filtro.</p>';
    return;
  }
  lista.forEach((p) => {
    const card = document.createElement('article');
    card.className = 'card-product';
    card.innerHTML = `
      <div class="card-media">
        <img src="${p.imagen || 'https://via.placeholder.com/400?text=Calzado'}" alt="${p.nombre}">
      </div>
      <div class="card-body">
        <h3>${p.nombre}</h3>
        <div class="card-meta">${p.marca} · ${p.categoria}</div>
        <div class="card-price">${precioMostrar(p)}</div>
        <button type="button" class="btn-sm primary" style="margin-top:12px;width:100%;">Añadir al carrito</button>
      </div>`;
    card.addEventListener('click', async (ev) => {
      if (ev.target.closest('button')) {
        ev.stopPropagation();
        await addToCart(p, 1);
        openDrawer();
        return;
      }
      window.location.href = `producto.html?id=${p.id_producto}`;
    });
    contenedor.appendChild(card);
  });
}

function renderBrandChips() {
  const row = document.getElementById('brandChips');
  if (!row) return;
  const chips = [`<button type="button" class="chip active" data-marca="">Todas las marcas</button>`].concat(
    marcasGlobal.map(
      (m) =>
        `<button type="button" class="chip" data-marca="${String(m.nombre).replace(/"/g, '&quot;')}">${m.nombre}</button>`
    )
  );
  row.innerHTML = chips.join('');
  row.querySelectorAll('.chip').forEach((btn) => {
    btn.addEventListener('click', () => {
      row.querySelectorAll('.chip').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      filtroMarca = btn.getAttribute('data-marca') || '';
      filtroEspecial = '';
      cargarCatalogo();
    });
  });
}

async function cargarSesionUI() {
  const chip = document.getElementById('userChip');
  const btnHdr = document.getElementById('btnLoginHeader');
  try {
    const r = await fetch('/api/me', { credentials: 'same-origin' });
    const data = await r.json();
    loggedInUser = data.user;
    if (data.user) {
      if (chip) chip.textContent = data.user.nombre;
      if (btnHdr) {
        btnHdr.textContent = data.user.rol === 'admin' ? 'Admin' : 'Mi cuenta';
        btnHdr.onclick = () => {
          window.location.href =
            data.user.rol === 'admin' ? 'dashboard_admin.html' : 'dashboard_cliente.html';
        };
      }
    } else {
      if (chip) chip.textContent = '';
      if (btnHdr) {
        btnHdr.textContent = 'Entrar';
        btnHdr.onclick = () => {
          window.location.href = 'login.html';
        };
      }
    }
  } catch {
    loggedInUser = null;
    if (chip) chip.textContent = '';
    if (btnHdr) {
      btnHdr.textContent = 'Entrar';
      btnHdr.onclick = () => {
        window.location.href = 'login.html';
      };
    }
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  updateCartBadge();

  document.getElementById('btnCart')?.addEventListener('click', async () => {
    if (!(await requireUserForCart())) return;
    openDrawer();
  });
  document.getElementById('closeCart')?.addEventListener('click', closeDrawer);
  document.getElementById('cartBackdrop')?.addEventListener('click', closeDrawer);

  document.getElementById('linkAyuda')?.addEventListener('click', (e) => {
    e.preventDefault();
    document.getElementById('seccion-ayuda')?.scrollIntoView({ behavior: 'smooth' });
  });
  document.getElementById('closeHelp')?.addEventListener('click', closeHelp);
  document.getElementById('helpBackdrop')?.addEventListener('click', closeHelp);

  document.body.addEventListener('click', (ev) => {
    const cat = ev.target.closest('[data-filter-cat]');
    if (cat) {
      if (cat.tagName === 'A') ev.preventDefault();
      filtroCategoria = cat.getAttribute('data-filter-cat') || '';
      filtroEspecial = '';
      document.querySelector('#catalogo')?.scrollIntoView({ behavior: 'smooth' });
      cargarCatalogo();
      return;
    }
    const sp = ev.target.closest('[data-filter-special]');
    if (sp) {
      ev.preventDefault();
      filtroEspecial = sp.getAttribute('data-filter-special') || '';
      filtroCategoria = '';
      document.querySelector('#catalogo')?.scrollIntoView({ behavior: 'smooth' });
      cargarCatalogo();
      return;
    }
    const sc = ev.target.closest('[data-scroll]');
    if (sc) {
      const sel = sc.getAttribute('data-scroll');
      if (sel) {
        document.querySelector(sel)?.scrollIntoView({ behavior: 'smooth' });
        if (sc.tagName === 'A') ev.preventDefault();
      }
    }
  });

  const searchForm = document.getElementById('searchForm');
  const busqueda = document.getElementById('busqueda');
  searchForm?.addEventListener('submit', (e) => {
    e.preventDefault();
    busquedaTexto = (busqueda?.value || '').trim();
    filtroEspecial = '';
    document.querySelector('#catalogo')?.scrollIntoView({ behavior: 'smooth' });
    cargarCatalogo();
  });
  busqueda?.addEventListener('input', () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      busquedaTexto = (busqueda.value || '').trim();
      filtroEspecial = '';
      cargarCatalogo();
    }, 350);
  });

  document.getElementById('btnCheckout')?.addEventListener('click', async () => {
    if (!getCart().length) {
      alert('Tu carrito está vacío.');
      return;
    }
    if (!(await requireUserForCart())) return;
    window.location.href = 'dashboard_cliente.html#checkout';
  });

  await cargarSesionUI();
  initAllCarousels();

  try {
    const mj = await fetch('/api/marcas').then((x) => x.json());
    marcasGlobal = Array.isArray(mj) ? mj : [];
    renderBrandChips();
    await cargarCatalogo();
    await cargarOfertasHome();
  } catch (e) {
    console.error(e);
    const contenedor = document.getElementById('productos');
    if (contenedor) {
      contenedor.innerHTML =
        '<p>No se pudieron cargar productos. Verifique el servidor y la base de datos.</p>';
    }
  }
});
