/* =========================
   ESTADO GLOBAL
========================= */

let usuarioActual = null;
let carrito = JSON.parse(localStorage.getItem("carrito")) || [];
let favoritos = JSON.parse(localStorage.getItem("favoritos")) || [];
let productosCache = [];

/* =========================
   INICIALIZAR
========================= */

async function init() {
  await verificarSesion();
  await cargarProductos();
  actualizarCart();
  actualizarUIUsuario();
}

/* =========================
   SESION (cookie, no localStorage)
========================= */

async function verificarSesion() {
  try {
    const res = await fetch("/api/me");
    const data = await res.json();
    usuarioActual = data.user || null;
  } catch {
    usuarioActual = null;
  }
}

function estaLogueado() {
  return usuarioActual !== null;
}

/* =========================
   UI SEGUN SESION
========================= */

function actualizarUIUsuario() {
  const topBar = document.querySelector(".top-bar .flex");
  if (!topBar) return;

  if (estaLogueado()) {
    topBar.innerHTML = `
      <span style="font-weight:bold">
        Hola, ${usuarioActual.nombre.split(" ")[0]}
      </span>
      <button
        onclick="cerrarSesion()"
        style="background:none;border:none;cursor:pointer;font-size:13px;text-decoration:underline">
        Cerrar sesión
      </button>
    `;
  }
}

/* =========================
   CARGAR PRODUCTOS DESDE API
========================= */

async function cargarProductos() {
  try {
    const res = await fetch("/api/productos");
    if (!res.ok) throw new Error("Error al obtener productos");
    productosCache = await res.json();
    renderizarProductos();
  } catch (e) {
    console.error("No se pudieron cargar los productos:", e);
  }
}

function renderizarProductos() {
  const contenedor = document.querySelector(".products");
  if (!contenedor || productosCache.length === 0) return;

  contenedor.innerHTML = productosCache.map(p => {
    const precio = Number(p.precio_venta || p.precio_lista || 0);
    const precioFmt = precio.toLocaleString("es-CO");
    const tieneOferta = p.oferta_porcentaje && Number(p.oferta_porcentaje) > 0;
    const precioOriginalFmt = tieneOferta
      ? Number(p.precio_lista).toLocaleString("es-CO")
      : null;

    return `
      <div class="product-card" id="producto-${p.id_producto}">
        <div class="product-image">
          <div class="product-icons">
            <button onclick="validarAcceso('favorito', ${p.id_producto})"
              title="Agregar a favoritos">
              <i class="fa-regular fa-heart"></i>
            </button>
            <button onclick="validarAcceso('carrito', ${p.id_producto})"
              title="Agregar al carrito">
              <i class="fa-solid fa-bag-shopping"></i>
            </button>
          </div>
          <img
            src="${p.imagen || 'https://via.placeholder.com/400x400?text=Sin+imagen'}"
            alt="${p.nombre}"
            onerror="this.src='https://via.placeholder.com/400x400?text=Sin+imagen'">
          ${tieneOferta ? `
            <span style="
              position:absolute;bottom:12px;left:12px;
              background:#ff0055;color:#fff;
              padding:4px 10px;border-radius:999px;
              font-size:12px;font-weight:bold">
              -${p.oferta_porcentaje}%
            </span>` : ""}
        </div>
        <div class="product-info">
          <h3>${p.nombre}</h3>
          <p>${p.categoria || ""}</p>
          <p class="price">
            $${precioFmt}
            ${tieneOferta ? `<span style="
              text-decoration:line-through;
              color:#999;font-size:13px;
              margin-left:8px">
              $${precioOriginalFmt}
            </span>` : ""}
          </p>
        </div>
      </div>
    `;
  }).join("");
}

/* =========================
   VALIDAR ACCESO
========================= */

function validarAcceso(accion, id) {
  if (!estaLogueado()) {
    document.getElementById("authModal").style.display = "flex";
    return;
  }

  if (accion === "carrito") agregarAlCarrito(id);
  if (accion === "favorito") agregarAFavoritos(id);
}

/* =========================
   AGREGAR CARRITO
========================= */

function agregarAlCarrito(id) {
  const producto = productosCache.find(p => p.id_producto === id);
  if (!producto) return;

  const existe = carrito.find(p => p.id_producto === id);

  if (existe) {
    existe.cantidad++;
  } else {
    carrito.push({
      id_producto: producto.id_producto,
      nombre: producto.nombre,
      precio: Number(producto.precio_venta || producto.precio_lista || 0),
      imagen: producto.imagen || "",
      marca: producto.marca || "",
      cantidad: 1,
    });
  }

  guardarCarrito();
  abrirCart();
}

