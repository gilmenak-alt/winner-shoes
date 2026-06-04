async function postJSON(url, body) {
  return fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify(body),
  });
}

if (document.getElementById('loginForm')) {
  document.getElementById('loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const correo = document.getElementById('email').value.trim();
    const contraseña = document.getElementById('password').value;

    try {
      const response = await postJSON('/api/login', { correo, contraseña });
      const data = await response.json();

      if (response.ok) {
        if (data.user) {
          localStorage.setItem('usuario', JSON.stringify(data.user));
        }
        const q = new URLSearchParams(window.location.search);
        const next = q.get('next');
        const safe =
          next &&
          !next.includes('://') &&
          (next.startsWith('/') || next.endsWith('.html') || next.includes('index'));
        window.location.href = safe ? decodeURIComponent(next) : data.redirect || 'index.html';
      } else {
        alert(data.message || 'No se pudo iniciar sesión');
      }
    } catch (error) {
      console.error(error);
      alert('No se pudo conectar con el servidor');
    }
  });
}

if (document.getElementById('registerForm')) {
  document.getElementById('registerForm').addEventListener('submit', async (e) => {
    e.preventDefault();

    const formData = {
      nombre: document.getElementById('nombre').value.trim(),
      correo: document.getElementById('correo').value.trim(),
      contraseña: document.getElementById('contraseña').value,
      telefono: document.getElementById('telefono').value.trim(),
      direccion: document.getElementById('direccion').value.trim(),
    };

    try {
      const response = await postJSON('/api/registro', formData);
      const data = await response.json();

      if (response.ok) {
        alert('Registro exitoso. Ya puedes iniciar sesión.');
        window.location.href = 'login.html';
      } else {
        alert(data.message || 'Error al registrar');
      }
    } catch (error) {
      console.error(error);
      alert('Error de conexión al registrar');
    }
  });
}