/* =========================
   FAVORITOS
========================= */

function agregarAFavoritos(id) {
  if (!favoritos.includes(id)) {
    favoritos.push(id);
    localStorage.setItem("favoritos", JSON.stringify(favoritos));
    mostrarToast("Producto agregado a favoritos");
  }
}

/* =========================
   ACTUALIZAR CART UI
========================= */

function actualizarCart() {
  const cartItems = document.getElementById("cartItems");
  const cartCount = document.getElementById("cartCount");
  const subtotal = document.getElementById("subtotal");

  const totalUnidades = carrito.reduce((s, p) => s + p.cantidad, 0);
  cartCount.textContent = totalUnidades;

  if (carrito.length === 0) {
    cartItems.innerHTML = `
      <p class="text-gray-500">
        Tu carrito está vacío
      </p>`;
    subtotal.textContent = "$0";
    return;
  }

  let total = 0;
  cartItems.innerHTML = "";

  carrito.forEach(producto => {
    total += producto.precio * producto.cantidad;
    cartItems.innerHTML += `
      <div class="cart-item">
        <img
          src="${producto.imagen}"
          onerror="this.src='https://via.placeholder.com/90x90?text=N/A'">
        <div>
          <h3 class="font-bold">${producto.nombre}</h3>
          <p class="text-gray-500">${producto.marca || ""}</p>
          <p class="font-bold mt-2">
            $${producto.precio.toLocaleString("es-CO")}
          </p>
          <div class="flex gap-3 mt-3">
            <button onclick="restarCantidad(${producto.id_producto})">-</button>
            <span>${producto.cantidad}</span>
            <button onclick="sumarCantidad(${producto.id_producto})">+</button>
            <button
              onclick="eliminarProducto(${producto.id_producto})"
              class="text-red-500">
              Eliminar
            </button>
          </div>
        </div>
      </div>`;
  });

  subtotal.textContent = "$" + total.toLocaleString("es-CO");
}

/* =========================
   CANTIDAD
========================= */

function sumarCantidad(id) {
  const item = carrito.find(p => p.id_producto === id);
  if (item) item.cantidad++;
  guardarCarrito();
}

function restarCantidad(id) {
  const item = carrito.find(p => p.id_producto === id);
  if (item && item.cantidad > 1) item.cantidad--;
  guardarCarrito();
}

function eliminarProducto(id) {
  carrito = carrito.filter(p => p.id_producto !== id);
  guardarCarrito();
}

function guardarCarrito() {
  localStorage.setItem("carrito", JSON.stringify(carrito));
  actualizarCart();
}

/* =========================
   CHECKOUT → POST /api/pedidos
========================= */

async function hacerCheckout() {
  if (!estaLogueado()) {
    cerrarCart();
    document.getElementById("authModal").style.display = "flex";
    return;
  }

  if (carrito.length === 0) {
    mostrarToast("Tu carrito está vacío");
    return;
  }

  const btnCheckout = document.getElementById("btnCheckout");
  if (btnCheckout) {
    btnCheckout.disabled = true;
    btnCheckout.textContent = "Procesando...";
  }

  try {
    const items = carrito.map(p => ({
      id_producto: p.id_producto,
      cantidad: p.cantidad,
    }));

    const res = await fetch("/api/pedidos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        items,
        metodo_pago: "tarjeta_simulada",
      }),
    });

    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.message || "No se pudo procesar el pedido");
    }

    // Exito: limpiar carrito y mostrar confirmacion
    carrito = [];
    guardarCarrito();
    cerrarCart();
    mostrarConfirmacion(data);

  } catch (err) {
    mostrarToast("Error: " + err.message, true);
  } finally {
    if (btnCheckout) {
      btnCheckout.disabled = false;
      btnCheckout.textContent = "Ir al checkout";
    }
  }
}

/* =========================
   MODAL CONFIRMACION PEDIDO
========================= */

function mostrarConfirmacion(data) {
  let modal = document.getElementById("pedidoConfirmModal");

  if (!modal) {
    modal = document.createElement("div");
    modal.id = "pedidoConfirmModal";
    modal.style.cssText = `
      position:fixed;inset:0;
      background:rgba(0,0,0,.6);
      display:flex;align-items:center;
      justify-content:center;z-index:99999`;
    document.body.appendChild(modal);
  }

  const total = Number(data.total || 0).toLocaleString("es-CO");

  modal.innerHTML = `
    <div style="
      background:#fff;border-radius:24px;
      padding:40px;max-width:480px;
      width:90%;text-align:center">
      <div style="font-size:60px;margin-bottom:16px">✅</div>
      <h2 style="font-size:26px;font-weight:900;margin-bottom:12px">
        Pedido confirmado
      </h2>
      <p style="color:#555;margin-bottom:8px">
        Pedido <strong>#${data.id_pedido}</strong> registrado correctamente.
      </p>
      <p style="font-size:22px;font-weight:bold;margin:16px 0">
        Total: $${total}
      </p>
      <p style="color:#888;font-size:14px;margin-bottom:28px">
        Puedes ver el estado de tu pedido en
        <a href="mis-pedidos.html"
          style="color:#000;font-weight:bold;text-decoration:underline">
          Mis pedidos
        </a>
      </p>
      <button
        onclick="document.getElementById('pedidoConfirmModal').remove()"
        style="
          background:#000;color:#fff;
          border:none;border-radius:999px;
          padding:14px 32px;font-weight:bold;
          cursor:pointer;font-size:16px">
        Continuar comprando
      </button>
    </div>`;

  modal.style.display = "flex";
}

/* =========================
   TOAST NOTIFICACION
========================= */

function mostrarToast(msg, esError = false) {
  let toast = document.getElementById("toastMsg");
  if (!toast) {
    toast = document.createElement("div");
    toast.id = "toastMsg";
    toast.style.cssText = `
      position:fixed;bottom:30px;left:50%;
      transform:translateX(-50%);
      padding:14px 28px;border-radius:999px;
      font-weight:bold;font-size:15px;
      z-index:999999;transition:opacity .3s;
      box-shadow:0 4px 20px rgba(0,0,0,.15)`;
    document.body.appendChild(toast);
  }

  toast.style.background = esError ? "#ff0055" : "#111";
  toast.style.color = "#fff";
  toast.textContent = msg;
  toast.style.opacity = "1";

  clearTimeout(toast._t);
  toast._t = setTimeout(() => {
    toast.style.opacity = "0";
  }, 3000);
}

/* =========================
   MINI CART
========================= */

function abrirCart() {
  document.getElementById("miniCart").classList.add("active");
  document.getElementById("cartOverlay").style.display = "block";
}

function cerrarCart() {
  document.getElementById("miniCart").classList.remove("active");
  document.getElementById("cartOverlay").style.display = "none";
}

function toggleCart() {
  const cart = document.getElementById("miniCart");
  if (cart.classList.contains("active")) {
    cerrarCart();
  } else {
    abrirCart();
  }
}

/* =========================
   MODAL AUTH
========================= */

function cerrarModal() {
  document.getElementById("authModal").style.display = "none";
}

/* =========================
   NAVEGACION
========================= */

function irCatalogo() {
  window.location.href = "catalogo.html";
}

function abrirFavoritos() {
  if (!estaLogueado()) {
    document.getElementById("authModal").style.display = "flex";
    return;
  }
  window.location.href = "favoritos.html";
}

/* =========================
   CERRAR SESION (cookie)
========================= */

async function cerrarSesion() {
  try {
    await fetch("/api/logout", { method: "POST" });
  } catch (_) {}
  usuarioActual = null;
  localStorage.removeItem("carrito");
  localStorage.removeItem("favoritos");
  window.location.reload();
}

/* =========================
   CONECTAR BOTONES CHECKOUT
========================= */

function conectarBotonesCart() {
  const btnCheckout = document.querySelector(".cart-buttons .nike-btn");
  if (btnCheckout) {
    btnCheckout.id = "btnCheckout";
    btnCheckout.onclick = hacerCheckout;
  }

  const btnVerCarrito = document.querySelector(".cart-buttons .outline-btn");
  if (btnVerCarrito) {
    btnVerCarrito.onclick = () => {
      if (!estaLogueado()) {
        cerrarCart();
        document.getElementById("authModal").style.display = "flex";
        return;
      }
      window.location.href = "mis-pedidos.html";
    };
  }
}

/* =========================
   ARRANQUE
========================= */

document.addEventListener("DOMContentLoaded", async () => {
  await init();
  conectarBotonesCart();
});