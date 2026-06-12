// ══════════════════════════════════════════════════════════════
//  MOTION SYSTEM — Toasts · Ripple · Count-up · Stagger
// ══════════════════════════════════════════════════════════════

// ── Toast notifications ──────────────────────────────────────
const TOAST_ICONS = { success:'fa-circle-check', error:'fa-circle-xmark', info:'fa-circle-info', warning:'fa-triangle-exclamation' };
function showToast(message, type = 'info', duration = 3200) {
    const container = document.getElementById('myl-toasts');
    if (!container) return;
    const t = document.createElement('div');
    t.className = `myl-toast myl-toast--${type}`;
    t.innerHTML = `<i class="fa-solid ${TOAST_ICONS[type]||TOAST_ICONS.info}" style="flex-shrink:0;font-size:14px"></i><span style="flex:1;line-height:1.4">${message}</span><button class="myl-toast-close" onclick="this.closest('.myl-toast').remove()" aria-label="Cerrar">✕</button>`;
    container.appendChild(t);
    setTimeout(() => {
        t.classList.add('myl-toast--out');
        setTimeout(() => t.remove(), 350);
    }, duration);
}

// ── Ripple en botones ────────────────────────────────────────
function addRippleTo(btn) {
    if (btn._hasRipple) return;
    btn._hasRipple = true;
    btn.style.position = 'relative';
    btn.style.overflow = 'hidden';
    btn.addEventListener('click', function(e) {
        const d = Math.max(this.clientWidth, this.clientHeight);
        const rect = this.getBoundingClientRect();
        const span = document.createElement('span');
        span.className = 'myl-ripple-span';
        span.style.cssText = `width:${d}px;height:${d}px;left:${e.clientX-rect.left-d/2}px;top:${e.clientY-rect.top-d/2}px`;
        this.appendChild(span);
        setTimeout(() => span.remove(), 620);
    });
}
function attachRipples(selector) {
    document.querySelectorAll(selector).forEach(addRippleTo);
}

// ── Count-up animado para KPIs ───────────────────────────────
function animateCount(el, endStr, duration = 950) {
    const isEuro = endStr.includes('€');
    const end = parseFloat(endStr.replace('€',''));
    const isInt = !endStr.includes('.');
    const t0 = performance.now();
    function tick(now) {
        const p = Math.min((now - t0) / duration, 1);
        const ease = 1 - Math.pow(1 - p, 4); // easeOutQuart
        const cur = end * ease;
        el.textContent = isInt
            ? Math.round(cur) + (isEuro ? '€' : '')
            : cur.toFixed(2) + (isEuro ? '€' : '');
        if (p < 1) requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
}

// ── Stagger de filas de tabla ────────────────────────────────
function staggerRows(tbodyOrSelector, delayMs = 25) {
    const tbody = typeof tbodyOrSelector === 'string'
        ? document.querySelector(tbodyOrSelector)
        : tbodyOrSelector;
    if (!tbody) return;
    [...tbody.querySelectorAll('tr')].forEach((row, i) => {
        row.classList.remove('row-in');
        row.style.animationDelay = '';
        // Force reflow then add class
        requestAnimationFrame(() => {
            row.style.animationDelay = `${i * delayMs}ms`;
            row.classList.add('row-in');
        });
    });
}

// ── Reiniciar animación de vista ─────────────────────────────
function triggerViewAnim(viewId) {
    const el = document.getElementById(`view-${viewId}`);
    if (!el) return;
    el.style.animation = 'none';
    void el.offsetWidth; // reflow
    el.style.animation = '';
    // también animar el título de la página
    const title = document.getElementById('page-title');
    if (title) { title.style.animation = 'none'; void title.offsetWidth; title.style.animation = ''; }
}

// ── Login Canvas — Rutas de envío premium ────────────────────
function initLoginCanvas() {
    const canvas  = document.getElementById('lx2-canvas');
    const overlay = document.getElementById('auth-overlay');
    if (!canvas || !overlay) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const ctx = canvas.getContext('2d');
    let W, H, rafId = null, last = 0;
    let grid = [];
    let flows = [];
    let nextFlow = 1800;

    const GAP = 24, R0 = 1.0;

    function buildGrid() {
        grid = [];
        for (let x = GAP * 0.5; x < W + GAP; x += GAP)
            for (let y = GAP * 0.5; y < H + GAP; y += GAP)
                grid.push({ x, y });
    }

    function resize() {
        const dpr = window.devicePixelRatio || 1;
        W = canvas.offsetWidth;
        H = canvas.offsetHeight;
        canvas.width  = W * dpr;
        canvas.height = H * dpr;
        ctx.scale(dpr, dpr);
        buildGrid();
    }

    // How much this flow "activates" a given dot (0..1)
    function waveAlpha(d, f) {
        const p = f.dir
            ? (d.x / W + d.y / H) * 0.5
            : ((W - d.x) / W + d.y / H) * 0.5;
        const behind = f.t - p;
        const trail  = 0.17;
        if (behind < 0 || behind > trail) return 0;
        const n = 1 - behind / trail;
        return n * n * 0.94;
    }

    function frame(ts) {
        rafId = requestAnimationFrame(frame);
        const dt = Math.min(ts - last, 50);
        last = ts;
        ctx.clearRect(0, 0, W, H);

        nextFlow -= dt;
        if (nextFlow <= 0) {
            flows.push({ t: -0.02, spd: 0.00020 + Math.random() * 0.00008, dir: Math.random() > 0.5 });
            nextFlow = 2500 + Math.random() * 2000;
        }
        flows = flows.filter(f => f.t < 1.20);
        flows.forEach(f => { f.t += f.spd * dt; });

        // Ambient glow blobs — siempre presentes, derivan lentamente
        const mn = Math.min(W, H);
        const b1x = W * (0.75 + Math.sin(ts * 0.00020) * 0.08);
        const b1y = H * (0.25 + Math.cos(ts * 0.00016) * 0.07);
        const g1 = ctx.createRadialGradient(b1x, b1y, 0, b1x, b1y, mn * 0.30);
        g1.addColorStop(0, 'rgba(109,40,217,0.062)'); g1.addColorStop(1, 'rgba(109,40,217,0)');
        ctx.beginPath(); ctx.arc(b1x, b1y, mn * 0.30, 0, 6.2832); ctx.fillStyle = g1; ctx.fill();
        const b2x = W * (0.20 + Math.sin(ts * 0.00015 + 2.1) * 0.06);
        const b2y = H * (0.76 + Math.cos(ts * 0.00012 + 1.3) * 0.06);
        const g2 = ctx.createRadialGradient(b2x, b2y, 0, b2x, b2y, mn * 0.24);
        g2.addColorStop(0, 'rgba(99,102,241,0.048)'); g2.addColorStop(1, 'rgba(99,102,241,0)');
        ctx.beginPath(); ctx.arc(b2x, b2y, mn * 0.24, 0, 6.2832); ctx.fillStyle = g2; ctx.fill();

        const n = grid.length;
        const alpha = new Float32Array(n);
        flows.forEach(f => {
            for (let i = 0; i < n; i++) {
                const a = waveAlpha(grid[i], f);
                if (a > alpha[i]) alpha[i] = a;
            }
        });

        // Grey base dots (batch)
        ctx.fillStyle = 'rgba(148,163,184,0.22)';
        ctx.beginPath();
        for (let i = 0; i < n; i++) {
            if (alpha[i] < 0.05) {
                ctx.moveTo(grid[i].x + R0, grid[i].y);
                ctx.arc(grid[i].x, grid[i].y, R0, 0, 6.2832);
            }
        }
        ctx.fill();

        // Purple wave dots — bucketed to reduce fillStyle changes
        const BUCKETS = 8;
        const buckets = Array.from({ length: BUCKETS }, () => []);
        for (let i = 0; i < n; i++) {
            if (alpha[i] >= 0.05) {
                buckets[Math.min(BUCKETS - 1, Math.floor(alpha[i] * BUCKETS))].push(i);
            }
        }
        for (let b = 0; b < BUCKETS; b++) {
            if (!buckets[b].length) continue;
            const a  = (b + 0.5) / BUCKETS;
            const r  = R0 + a * 1.4;
            const op = (0.14 + a * 0.54).toFixed(2);
            ctx.fillStyle = `rgba(109,40,217,${op})`;
            ctx.beginPath();
            buckets[b].forEach(i => {
                ctx.moveTo(grid[i].x + r, grid[i].y);
                ctx.arc(grid[i].x, grid[i].y, r, 0, 6.2832);
            });
            ctx.fill();
        }
    }

    const ro = new ResizeObserver(resize);

    function start() {
        if (rafId) return;
        resize();
        rafId = requestAnimationFrame(ts => { last = ts; frame(ts); });
        ro.observe(canvas.parentElement || document.body);
    }

    function stop() {
        if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
        try { ro.unobserve(canvas.parentElement || document.body); } catch(e) {}
    }

    new MutationObserver(() => {
        overlay.classList.contains('hidden') ? stop() : start();
    }).observe(overlay, { attributes: true, attributeFilter: ['class'] });

    if (!overlay.classList.contains('hidden')) start();
}

document.addEventListener('DOMContentLoaded', initLoginCanvas);

// ══════════════════════════════════════════════════════════════
// --- CONFIGURACIÓN INICIAL & DATOS ---
const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
const dateEl = document.getElementById('current-date');
if (dateEl) dateEl.innerText = new Date().toLocaleDateString('es-ES', options);

let authToken = localStorage.getItem('auth_token') || null;
const originalFetch = window.fetch;
window.fetch = async function(url, config = {}) {
    if (url.startsWith('/api/') && !url.includes('/login')) {
        config.headers = config.headers || {};
        if (authToken) {
            config.headers['Authorization'] = 'Bearer ' + authToken;
        }
    }
    const response = await originalFetch(url, config);
    // Si el servidor devuelve 401, la sesión ha expirado (ej: reinicio del servidor)
    // Redirigir al login automáticamente para evitar pérdida de datos
    if (response.status === 401 && url.startsWith('/api/') && !url.includes('/login') && !url.includes('/logout')) {
        authToken = null;
        localStorage.removeItem('auth_token');
        localStorage.removeItem('auth_rol');
        localStorage.removeItem('auth_username');
        // Mostrar login sin recargar la página para no perder datos en memoria
        document.getElementById('auth-overlay').style.opacity = '0';
        document.getElementById('auth-overlay').classList.remove('hidden');
        setTimeout(() => { document.getElementById('auth-overlay').style.opacity = '1'; }, 10);
        console.warn('[Sesión] Token inválido o sesión expirada. Redirigiendo al login.');
    }
    return response;
};

let clientes = [];
let facturas = [];
let presupuestos = [];
let clienteActualIndex = null;
let usuarioActualRol = localStorage.getItem('auth_rol') || null;
let usuarioActualUsername = localStorage.getItem('auth_username') || null;
let usuarioActualFoto = localStorage.getItem('auth_foto') || null;

// --- INACTIVIDAD (10 MINUTOS) ---
let inactividadTimer;
function resetInactividad() {
    clearTimeout(inactividadTimer);
    if(authToken) {
        inactividadTimer = setTimeout(async () => {
            // ── SEGURIDAD: invalidar sesión INMEDIATAMENTE, sin esperar confirmación ──
            // Si el usuario refresca la página en lugar de hacer clic en OK,
            // el token ya no existe ni en localStorage ni en el servidor.
            const tokenAInvalidar = authToken;

            // 1. Limpiar estado local al instante
            authToken = null;
            localStorage.removeItem('auth_token');
            localStorage.removeItem('auth_rol');
            localStorage.removeItem('auth_username');
            localStorage.removeItem('auth_foto');
            clearTimeout(inactividadTimer);

            // 2. Invalidar en el servidor (fire-and-forget)
            try {
                await fetch('/api/logout', {
                    method: 'POST',
                    headers: { 'Authorization': 'Bearer ' + tokenAInvalidar }
                });
            } catch(e) { /* sin conexión: no importa, el token ya no está en cliente */ }

            // 3. Mostrar el overlay de login de inmediato
            const overlay = document.getElementById('auth-overlay');
            if(overlay) {
                overlay.style.opacity = '0';
                overlay.classList.remove('hidden');
                setTimeout(() => { overlay.style.opacity = '1'; }, 10);
            }

            // 4. Informar al usuario (solo informativo, la sesión ya está cerrada)
            Swal.fire({
                title: 'Sesión Expirada',
                text: 'Se ha cerrado tu sesión por inactividad. Vuelve a iniciar sesión.',
                icon: 'warning',
                confirmButtonColor: '#7c3ae3',
                confirmButtonText: 'Entendido'
            });
        }, 600000); // 10 minutos
    }
}
document.addEventListener('mousemove', resetInactividad);
document.addEventListener('keypress', resetInactividad);
document.addEventListener('click', resetInactividad);
document.addEventListener('scroll', resetInactividad);


async function procesarLogin() {
    const username = document.getElementById('login-username').value;
    const pass = document.getElementById('login-pass').value;
    const errorEl = document.getElementById('login-error');
    
    try {
        const response = await fetch('/api/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password: pass })
        });
        const data = await response.json();
        
        if (data.success) {
            authToken = data.token;
            usuarioActualRol = data.rol;
            usuarioActualUsername = data.username;
            usuarioActualFoto = data.foto || null;
            prfMustChange = data.mustChangePassword === true;

            localStorage.setItem('auth_token', authToken);
            localStorage.setItem('auth_rol', usuarioActualRol);
            localStorage.setItem('auth_username', usuarioActualUsername);
            if (usuarioActualFoto) localStorage.setItem('auth_foto', usuarioActualFoto);

            const dropUser = document.getElementById('dropdown-username');
            const dropRole = document.getElementById('dropdown-role');
            if (dropUser) dropUser.innerText = data.username;
            if (dropRole) dropRole.innerText = data.rol;
            actualizarAvatarIndex();

            resetInactividad();

            errorEl.classList.add('hidden');
            document.getElementById('auth-overlay').style.opacity = '0';
            setTimeout(() => {
                document.getElementById('auth-overlay').classList.add('hidden');
                aplicarRestriccionesRol();
                inicializarApp();
                // Si el servidor indica que debe cambiar contraseña, redirigir a perfil
                if (prfMustChange) {
                    setTimeout(() => navigate('perfil'), 300);
                }
            }, 500);
        } else {
            errorEl.innerText = data.error || 'Credenciales incorrectas';
            errorEl.classList.remove('hidden');
        }
    } catch(err) {
        errorEl.innerText = 'Error de conexión con el servidor.';
        errorEl.classList.remove('hidden');
    }
}

function aplicarRestriccionesRol() {
    const btnBackups = document.getElementById('nav-backups');
    const btnUsr = document.getElementById('nav-usuarios');
    const btnEvt = document.getElementById('nav-eventos');
    const btnAct = document.getElementById('nav-actualizaciones');
    const seccionLogistica = document.getElementById('nav-seccion-logistica');
    const separadorLogistica = seccionLogistica ? seccionLogistica.previousElementSibling : null;

    const esSuperadmin = usuarioActualRol === 'superadmin';
    const esAdmin = usuarioActualRol === 'admin' || esSuperadmin;
    const esUser = usuarioActualRol === 'user';

    // Sección de logística: visible para todos los roles (user, admin, superadmin)
    if (seccionLogistica) {
        seccionLogistica.style.display = '';
        if (separadorLogistica && separadorLogistica.classList.contains('border-t')) {
            separadorLogistica.style.display = '';
        }
    }

    // Secciones de administración: SOLO visibles para admin y superadmin
    // El usuario regular (user) no puede acceder a Copias de Seguridad,
    // Gestión de Usuarios ni Registro de Eventos
    if (esUser) {
        if (btnBackups) btnBackups.style.display = 'none';
        if (btnUsr)     btnUsr.style.display     = 'none';
        if (btnEvt)     btnEvt.style.display     = 'none';
        if (btnAct)     btnAct.style.display     = 'none';
    } else {
        // admin y superadmin ven backups, usuarios y eventos
        if (btnBackups) btnBackups.style.display = 'flex';
        if (btnUsr)     btnUsr.style.display     = 'flex';
        if (btnEvt)     btnEvt.style.display     = 'flex';
        // Actualizaciones: SOLO superadmin
        if (btnAct)     btnAct.style.display     = esSuperadmin ? 'flex' : 'none';
    }

    // Actualizar etiqueta del rol en el dropdown
    const dropRole = document.getElementById('dropdown-role');
    if (dropRole) {
        const labels = {
            'superadmin': '🔑 Super Admin',
            'admin': 'Administrador',
            'user': 'Usuario'
        };
        dropRole.innerText = labels[usuarioActualRol] || usuarioActualRol;
    }
}


// Cargar datos reales desde el disco duro al iniciar
async function inicializarApp() {
    try {
        const response = await fetch('/api/datos');
        if (!response.ok) {
            // Si el servidor devuelve error, el interceptor de fetch ya habrá manejado el 401
            console.warn('[App] No se pudieron cargar los datos:', response.status);
            return;
        }
        const data = await response.json();
        clientes = data.clientes || [];
        facturas = data.facturas || [];
        migrarFechasAISO(facturas); // Migrar fechas antiguas d/m/aaaa → ISO
        datosVersion = data.version ?? datosVersion; // Versión para control de concurrencia
        datosYaCargados = true; // ✅ Datos cargados, ya es seguro guardar

        // Migración SIF: si hay facturas sin hash, guardar para que el servidor las selle
        if (facturas.some(f => !f.hash)) {
            await guardarDatosEnDisco();
        }

        // Cargar presupuestos desde el servidor
        await cargarPresupuestosDelServidor();
        
        // Exponer clientes al módulo de logística
        window.appClientes = clientes;
        window.authToken = authToken;
        window.socket = socket;

        // Exponer el usuario actual al módulo de logística
        // (se actualiza aquí para que esté disponible desde el primer acceso)
        window.currentAppUser = {
            username:  usuarioActualUsername || 'usuario',
            role:      (usuarioActualRol === 'superadmin' || usuarioActualRol === 'admin') ? 'admin' : 'operario',
            firstname: usuarioActualUsername || 'Usuario',
            lastname:  '',
            active:    true
        };

        if (typeof window.sincronizarClientes === 'function') {
            window.sincronizarClientes();
        }
        
        actualizarTablas();
        actualizarDashboard();
        agregarLinea(); // Iniciar factura con una línea vacía

        // Ripple en todos los botones primarios
        setTimeout(() => {
            attachRipples('button.bg-purple-600, button.bg-purple-700, button.al-btn, .auth-submit-btn, button[onclick*="procesarLogin"]');
        }, 400);

    } catch (error) {
        console.error("Error cargando la base de datos:", error);
        Swal.fire({
            icon: 'error',
            title: 'Fallo de Conexión',
            text: 'No se pudo conectar con el servidor de base de datos local.',
            confirmButtonColor: '#7c3ae3'
        });
    }
}

// Sincronización en tiempo real con WebSockets
const socket = window.io ? io() : null;

if (socket) {
    socket.on('datosActualizados', () => {
        if (authToken) {
            sincronizarEnSegundoPlano();
        }
    });
}

async function sincronizarEnSegundoPlano() {
    try {
        const response = await fetch('/api/datos');
        const data = await response.json();
        clientes = data.clientes || [];
        facturas = data.facturas || [];
        migrarFechasAISO(facturas); // Migrar fechas antiguas d/m/aaaa → ISO
        datosVersion = data.version ?? datosVersion; // Mantener la versión sincronizada

        actualizarTablas();
        actualizarDashboard();
        
        const nextIdEl = document.getElementById('next-invoice-id');
        if (nextIdEl && facturaEnEdicionIndex === null) {
            nextIdEl.innerText = `INV-${String(facturas.length + 1).padStart(3, '0')}`;
        }
        
        const viFac = document.getElementById('view-facturas');
        if (viFac && viFac.classList.contains('active')) {
            renderTablaFacturas();
        }

        // Refrescar presupuestos en segundo plano (sin limpiar si falla)
        cargarPresupuestosDelServidor().then(() => {
            const viPres = document.getElementById('view-presupuestos');
            if (viPres && viPres.classList.contains('active')) renderTablaPresupuestos();
        });

        const viCli = document.getElementById('view-ficha-cliente');
        if (viCli && viCli.classList.contains('active') && clienteActualIndex !== null) {
            // Actualizamos silenciosamente los datos de cliente si está en pantalla
            if (clientes[clienteActualIndex]) verCliente(clienteActualIndex);
        }
        
    } catch (e) {
        console.error("Error en sincronización silenciosa:", e);
    }
}

// Flag que indica si los datos ya fueron cargados desde el servidor
let datosYaCargados = false;
// Versión de los datos cargados (control de concurrencia: evita pisar cambios de otro usuario)
let datosVersion = null;

// Función central para guardar en el disco duro
window.guardarGlobal = guardarDatosEnDisco;
async function guardarDatosEnDisco() {
    // Protección crítica #1: nunca enviar datos sin sesión activa.
    if (!authToken) {
        console.warn('[Seguridad] Intento de guardar sin sesión activa. Operación cancelada.');
        return;
    }
    // Protección crítica #2: nunca enviar datos si aún no se han cargado del servidor.
    // Si los datos no están cargados, los arrays locales están vacíos y enviarlos
    // sobreescribiría y borraría todos los datos del servidor.
    if (!datosYaCargados) {
        console.warn('[Seguridad] Intento de guardar antes de cargar datos del servidor. Operación cancelada.');
        return;
    }
    try {
        const response = await fetch('/api/datos', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ clientes, facturas, baseVersion: datosVersion })
        });
        if (response.status === 409) {
            // Conflicto de concurrencia: otro usuario guardó antes. Recargamos y avisamos.
            const errData = await response.json().catch(() => ({}));
            if (errData.conflicto) {
                await sincronizarEnSegundoPlano();
                Swal.fire({
                    icon: 'warning',
                    title: 'Datos actualizados por otro usuario',
                    text: errData.error || 'Se recargaron los datos más recientes. Revisa y vuelve a guardar tus cambios.',
                    confirmButtonColor: '#7c3ae3'
                });
            } else {
                console.warn('[Disco] Operación rechazada por el servidor:', errData.error || '');
            }
            return;
        }
        if (!response.ok) {
            const errData = await response.json().catch(() => ({}));
            console.warn('[Disco] Error al guardar datos:', response.status, errData.error || '');
            return;
        }
        const okData = await response.json().catch(() => ({}));
        if (okData.version) datosVersion = okData.version; // Actualizar a la versión recién guardada
        // El servidor devuelve las facturas con hashes SHA-256 asignados; actualizar local
        if (okData.facturas && Array.isArray(okData.facturas)) {
            facturas = okData.facturas;
            actualizarTablas();
        }
        showToast('Datos guardados correctamente', 'success', 2500);
    } catch (error) {
        console.error("Error guardando datos:", error);
        showToast('Error al guardar los datos', 'error');
    }
}

// --- NAVEGACIÓN ---
function navigate(viewId, btnElement) {
    // Si hay cambio de contraseña forzado, solo se permite ir a perfil
    if (prfMustChange && viewId !== 'perfil') {
        Swal.fire({
            title: 'Contraseña requerida',
            text: 'Por seguridad debes establecer tu contraseña personal antes de continuar.',
            icon: 'warning',
            confirmButtonColor: '#7c3ae3',
            confirmButtonText: 'Ir a Mi Perfil'
        }).then(() => navigate('perfil'));
        return;
    }

    // Vistas restringidas: solo accesibles para admin y superadmin
    const vistasSoloAdmin = ['backups', 'usuarios', 'eventos', 'actualizaciones'];
    if (vistasSoloAdmin.includes(viewId) && usuarioActualRol === 'user') {
        Swal.fire({
            title: 'Acceso Denegado',
            text: 'Tu rol no tiene permisos para acceder a esta sección.',
            icon: 'error',
            confirmButtonColor: '#7c3ae3'
        });
        return;
    }


    document.querySelectorAll('.section-view').forEach(el => {
        el.classList.remove('active');
        el.classList.add('hidden');
    });
    
    document.querySelectorAll('.nav-btn').forEach(el => {
        el.classList.remove('bg-purple-600', 'text-white', 'shadow-lg', 'shadow-purple-900/20', 'active');
        el.classList.add('text-slate-500', 'hover:bg-slate-100', 'dark:hover:bg-slate-800', 'hover:text-slate-900', 'dark:text-slate-400', 'dark:hover:text-white');
    });

    const target = document.getElementById(`view-${viewId}`);
    if (target) {
        target.classList.remove('hidden');
        target.classList.add('active');
        triggerViewAnim(viewId);
    }

    if (btnElement) {
        btnElement.classList.add('bg-purple-600', 'text-white', 'shadow-lg', 'shadow-purple-900/20', 'active');
        btnElement.classList.remove('text-slate-500', 'hover:bg-slate-100', 'dark:hover:bg-slate-800', 'dark:text-slate-400', 'hover:text-slate-900', 'dark:hover:text-white');
    }

    const titles = {
        'dashboard': 'Panel de Control General',
        'clientes': 'Directorio de Clientes',
        'nuevo-cliente': 'Nuevo Cliente',
        'facturas': 'Gestión de Facturas',
        'presupuestos': 'Presupuestos',
        'nuevo-presupuesto': 'Nuevo Presupuesto',
        'nueva-factura': 'Emisión de Factura',
        'ficha-cliente': 'Ficha de Cliente',
        'backups': 'Copias de Seguridad',
        'usuarios': 'Gestión de Usuarios',
        'eventos': 'Registro de Actividad',
        'logistica': 'Módulo de Logística',
        'perfil': 'Mi Perfil',
        'actualizaciones': 'Actualizaciones del Sistema'
    };
    document.getElementById('page-title').innerText = titles[viewId] || 'MYL Express';

    if (viewId === 'dashboard') actualizarDashboard();
    if (viewId === 'facturas') renderTablaFacturas();
    if (viewId === 'presupuestos') cargarPresupuestosDelServidor().then(renderTablaPresupuestos);
    if (viewId === 'backups') cargarBackups();
    if (viewId === 'usuarios') cargarUsuarios();
    if (viewId === 'eventos') cargarEventos();
    if (viewId === 'perfil') initPerfilSection();
    if (viewId === 'actualizaciones') actCargarHistorial();
    if (viewId === 'nueva-factura') {
        renderSelectClientes();
        document.getElementById('next-invoice-id').innerText = `INV-${String(facturas.length + 1).padStart(3, '0')}`;
    }
    if (viewId === 'nuevo-presupuesto') {
        renderSelectClientesPresupuesto();
        document.getElementById('next-presupuesto-id').innerText = `PRES-${String(presupuestos.length + 1).padStart(3, '0')}`;
        if (document.getElementById('lineas-presupuesto').children.length === 0) agregarLineaPresupuesto();
    }
    // Inicializar módulo de logística al navegar por primera vez
    if (viewId === 'logistica' && window.LI) {
        window.appClientes = clientes;
        window.authToken = authToken;
        window.socket = socket;
        window.LI.init().catch(e => console.error('[LI] Error init:', e));
    }
}

// --- NAVEGACIÓN LOGÍSTICA (desde el sidebar principal) ---
// Subvista de logística actualmente activa
let _liCurrentView = null;

function navegarLogistica(subview, btnElement) {

    // 1. Activar la sección de logística en el layout principal
    document.querySelectorAll('.section-view').forEach(el => {
        el.classList.remove('active');
        el.classList.add('hidden');
    });
    const liSection = document.getElementById('view-logistica');
    if (liSection) {
        liSection.classList.remove('hidden');
        liSection.classList.add('active');
    }

    // 2. Quitar el resaltado de todos los nav-btn
    document.querySelectorAll('.nav-btn').forEach(el => {
        el.classList.remove('bg-purple-600', 'text-white', 'shadow-lg', 'shadow-purple-900/20', 'active');
        el.classList.add('text-slate-500', 'hover:bg-slate-100', 'dark:hover:bg-slate-800', 'hover:text-slate-900', 'dark:text-slate-400', 'dark:hover:text-white');
    });

    // 3. Resaltar el botón activo del sidebar principal
    if (btnElement) {
        btnElement.classList.add('bg-purple-600', 'text-white', 'shadow-lg', 'shadow-purple-900/20', 'active');
        btnElement.classList.remove('text-slate-500', 'hover:bg-slate-100', 'dark:hover:bg-slate-800', 'dark:text-slate-400', 'hover:text-slate-900', 'dark:hover:text-white');
    }

    // 4. Actualizar el título de la cabecera
    const liTitles = {
        'shipments': 'Envíos — Logística',
        'storage':   'Almacén de Palets',
        'partners':  'Colaboradoras',
        'labels':    'Documentos y Etiquetas',
    };
    const pageTitle = document.getElementById('page-title');
    if (pageTitle) pageTitle.innerText = liTitles[subview] || 'Logística';

    // 5. Sincronizar el usuario autenticado para el módulo de logística
    //    superadmin se mapea a 'admin' en el módulo de logística
    window.currentAppUser = {
        username: usuarioActualUsername || 'superadmin',
        role: (usuarioActualRol === 'superadmin' || usuarioActualRol === 'admin') ? 'admin' : (usuarioActualRol === 'user' ? 'operario' : 'consulta'),
        firstname: usuarioActualUsername || 'SuperAdmin',
        lastname: '',
        active: true
    };

    // 6. Inicializar el módulo de logística si es la primera vez
    const initAndShow = () => {
        _liCurrentView = subview;
        syncDarkToLogistica(); // Propagar tema oscuro/claro al módulo de logística
        if (typeof showView === 'function') {
            showView(subview);
        }
        sincronizarBadgesLogistica();
    };

    if (window.LI) {
        window.appClientes = clientes;
        window.authToken = authToken;
        window.socket = socket;
        window.LI.init()
            .then(initAndShow)
            .catch(e => { console.error('[LI] Error init:', e); initAndShow(); });
    } else {
        // LI no disponible todavía, llamar directamente si showView existe
        initAndShow();
    }
}

// Sincroniza los badges del sidebar principal con los contadores del módulo de logística
function sincronizarBadgesLogistica() {
    try {
        const nbShip = document.getElementById('nb-shipments');
        const nbStor = document.getElementById('nb-storage');
        const nbPart = document.getElementById('nb-partners');

        const badgeEnvios = document.getElementById('nav-badge-envios');
        const badgeAlmacen = document.getElementById('nav-badge-almacen');
        const badgeColab = document.getElementById('nav-badge-colaboradoras');

        if (badgeEnvios && nbShip) badgeEnvios.textContent = nbShip.textContent;
        if (badgeAlmacen && nbStor) badgeAlmacen.textContent = nbStor.textContent;
        if (badgeColab && nbPart) badgeColab.textContent = nbPart.textContent;
    } catch(e) {}
}

// --- GESTIÓN DE CLIENTES ---
// Ahora abre la vista inline en vez del modal flotante
function abrirModalCliente() { navigate('nuevo-cliente'); }
function cerrarModalCliente() { navigate('clientes'); }

// Cambio dinámico de etiquetas según tipo de cliente
const setupLabels = (prefix) => {
    const selector = document.getElementById(`${prefix}cli-tipo`);
    if (!selector) return;
    
    selector.addEventListener('change', (e) => {
        const isEmpresa = e.target.value === 'Empresa';
        document.getElementById(`${prefix}label-nombre`).innerText = isEmpresa ? 'Empresa / Razón Social' : 'Nombre y Apellidos';
        document.getElementById(`${prefix}label-nif`).innerText = isEmpresa ? 'CIF' : 'DNI / NIE / Pasaporte';
    });
};
setupLabels(''); // Para el modal de nuevo cliente
setupLabels('edit-'); // Para la ficha de edición

// Guardar Nuevo Cliente
document.getElementById('form-cliente').addEventListener('submit', function(e) {
    e.preventDefault();
    const nuevoCliente = {
        tipo:   document.getElementById('cli-tipo').value,
        nombre: document.getElementById('cli-nombre').value,
        nif:    document.getElementById('cli-nif').value,
        pago:   document.getElementById('cli-pago').value,
        email:  document.getElementById('cli-email').value,
        tlf:    document.getElementById('cli-tlf').value,
        dir:    document.getElementById('cli-dir').value,
        cp:     document.getElementById('cli-cp').value,
        pob:    document.getElementById('cli-pob').value,
        prov:   (document.getElementById('cli-prov-nuevo') || {}).value || 'Sin especificar'
    };

    clientes.push(nuevoCliente);
    guardarDatosEnDisco();
    actualizarTablas();
    this.reset();
    // Volver al listado y mostrar toast en vez de Swal
    navigate('clientes');
    showToast(`Cliente "${nuevoCliente.nombre}" registrado correctamente`, 'success');
});

// Guardar Cambios en Cliente Existente
document.getElementById('form-editar-cliente').addEventListener('submit', function(e) {
    e.preventDefault();
    if (clienteActualIndex === null) return;
    
    const oldNif = clientes[clienteActualIndex].nif;
    const datosModificados = {
        tipo: document.getElementById('edit-cli-tipo').value,
        nombre: document.getElementById('edit-cli-nombre').value,
        nif: document.getElementById('edit-cli-nif').value,
        pago: document.getElementById('edit-cli-pago').value,
        email: document.getElementById('edit-cli-email').value,
        tlf: document.getElementById('edit-cli-tlf').value,
        dir: document.getElementById('edit-cli-dir').value,
        cp: document.getElementById('edit-cli-cp').value,
        pob: document.getElementById('edit-cli-pob').value
    };

    clientes[clienteActualIndex] = datosModificados;
    
    // Actualizar historial de facturas si cambió el NIF (referencia lógica)
    facturas.forEach(f => {
        if (f.cliente.nif === oldNif) f.cliente = { ...datosModificados };
    });

    guardarDatosEnDisco();
    actualizarTablas();
    verCliente(clienteActualIndex); // Refrescar vista
    
    Swal.fire({
        title: 'Perfil Actualizado',
        icon: 'success',
        toast: true,
        position: 'top-end',
        timer: 3000,
        showConfirmButton: false
    });
});

function verCliente(index) {
    clienteActualIndex = index;
    const cli = clientes[index];

    // Rellenar Ficha — cabecera
    document.getElementById('cli-view-nombre').innerText = cli.nombre;
    document.getElementById('cli-view-tipo').innerText = cli.tipo;

    // Avatar: iniciales + color según tipo
    const avatarEl = document.getElementById('cli-avatar');
    avatarEl.textContent = cli.nombre.substring(0, 2).toUpperCase();
    avatarEl.style.background = cli.tipo === 'Particular'
        ? 'linear-gradient(135deg,#0ea5e9,#6366f1)'
        : 'linear-gradient(135deg,#7c3ae3,#4f46e5)';

    // Header info strip
    const nifHdr = document.getElementById('cli-view-nif-hdr');
    const emailTxt = document.getElementById('cli-view-email-txt');
    const tlfTxt   = document.getElementById('cli-view-tlf-txt');
    const pagoTxt  = document.getElementById('cli-view-pago-txt');
    const dirTxt   = document.getElementById('cli-view-dir-txt');
    if (nifHdr)   nifHdr.textContent   = cli.nif   || '—';
    if (emailTxt) emailTxt.textContent = cli.email || '—';
    if (tlfTxt)   tlfTxt.textContent   = cli.tlf   || '—';
    if (pagoTxt)  pagoTxt.textContent  = cli.pago  || '—';
    if (dirTxt) {
        const partes = [cli.dir, cli.cp, cli.pob].filter(Boolean);
        dirTxt.textContent = partes.length ? partes.join(', ') : '—';
    }

    // Rellenar Formulario de Edición
    document.getElementById('edit-cli-tipo').value = cli.tipo;
    document.getElementById('edit-cli-nombre').value = cli.nombre;
    document.getElementById('edit-cli-nif').value = cli.nif;
    document.getElementById('edit-cli-pago').value = cli.pago;
    document.getElementById('edit-cli-email').value = cli.email;
    document.getElementById('edit-cli-tlf').value = cli.tlf;
    document.getElementById('edit-cli-dir').value = cli.dir;
    document.getElementById('edit-cli-cp').value = cli.cp;
    document.getElementById('edit-cli-pob').value = cli.pob;

    // Cargar historial de Facturas del cliente
    const histFacturas = facturas.filter(f => f.cliente.nif === cli.nif);
    const totalFacturado = histFacturas.reduce((s, f) => s + (f.total || 0), 0);
    const totalStr = totalFacturado >= 1000
        ? `${(totalFacturado / 1000).toFixed(1)}k€`
        : `${totalFacturado.toFixed(0)}€`;

    // Stats strip izquierda
    const sfEl = document.getElementById('cli-stat-facturas');
    const stEl = document.getElementById('cli-stat-total');
    const spEl = document.getElementById('cli-stat-pago');
    if (sfEl) sfEl.textContent = histFacturas.length;
    if (stEl) stEl.textContent = totalStr;
    if (spEl) spEl.textContent = cli.pago || '—';

    // KPI cards derecha
    const kfEl = document.getElementById('cli-kpi-facturas');
    const ktEl = document.getElementById('cli-kpi-total');
    const kpEl = document.getElementById('cli-kpi-pago');
    if (kfEl) kfEl.textContent = histFacturas.length;
    if (ktEl) ktEl.textContent = `${totalFacturado.toFixed(2)}€`;
    if (kpEl) kpEl.textContent = cli.pago || '—';

    document.getElementById('cli-count-facturas').innerText = `${histFacturas.length} Facturas`;
    
    const tbody = document.getElementById('tablas-facturas-cliente');
    tbody.innerHTML = histFacturas.length > 0 
        ? histFacturas.map(f => {
            const globalIdx = facturas.indexOf(f);
            return `
            <tr class="group hover:bg-slate-50 dark:hover:bg-slate-800/50">
                <td class="px-3 py-2.5 pl-5 font-mono text-xs font-bold text-purple-500 dark:text-purple-400">#${String(f.id).padStart(5, '0')}</td>
                <td class="px-3 py-2.5 text-sm text-slate-600 dark:text-slate-300">${formatFechaES(f.fecha)}</td>
                <td class="px-3 py-2.5 text-right font-bold text-slate-900 dark:text-white">${f.total.toFixed(2)}€</td>
                <td class="px-3 py-2.5 pr-4 text-center">
                    <div class="flex justify-center gap-1">
                        <button onclick="verVistaPrevia(${globalIdx})" title="Vista Previa" class="p-1.5 rounded-lg text-slate-400 hover:text-purple-600 hover:bg-purple-50 dark:hover:bg-purple-900/20 transition-all"><i class="fa-solid fa-eye text-xs"></i></button>
                        <button onclick="imprimirFacturaDirecta(${globalIdx})" title="Imprimir" class="p-1.5 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-all"><i class="fa-solid fa-print text-xs"></i></button>
                        <button onclick="descargarPDF(${globalIdx})" title="Descargar PDF" class="p-1.5 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-all"><i class="fa-solid fa-file-pdf text-xs"></i></button>
                    </div>
                </td>
            </tr>
        `}).join('')
        : '<tr><td colspan="4" class="px-6 py-8 text-center text-slate-400 dark:text-slate-500 italic">No hay facturas registradas.</td></tr>';

    navigate('ficha-cliente');
}

function borrarCliente(index, e) {
    if (e) e.stopPropagation();
    Swal.fire({
        title: '¿Eliminar cliente?',
        text: "Esta acción no se puede deshacer.",
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#ef4444',
        cancelButtonColor: '#334155',
        confirmButtonText: 'Sí, eliminar',
        cancelButtonText: 'Cancelar'
    }).then((result) => {
        if (result.isConfirmed) {
            clientes.splice(index, 1);
            guardarDatosEnDisco();
            actualizarTablas();
            if (clienteActualIndex === index) navigate('clientes');
        }
    });
}

// --- LÓGICA DE FACTURACIÓN ---
let lineasCount = 0;
let facturaEnEdicionIndex = null;
function agregarLinea() {
    lineasCount++;
    const tbody = document.getElementById('lineas-factura');
    const tr = document.createElement('tr');
    tr.id = `linea-${lineasCount}`;
    tr.className = "group animate-in fade-in";
    tr.innerHTML = `
        <td class="py-4">
            <input type="text" class="desc-linea w-full bg-transparent border-none focus:ring-0 text-slate-800 dark:text-slate-200 placeholder-slate-600 font-medium" placeholder="Descripción del servicio..." required>
        </td>
        <td class="py-4 text-right">
            <div class="flex items-center justify-end gap-1">
                <input type="number" step="0.01" class="imp-linea w-24 bg-transparent border-none text-right focus:ring-0 text-slate-900 dark:text-white font-bold" placeholder="0.00" oninput="calcularTotales()" required>
                <span class="text-slate-400 dark:text-slate-500 font-bold">€</span>
            </div>
        </td>
        <td class="py-4 text-center">
            <button type="button" onclick="eliminarLinea(${lineasCount})" class="text-slate-600 hover:text-red-500 transition-all opacity-0 group-hover:opacity-100">
                <i class="fa-solid fa-trash-can"></i>
            </button>
        </td>
    `;
    tbody.appendChild(tr);
}

function eliminarLinea(id) {
    const el = document.getElementById(`linea-${id}`);
    if (el) el.remove();
    calcularTotales();
}

function calcularTotales() {
    let subtotal = 0;
    document.querySelectorAll('.imp-linea').forEach(input => subtotal += parseFloat(input.value) || 0);
    const ivaPorcentaje = parseFloat(document.getElementById('fac-iva-porcentaje').value) || 0;
    const iva = subtotal * (ivaPorcentaje / 100);
    const total = subtotal + iva;

    document.getElementById('fac-subtotal').innerText = subtotal.toFixed(2) + ' €';
    document.getElementById('fac-iva').innerText = iva.toFixed(2) + ' €';
    document.getElementById('fac-total').innerText = total.toFixed(2) + ' €';
    
    return { subtotal, iva, total };
}

function renderSelectClientes() {
    const select = document.getElementById('fac-cliente');
    const valorActual = select.value;
    select.innerHTML = '<option value="">-- Elige un cliente --</option>' + 
        clientes.map((c, i) => `<option value="${i}">${c.nombre} (${c.nif})</option>`).join('');
    select.value = valorActual;
}

document.getElementById('form-factura').addEventListener('submit', function(e) {
    e.preventDefault();
    const indexCli = document.getElementById('fac-cliente').value;
    if (!indexCli) return Swal.fire('Error', 'Debes seleccionar un cliente.', 'warning');
    
    const concepts = [];
    const descs = document.querySelectorAll('.desc-linea');
    const imps = document.querySelectorAll('.imp-linea');
    
    if (descs.length === 0) return Swal.fire('Sin líneas', 'Añade al menos un concepto a la factura.', 'info');
    
    for (let i = 0; i < descs.length; i++) {
        concepts.push({ descripcion: descs[i].value, importe: parseFloat(imps[i].value) || 0 });
    }

    const { subtotal, iva, total } = calcularTotales();
    const ivaPorcentaje = parseFloat(document.getElementById('fac-iva-porcentaje').value) || 0;
    
    let mensajeExito = '';

    if (facturaEnEdicionIndex !== null) {
        // En modo Edición
        facturas[facturaEnEdicionIndex].cliente = { ...clientes[indexCli] };
        facturas[facturaEnEdicionIndex].conceptos = concepts;
        facturas[facturaEnEdicionIndex].subtotal = subtotal;
        facturas[facturaEnEdicionIndex].iva = iva;
        facturas[facturaEnEdicionIndex].ivaPorcentaje = ivaPorcentaje;
        facturas[facturaEnEdicionIndex].total = total;
        // Mantenemos misma ID y fecha original
        mensajeExito = 'Cambios guardados correctamente.';
    } else {
        // Nueva Factura
        const nuevaFactura = {
            id: facturas.length > 0 ? facturas[facturas.length-1].id + 1 : 1, // ID auto incremental simple sin reuso
            fecha: new Date().toISOString().split('T')[0], // ISO YYYY-MM-DD
            cliente: { ...clientes[indexCli] },
            conceptos: concepts,
            subtotal, iva, ivaPorcentaje, total
        };
        facturas.push(nuevaFactura);
        mensajeExito = 'La factura se ha emitido y guardado.';
    }

    guardarDatosEnDisco();
    
    Swal.fire({
        title: facturaEnEdicionIndex !== null ? 'Factura Actualizada' : 'Factura Emitida',
        text: mensajeExito,
        icon: 'success',
        confirmButtonColor: '#7c3ae3'
    }).then(() => {
        this.reset();
        document.getElementById('lineas-factura').innerHTML = '';
        agregarLinea();
        calcularTotales();
        actualizarTablas();
        // Resetear botones y modo
        document.getElementById('btn-emitir').innerHTML = 'EMITIR FACTURA <i class="fa-solid fa-paper-plane ml-2"></i>';
        facturaEnEdicionIndex = null;
        navigate('facturas', document.querySelectorAll('.nav-btn')[2]);
    });
});

function cancelarEdicion() {
    document.getElementById('form-factura').reset();
    document.getElementById('lineas-factura').innerHTML = '';
    agregarLinea();
    calcularTotales();
    facturaEnEdicionIndex = null;
    document.getElementById('btn-emitir').innerHTML = 'EMITIR FACTURA <i class="fa-solid fa-paper-plane ml-2"></i>';
    navigate('facturas', document.querySelectorAll('.nav-btn')[2]);
}

// --- RENDERIZADO DE DASHBOARD Y TABLAS ---
function actualizarDashboard() {
    const totalFacturado = facturas.reduce((acc, f) => acc + f.total, 0);
    const totalIVA = facturas.reduce((acc, f) => acc + f.iva, 0);
    const cliCount = clientes.length;
    const facCount = facturas.length;

    const container = document.getElementById('dashboard-kpis');
    if (!container) return;

    const kpiConfig = [
        { label: 'Total Facturado',   value: totalFacturado.toFixed(2) + '€', icon: 'fa-euro-sign',   bar: 'linear-gradient(90deg,#7c3ae3,#6366f1)', iconBg: 'rgba(124,58,237,0.1)',  iconColor: '#7c3ae3' },
        { label: 'IVA Acumulado',     value: totalIVA.toFixed(2) + '€',       icon: 'fa-percentage',  bar: 'linear-gradient(90deg,#f59e0b,#ef4444)', iconBg: 'rgba(245,158,11,0.1)', iconColor: '#d97706' },
        { label: 'Total Clientes',    value: cliCount,                         icon: 'fa-users',       bar: 'linear-gradient(90deg,#10b981,#06b6d4)', iconBg: 'rgba(16,185,129,0.1)', iconColor: '#059669' },
        { label: 'Facturas Emitidas', value: facCount,                         icon: 'fa-file-invoice',bar: 'linear-gradient(90deg,#3b82f6,#8b5cf6)', iconBg: 'rgba(59,130,246,0.1)', iconColor: '#2563eb' },
    ];

    container.innerHTML = kpiConfig.map((k, idx) => `
        <div class="kpi-card-v3" style="animation-delay:${idx * 70}ms">
            <span class="kpi-accent-line" style="background:${k.bar}"></span>
            <div class="kpi-body" style="display:flex;flex-direction:column;gap:10px;padding:18px 18px 16px">
                <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:8px">
                    <p class="kpi-label-v3" style="margin:0;padding-top:2px">${k.label}</p>
                    <div class="kpi-icon" style="background:${k.iconBg};color:${k.iconColor};flex-shrink:0">
                        <i class="fa-solid ${k.icon}"></i>
                    </div>
                </div>
                <p class="kpi-val count-anim" data-target="${k.value}" style="font-variant-numeric:tabular-nums">0</p>
            </div>
        </div>
    `).join('');

    // Count-up animado en cada KPI
    requestAnimationFrame(() => {
        document.querySelectorAll('#dashboard-kpis .count-anim').forEach(el => {
            animateCount(el, el.dataset.target, 1000);
        });
    });

    // Recent Tables
    const fTab = document.getElementById('tablas-facturas-recientes');
    const cTab = document.getElementById('tablas-clientes-recientes');

    fTab.innerHTML = facturas.slice(-5).reverse().map(f => `
        <div class="flex items-center justify-between px-5 py-3 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
            <div class="flex items-center gap-3 min-w-0">
                <span class="font-mono text-xs text-purple-500 dark:text-purple-400 font-bold shrink-0">#${String(f.id).padStart(4,'0')}</span>
                <div class="min-w-0">
                    <p class="text-sm font-semibold text-slate-900 dark:text-white truncate">${f.cliente.nombre}</p>
                    <p class="text-xs text-slate-400">${formatFechaES(f.fecha)}</p>
                </div>
            </div>
            <span class="font-bold text-slate-900 dark:text-white text-sm shrink-0 ml-2">${f.total.toFixed(2)}€</span>
        </div>
    `).join('') || '<p class="px-5 py-8 text-center text-slate-400 text-sm italic">Sin movimientos recientes.</p>';

    cTab.innerHTML = clientes.slice(-5).reverse().map(c => `
        <div class="flex items-center justify-between px-5 py-3 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
            <div class="flex items-center gap-3 min-w-0">
                <div class="w-7 h-7 rounded-lg bg-emerald-50 dark:bg-emerald-900/20 flex items-center justify-center text-emerald-600 dark:text-emerald-400 font-bold text-xs shrink-0">
                    ${c.nombre.substring(0,1).toUpperCase()}
                </div>
                <div class="min-w-0">
                    <p class="text-sm font-semibold text-slate-900 dark:text-white truncate">${c.nombre}</p>
                    <p class="text-xs text-slate-400 font-mono">${c.nif}</p>
                </div>
            </div>
            <span class="text-xs px-2 py-0.5 rounded-md font-bold uppercase shrink-0 ml-2 ${c.tipo === 'Empresa' ? 'bg-purple-100 text-purple-600 dark:bg-purple-900/30 dark:text-purple-400' : 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300'}">${c.tipo}</span>
        </div>
    `).join('') || '<p class="px-5 py-8 text-center text-slate-400 text-sm italic">Sin clientes registrados.</p>';

    actualizarGraficos();
}

function actualizarTablas() {
    const tbody = document.getElementById('tablas-clientes');
    if (!tbody) return;

    if (!clientes.length) {
        tbody.innerHTML = `<tr><td colspan="4"><div class="empty-state">
            <div class="empty-state-ico"><i class="fa-solid fa-users"></i></div>
            <p class="empty-state-title">Aún no hay clientes registrados</p>
            <p class="empty-state-desc">Añade tu primer cliente para empezar a emitir facturas y gestionar envíos.</p>
            <button class="empty-state-btn" onclick="navigate('nuevo-cliente')"><i class="fa-solid fa-plus"></i> Añadir primer cliente</button>
        </div></td></tr>`;
        return;
    }

    tbody.innerHTML = clientes.map((c, i) => `
        <tr class="group cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors" onclick="verCliente(${i})">
            <td class="px-4 py-3">
                <div class="flex items-center gap-3 min-w-0">
                    <div class="w-8 h-8 rounded-lg bg-purple-50 dark:bg-purple-900/20 flex items-center justify-center text-purple-600 dark:text-purple-400 font-bold text-sm shrink-0 group-hover:bg-purple-600 group-hover:text-white transition-all">
                        ${c.nombre.substring(0, 1).toUpperCase()}
                    </div>
                    <div class="min-w-0">
                        <p class="font-semibold text-slate-900 dark:text-white text-sm truncate">${c.nombre}</p>
                        <p class="text-xs text-slate-400 font-mono truncate">${c.nif}</p>
                    </div>
                </div>
            </td>
            <td class="px-4 py-3 text-center">
                <span class="inline-block px-2 py-0.5 rounded-md text-[10px] font-bold uppercase ${c.tipo === 'Empresa' ? 'bg-purple-100 text-purple-600 dark:bg-purple-900/30 dark:text-purple-400' : 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300'}">
                    ${c.tipo}
                </span>
            </td>
            <td class="px-4 py-3 min-w-0">
                <p class="text-xs text-slate-600 dark:text-slate-300 truncate"><i class="fa-solid fa-envelope w-4 mr-1.5 text-slate-400"></i>${c.email || '—'}</p>
                <p class="text-xs text-slate-400 mt-0.5 truncate"><i class="fa-solid fa-phone w-4 mr-1.5"></i>${c.tlf || '—'}${c.pob ? ' · ' + c.pob : ''}</p>
            </td>
            <td class="px-4 py-3">
                <div class="flex justify-center gap-0.5">
                    <button onclick="borrarCliente(${i}, event)" class="btn-icon danger" title="Eliminar"><i class="fa-solid fa-trash-can"></i></button>
                    <button class="btn-icon" title="Ver cliente"><i class="fa-solid fa-chevron-right"></i></button>
                </div>
            </td>
        </tr>
    `).join('');
    staggerRows(tbody, 20);
}

// Búsqueda en tiempo real
const busquedaInput = document.getElementById('busqueda-cliente');
if (busquedaInput) {
    busquedaInput.addEventListener('input', function(e) {
        const query = e.target.value.toLowerCase();
        const filas = document.querySelectorAll('#tablas-clientes tr');
        filas.forEach(f => {
            const tx = f.innerText.toLowerCase();
            f.style.display = tx.includes(query) ? '' : 'none';
        });
    });
}

// --- GRÁFICOS Y VISTA FACTURAS ---
let chartFacturacion = null;

// ─── Nave espacial: estado de animación ─────────────────────────────────────
let _shipT     = 0;
let _shipRAF   = null;
let _shipStart = null;
const _SHIP_DUR = 2400;
function _easeInOutQuart(t) { return t<0.5 ? 8*t*t*t*t : 1-Math.pow(-2*t+2,4)/2; }
function _drawShip(c, x, y, angle) {
    const s = 14; // tamaño prominente
    c.save();
    c.translate(x, y);
    c.rotate(angle);

    // Estela de fuego del motor (cono detrás)
    const trail = c.createLinearGradient(-s*5, 0, -s*0.5, 0);
    trail.addColorStop(0,   'rgba(139,92,246,0)');
    trail.addColorStop(0.6, 'rgba(167,139,250,0.45)');
    trail.addColorStop(1,   'rgba(196,181,253,0.85)');
    c.fillStyle = trail;
    c.beginPath();
    c.moveTo(-s*0.5,  0);
    c.lineTo(-s*5,    s*0.9);
    c.lineTo(-s*5,   -s*0.9);
    c.closePath();
    c.fill();

    // Chispa naranja en el motor
    const spark = c.createRadialGradient(-s*0.5, 0, 0, -s*0.5, 0, s*0.9);
    spark.addColorStop(0,   'rgba(251,146,60,0.9)');
    spark.addColorStop(0.4, 'rgba(167,139,250,0.5)');
    spark.addColorStop(1,   'rgba(139,92,246,0)');
    c.fillStyle = spark;
    c.beginPath(); c.arc(-s*0.5, 0, s*0.9, 0, Math.PI*2); c.fill();

    // Aura exterior (halo morado)
    c.shadowColor = 'rgba(139,92,246,0.9)';
    c.shadowBlur  = 18;

    // Cuerpo principal: violeta oscuro
    c.fillStyle = '#6d28d9';
    c.beginPath();
    c.moveTo( s*1.3,  0);          // nariz
    c.lineTo(-s*0.15,  s*0.52);    // ala inferior
    c.lineTo(-s*0.6,   0);         // cola
    c.lineTo(-s*0.15, -s*0.52);    // ala superior
    c.closePath();
    c.fill();

    // Borde brillante (highlight en el lado superior)
    c.shadowBlur = 0;
    c.strokeStyle = 'rgba(196,181,253,0.8)';
    c.lineWidth   = 1.5;
    c.beginPath();
    c.moveTo(s*1.3, 0);
    c.lineTo(-s*0.15, -s*0.52);
    c.lineTo(-s*0.6, 0);
    c.stroke();

    // Cabina: punto blanco brillante
    c.shadowColor = 'rgba(255,255,255,0.9)';
    c.shadowBlur  = 8;
    c.fillStyle   = '#ffffff';
    c.beginPath(); c.arc(s*0.35, 0, s*0.22, 0, Math.PI*2); c.fill();

    c.restore();
}
// ─────────────────────────────────────────────────────────────────────────────

function actualizarGraficos() {
    if (chartFacturacion) chartFacturacion.destroy();

    const isDark = document.documentElement.classList.contains('dark');
    const gridColor = isDark ? 'rgba(255, 255, 255, 0.04)' : 'rgba(0, 0, 0, 0.04)';
    const textColor = isDark ? '#94a3b8' : '#64748b';

    const meses = {};
    facturas.forEach(f => {
        // Soporta ISO (YYYY-MM-DD) y formato antiguo (d/m/aaaa)
        const s = String(f.fecha || '').trim();
        let mesKey = null;
        if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
            const [y, m] = s.split('-');
            mesKey = `${parseInt(m, 10)}/${y}`;
        } else {
            const p = s.split('/');
            if (p.length === 3) mesKey = `${parseInt(p[1], 10)}/${p[2]}`;
        }
        if (mesKey) meses[mesKey] = (meses[mesKey] || 0) + f.total;
    });

    const mesesNombres = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
    
    const parsedMeses = {};
    Object.keys(meses).forEach(k => {
        const p = k.split('/');
        const mesInt = parseInt(p[0], 10);
        const formatLabel = `${mesesNombres[mesInt - 1]} ${p[1]}`;
        parsedMeses[formatLabel] = meses[k];
    });

    const labels = Object.keys(parsedMeses);
    const values = Object.values(parsedMeses);

    const ctxFact = document.getElementById('chart-facturacion');
    if (ctxFact) {
        const ctx2d = ctxFact.getContext('2d');
        const areaGradient = ctx2d.createLinearGradient(0, 0, 0, 340);
        areaGradient.addColorStop(0,    'rgba(139, 92, 246, 0.40)');
        areaGradient.addColorStop(0.45, 'rgba(124, 58, 237, 0.12)');
        areaGradient.addColorStop(1,    'rgba(124, 58, 237, 0.00)');

        // Plugin: clip progresivo + rayos + nave espacial
        const spikePlugin = {
            id: 'spikes',
            beforeDatasetsDraw(chart) {
                // Revelar línea de izquierda a derecha según _shipT
                if (_shipT >= 1) return;
                const { ctx: c, chartArea } = chart;
                const revealX = chartArea.left + (chartArea.right - chartArea.left) * _shipT;
                c.save();
                c.beginPath();
                c.rect(0, 0, revealX + 22, chart.height);
                c.clip();
            },
            afterDatasetsDraw(chart) {
                const { ctx: c, chartArea } = chart;
                if (_shipT < 1) c.restore(); // quitar clip del beforeDatasetsDraw

                const meta = chart.getDatasetMeta(0);
                if (!meta?.data || meta.data.length < 1) return;
                const pts = meta.data;
                const n   = pts.length;

                // Índice flotante de la nave sobre los puntos
                const floatIdx = _shipT * (n - 1);

                pts.forEach((point, j) => {
                    if (point.skip) return;
                    // Los rayos se encienden al pasar la nave
                    const reveal = Math.min(1, Math.max(0, (floatIdx - j + 0.5) * 2.0));
                    if (reveal <= 0) return;
                    const bottom = chartArea.bottom;
                    if (bottom - point.y <= 0) return;

                    // Rayo vertical
                    const beam = c.createLinearGradient(point.x, point.y, point.x, bottom);
                    beam.addColorStop(0,   `rgba(167,139,250,${0.72 * reveal})`);
                    beam.addColorStop(0.4, `rgba(124,58,237,${0.30 * reveal})`);
                    beam.addColorStop(1,   'rgba(124,58,237,0)');
                    c.save();
                    c.shadowColor = 'rgba(139,92,246,0.5)';
                    c.shadowBlur  = 7;
                    c.strokeStyle = beam;
                    c.lineWidth   = 1.5;
                    c.beginPath();
                    c.moveTo(point.x, point.y + 5);
                    c.lineTo(point.x, bottom);
                    c.stroke();

                    // Halo en el punto
                    const halo = c.createRadialGradient(point.x, point.y, 0, point.x, point.y, 16);
                    halo.addColorStop(0,   `rgba(196,181,253,${0.55 * reveal})`);
                    halo.addColorStop(0.5, `rgba(139,92,246,${0.18 * reveal})`);
                    halo.addColorStop(1,   'rgba(139,92,246,0)');
                    c.shadowBlur = 0;
                    c.fillStyle  = halo;
                    c.beginPath();
                    c.arc(point.x, point.y, 16, 0, Math.PI * 2);
                    c.fill();

                    // Reflejo en la base
                    const base = c.createRadialGradient(point.x, bottom, 0, point.x, bottom, 14);
                    base.addColorStop(0, `rgba(167,139,250,${0.32 * reveal})`);
                    base.addColorStop(1, 'rgba(124,58,237,0)');
                    c.fillStyle = base;
                    c.beginPath();
                    c.ellipse(point.x, bottom, 14, 5, 0, 0, Math.PI * 2);
                    c.fill();
                    c.restore();
                });

                // Dibujar nave en la posición actual de la curva bezier
                if (_shipT <= 0.005 || _shipT >= 0.995 || n < 2) return;
                const seg = Math.min(Math.floor(floatIdx), n - 2);
                const lt  = floatIdx - seg;
                const p0  = pts[seg];
                const p1  = pts[seg + 1];
                const c1x = (p0.cp2x != null) ? p0.cp2x : (p0.x + p1.x) / 2;
                const c1y = (p0.cp2y != null) ? p0.cp2y : p0.y;
                const c2x = (p1.cp1x != null) ? p1.cp1x : (p0.x + p1.x) / 2;
                const c2y = (p1.cp1y != null) ? p1.cp1y : p1.y;
                const mt  = 1 - lt;
                const sx  = mt*mt*mt*p0.x + 3*mt*mt*lt*c1x + 3*mt*lt*lt*c2x + lt*lt*lt*p1.x;
                const sy  = mt*mt*mt*p0.y + 3*mt*mt*lt*c1y + 3*mt*lt*lt*c2y + lt*lt*lt*p1.y;
                const dx  = 3*mt*mt*(c1x-p0.x) + 6*mt*lt*(c2x-c1x) + 3*lt*lt*(p1.x-c2x);
                const dy  = 3*mt*mt*(c1y-p0.y) + 6*mt*lt*(c2y-c1y) + 3*lt*lt*(p1.y-c2y);
                _drawShip(c, sx, sy, Math.atan2(dy, dx));
            }
        };

        chartFacturacion = new Chart(ctxFact, {
            type: 'line',
            plugins: [spikePlugin],
            data: {
                labels: labels,
                datasets: [{
                    label: 'Facturación',
                    data: values,
                    fill: true,
                    backgroundColor: areaGradient,
                    borderColor: 'rgba(167,139,250,1)',
                    borderWidth: 2,
                    tension: 0.45,
                    pointBackgroundColor: '#c4b5fd',
                    pointBorderColor: isDark ? '#1e1b4b' : '#ede9fe',
                    pointBorderWidth: 2,
                    pointRadius: 5,
                    pointHoverRadius: 8,
                    pointHoverBackgroundColor: '#a78bfa',
                    pointHoverBorderColor: '#ffffff',
                    pointHoverBorderWidth: 2.5,
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                animation: false,
                interaction: { mode: 'index', intersect: false },
                layout: { padding: { top: 20, right: 16, bottom: 4 } },
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        backgroundColor: isDark ? 'rgba(15,23,42,0.97)' : 'rgba(255,255,255,0.98)',
                        titleColor: isDark ? '#e2e8f0' : '#1e293b',
                        bodyColor: '#8b5cf6',
                        titleFont: { size: 13, family: 'Inter', weight: '600' },
                        bodyFont: { size: 18, family: 'Inter', weight: '800' },
                        borderColor: isDark ? 'rgba(139,92,246,0.3)' : 'rgba(139,92,246,0.18)',
                        borderWidth: 1,
                        padding: 14,
                        cornerRadius: 12,
                        displayColors: false,
                        callbacks: {
                            title: (items) => items[0].label,
                            label: (ctx) => new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(ctx.raw)
                        }
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        grid: { color: gridColor, drawBorder: false },
                        ticks: {
                            color: textColor,
                            font: { family: 'Inter', size: 12, weight: '500' },
                            padding: 12,
                            callback: (v) => v >= 1000 ? (v/1000).toFixed(v%1000===0?0:1)+'k €' : v+' €'
                        },
                        border: { display: false }
                    },
                    x: {
                        grid: { display: false },
                        ticks: {
                            color: textColor,
                            font: { family: 'Inter', size: 13, weight: '700' },
                            padding: 12
                        },
                        border: { display: false }
                    }
                }
            }
        });

        // Lanzar la animación de la nave (RAF independiente de Chart.js)
        if (_shipRAF) { cancelAnimationFrame(_shipRAF); _shipRAF = null; }
        _shipT = 0; _shipStart = null;
        const shipTick = (ts) => {
            if (!_shipStart) _shipStart = ts;
            const raw = Math.min((ts - _shipStart) / _SHIP_DUR, 1);
            _shipT = _easeInOutQuart(raw);
            if (chartFacturacion) chartFacturacion.draw();
            if (raw < 1) { _shipRAF = requestAnimationFrame(shipTick); }
            else { _shipT = 1; if (chartFacturacion) chartFacturacion.draw(); _shipRAF = null; }
        };
        _shipRAF = requestAnimationFrame(shipTick);
    }
}

// Estado de filtros de la vista Facturas (texto + rango de fechas)
let filtroFacturaTexto = '';
let filtroFechaDesde = null;
let filtroFechaHasta = null;

/**
 * Convierte una fecha ISO ("2026-04-07") a un objeto Date.
 * Retro-compatible: también acepta el formato antiguo d/m/aaaa ("7/4/2026").
 */
function parseFechaFactura(str) {
    if (!str) return null;
    const s = String(str).trim();
    // Formato ISO YYYY-MM-DD
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
        const [y, m, d] = s.split('-').map(Number);
        const dt = new Date(y, m - 1, d);
        return isNaN(dt.getTime()) ? null : dt;
    }
    // Retro-compatibilidad: formato antiguo d/m/aaaa
    const p = s.split('/');
    if (p.length === 3) {
        const d = parseInt(p[0], 10), m = parseInt(p[1], 10), y = parseInt(p[2], 10);
        const dt = new Date(y, m - 1, d);
        return isNaN(dt.getTime()) ? null : dt;
    }
    return null;
}

/**
 * Formatea una fecha ISO ("2026-04-07") para mostrar en español ("7/4/2026").
 * Retro-compatible: si ya viene en formato d/m/aaaa, la devuelve tal cual.
 */
function formatFechaES(str) {
    if (!str) return '';
    const s = String(str).trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
        const [, mm, dd] = s.split('-');
        const y = s.split('-')[0];
        return `${parseInt(dd, 10)}/${parseInt(mm, 10)}/${y}`;
    }
    return s; // ya en formato legible o desconocido
}

/**
 * Convierte en memoria todas las fechas de facturas y presupuestos
 * del formato antiguo d/m/aaaa a ISO YYYY-MM-DD.
 * Llamar después de cada carga desde el servidor.
 */
function migrarFechasAISO(lista) {
    if (!Array.isArray(lista)) return;
    lista.forEach(item => {
        if (!item.fecha) return;
        const s = String(item.fecha).trim();
        // Si ya es ISO, no hacer nada
        if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return;
        // Convertir d/m/aaaa → YYYY-MM-DD
        const p = s.split('/');
        if (p.length === 3) {
            const d = String(parseInt(p[0], 10)).padStart(2, '0');
            const m = String(parseInt(p[1], 10)).padStart(2, '0');
            const y = p[2];
            item.fecha = `${y}-${m}-${d}`;
        }
    });
}

function renderTablaFacturas() {
    const tbody = document.getElementById('tablas-facturas-completas');
    if (!tbody) return;

    // Lista en orden inverso (más recientes primero) preservando el índice real para las acciones
    let lista = facturas.map((f, idx) => ({ f, indexReal: idx })).reverse();

    // Filtro de texto (ID, fecha, cliente, NIF, importe)
    const q = (filtroFacturaTexto || '').toLowerCase().trim();
    if (q) {
        lista = lista.filter(({ f }) => {
            const campos = `${f.id} ${f.fecha} ${formatFechaES(f.fecha)} ${f.cliente?.nombre || ''} ${f.cliente?.nif || ''} ${f.total}`.toLowerCase();
            return campos.includes(q);
        });
    }
    // Filtro por rango de fechas
    if (filtroFechaDesde) lista = lista.filter(({ f }) => { const d = parseFechaFactura(f.fecha); return d && d >= filtroFechaDesde; });
    if (filtroFechaHasta) lista = lista.filter(({ f }) => { const d = parseFechaFactura(f.fecha); return d && d <= filtroFechaHasta; });

    if (!lista.length) {
        const esFiltrando = q || filtroFechaDesde || filtroFechaHasta;
        tbody.innerHTML = `<tr><td colspan="6"><div class="empty-state">
            <div class="empty-state-ico"><i class="fa-solid fa-file-invoice"></i></div>
            <p class="empty-state-title">${esFiltrando ? 'Sin resultados para este filtro' : 'Aún no hay facturas emitidas'}</p>
            <p class="empty-state-desc">${esFiltrando ? 'Prueba con otros términos de búsqueda o limpia los filtros.' : 'Crea tu primera factura y empieza a controlar tu facturación.'}</p>
            ${esFiltrando ? '' : '<button class="empty-state-btn" onclick="navigate(\'nueva-factura\')"><i class="fa-solid fa-plus"></i> Crear primera factura</button>'}
        </div></td></tr>`;
        return;
    }

    tbody.innerHTML = lista.map(({ f, indexReal }) => {
        return `
        <tr class="group hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors">
            <td class="px-4 py-3 font-mono text-purple-500 dark:text-purple-400 font-bold text-xs">#${String(f.id).padStart(4, '0')}</td>
            <td class="px-4 py-3 text-xs text-slate-500 dark:text-slate-400 whitespace-nowrap">${formatFechaES(f.fecha)}</td>
            <td class="px-4 py-3 min-w-0">
                <p class="font-semibold text-slate-900 dark:text-white text-sm truncate">${f.cliente.nombre}</p>
                <p class="text-[10px] text-slate-400 font-mono truncate">${f.cliente.nif}</p>
            </td>
            <td class="px-4 py-3 text-right">
                <p class="text-sm font-semibold text-slate-700 dark:text-slate-300">${f.subtotal.toFixed(2)}€</p>
                <p class="text-[10px] text-slate-400">IVA ${f.iva.toFixed(2)}€</p>
            </td>
            <td class="px-4 py-3 text-right font-bold text-slate-900 dark:text-white text-sm whitespace-nowrap">${f.total.toFixed(2)}€</td>
            <td class="px-4 py-3">
                <div class="flex justify-center gap-0.5">
                    <button onclick="verVistaPrevia(${indexReal})" class="btn-icon" title="Vista Previa"><i class="fa-solid fa-eye"></i></button>
                    <button onclick="editarFactura(${indexReal})" class="btn-icon" title="Editar"><i class="fa-solid fa-pen"></i></button>
                    <button onclick="descargarPDF(${indexReal})" class="btn-icon" title="PDF"><i class="fa-solid fa-file-pdf"></i></button>
                    <button onclick="borrarFacturaLegal(${indexReal})" class="btn-icon danger" title="Borrar"><i class="fa-solid fa-trash-can"></i></button>
                </div>
            </td>
        </tr>
        `;
    }).join('') || `<tr><td colspan="6" class="p-8 text-center text-slate-500 italic">${(q || filtroFechaDesde || filtroFechaHasta) ? 'No hay facturas que coincidan con el filtro.' : 'Aún no hay facturas registradas.'}</td></tr>`;
    staggerRows(tbody, 30);
}

const busquedaFacturaInput = document.getElementById('busqueda-factura');
if (busquedaFacturaInput) {
    busquedaFacturaInput.addEventListener('input', function(e) {
        filtroFacturaTexto = e.target.value || '';
        renderTablaFacturas();
    });
}

// Filtros por rango de fechas en la vista Facturas
function aplicarFiltroFechaFacturas() {
    const desde = document.getElementById('factura-fecha-desde');
    const hasta = document.getElementById('factura-fecha-hasta');
    filtroFechaDesde = (desde && desde.value) ? new Date(desde.value + 'T00:00:00') : null;
    filtroFechaHasta = (hasta && hasta.value) ? new Date(hasta.value + 'T23:59:59') : null;
    renderTablaFacturas();
}

function limpiarFiltrosFacturas() {
    filtroFacturaTexto = '';
    filtroFechaDesde = null;
    filtroFechaHasta = null;
    const b = document.getElementById('busqueda-factura');
    const d = document.getElementById('factura-fecha-desde');
    const h = document.getElementById('factura-fecha-hasta');
    if (b) b.value = '';
    if (d) d.value = '';
    if (h) h.value = '';
    renderTablaFacturas();
}

// --- FUNCIONES AVANZADAS FACTURAS (CRUD & PDF) ---
async function generarHTMLFactura(f) {
    // Generar QR con los campos obligatorios del SIF (RD 1007/2023)
    let qrDataUrl = '';
    try {
        if (typeof QRCode !== 'undefined') {
            const qrContent = `https://dadoga31.github.io/myl-verificar/#n=INV-${String(f.id).padStart(3,'0')}&f=${f.fecha}&t=${f.total.toFixed(2)}&h=${f.hash || 'PENDIENTE'}`;
            // qrcodejs trabaja con DOM; creamos un div temporal para extraer el canvas
            qrDataUrl = await new Promise(resolve => {
                const div = document.createElement('div');
                div.style.cssText = 'position:absolute;left:-9999px;top:0;';
                document.body.appendChild(div);
                try {
                    new QRCode(div, { text: qrContent, width: 96, height: 96, correctLevel: QRCode.CorrectLevel.M });
                } catch(e2) { document.body.removeChild(div); resolve(''); return; }
                setTimeout(() => {
                    const canvas = div.querySelector('canvas');
                    const img = div.querySelector('img');
                    const url = canvas ? canvas.toDataURL('image/png') : (img ? img.src : '');
                    document.body.removeChild(div);
                    resolve(url);
                }, 80);
            });
        }
    } catch(e) { /* sin QR si falla la librería */ }

    const hashTexto = f.hash
        ? `${f.hash.slice(0,8).toUpperCase()}...${f.hash.slice(-8).toUpperCase()}`
        : 'PENDIENTE';

    return `
        <div id="invoice-render" style="padding: 40px; background: white; color: #334155; font-family: sans-serif; width: 800px; max-width: 100%; box-sizing: border-box; margin: 0 auto;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 50px;">
                <div style="flex-grow: 1;">
                    <img src="logo-myl.png" style="height: 60px; margin-bottom: 10px;">
                    <p style="margin: 0; font-size: 14px; color: #64748b; font-weight: bold; letter-spacing: 0.05em;">EXPRESS LOGÍSTICA</p>
                </div>
                <div style="text-align: right;">
                    <h2 style="margin: 0; font-size: 20px;">FACTURA</h2>
                    <p style="margin: 5px 0; font-size: 16px; font-weight: bold; color: #1e293b;">#INV-${String(f.id).padStart(3, '0')}</p>
                    <p style="margin: 0; font-size: 12px; color: #64748b;">Fecha: ${formatFechaES(f.fecha)}</p>
                </div>
            </div>

            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 40px; margin-bottom: 50px;">
                <div>
                    <h4 style="border-bottom: 1px solid #e2e8f0; padding-bottom: 5px; margin-bottom: 10px; font-size: 12px; color: #94a3b8; text-transform: uppercase;">EMISOR</h4>
                    <p style="margin: 0; font-weight: bold;">Myl Express Log&#237;stica S.L.</p>
                    <p style="margin: 2px 0; font-size: 13px;">CIF: B26658302</p>
                    <p style="margin: 2px 0; font-size: 13px;">Calle Mercurio 5</p>
                    <p style="margin: 2px 0; font-size: 13px;">45200 Illescas (Toledo)</p>
                </div>
                <div>
                    <h4 style="border-bottom: 1px solid #e2e8f0; padding-bottom: 5px; margin-bottom: 10px; font-size: 12px; color: #94a3b8; text-transform: uppercase;">CLIENTE</h4>
                    <p style="margin: 0; font-weight: bold;">${f.cliente.nombre}</p>
                    <p style="margin: 2px 0; font-size: 13px;">NIF/CIF: ${f.cliente.nif}</p>
                    <p style="margin: 2px 0; font-size: 13px;">${f.cliente.dir}</p>
                    <p style="margin: 2px 0; font-size: 13px;">${f.cliente.cp} ${f.cliente.pob}</p>
                </div>
            </div>

            <table style="width: 100%; border-collapse: collapse; margin-bottom: 50px;">
                <thead>
                    <tr style="background: #f8fafc; border-bottom: 2px solid #e2e8f0;">
                        <th style="padding: 12px; text-align: left; font-size: 12px; color: #64748b; text-transform: uppercase;">Descripción</th>
                        <th style="padding: 12px; text-align: right; font-size: 12px; color: #64748b; text-transform: uppercase;">Importe</th>
                    </tr>
                </thead>
                <tbody>
                    ${f.conceptos.map(l => `
                        <tr style="border-bottom: 1px solid #f1f5f9;">
                            <td style="padding: 15px 12px; font-size: 14px;">${l.descripcion}</td>
                            <td style="padding: 15px 12px; text-align: right; font-size: 14px; font-weight: bold;">${l.importe.toFixed(2)}€</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>

            <div style="display: flex; justify-content: flex-end;">
                <div style="width: 250px;">
                    <div style="display: flex; justify-content: space-between; padding: 5px 0;">
                        <span style="font-size: 14px; color: #64748b;">Base Imponible</span>
                        <span style="font-size: 14px; font-weight: bold;">${f.subtotal.toFixed(2)}€</span>
                    </div>
                    <div style="display: flex; justify-content: space-between; padding: 5px 0;">
                        <span style="font-size: 14px; color: #64748b;">IVA (${f.ivaPorcentaje !== undefined ? f.ivaPorcentaje : 21}%)</span>
                        <span style="font-size: 14px; font-weight: bold;">${f.iva.toFixed(2)}€</span>
                    </div>
                    <div style="display: flex; justify-content: space-between; padding: 15px 0; border-top: 2px solid #e2e8f0; margin-top: 10px;">
                        <span style="font-size: 18px; font-weight: bold; color: #1e293b;">TOTAL</span>
                        <span style="font-size: 22px; font-weight: 900; color: #7c3ae3;">${f.total.toFixed(2)}€</span>
                    </div>
                </div>
            </div>

            <div style="margin-top: 60px; padding-top: 20px; border-top: 1px solid #f1f5f9; font-size: 11px; color: #94a3b8; line-height: 1.8;">
                <p style="margin: 0;">Forma de pago: <strong style="color: #64748b;">${f.cliente.pago}</strong></p>
                <p style="margin: 4px 0 0 0;">N&#250;mero de cuenta (IBAN): <strong style="color: #1e293b; font-size: 12px; letter-spacing: 0.05em;">ES27 0049 3753 1120 1402 0292</strong></p>
                <p style="margin: 8px 0 0 0;">De acuerdo con la Ley Org&#225;nica 15/1999 de Protecci&#243;n de Datos de Car&#225;cter Personal, los datos del cliente ser&#225;n tratados con la debida confidencialidad.</p>
            </div>

            <div style="margin-top: 24px; padding-top: 16px; border-top: 1.5px dashed #e2e8f0; display: flex; align-items: flex-start; gap: 16px;">
                ${qrDataUrl ? `<img src="${qrDataUrl}" style="width: 80px; height: 80px; flex-shrink: 0; border: 1px solid #e2e8f0; border-radius: 4px;">` : ''}
                <div style="font-size: 10px; color: #94a3b8; line-height: 1.7;">
                    <p style="margin: 0; font-weight: 700; color: #475569; font-size: 10px; letter-spacing: 0.06em; text-transform: uppercase;">Sistema Inform&#225;tico de Facturaci&#243;n (SIF)</p>
                    <p style="margin: 2px 0;">Factura expedida mediante sistema de facturaci&#243;n verificable conforme a Ley 11/2021 y RD 1007/2023.</p>
                    <p style="margin: 2px 0;">Sello de integridad: <span style="font-family: 'Courier New', monospace; color: #334155; font-size: 10px;">${hashTexto}</span></p>
                    ${f.hash_anterior ? `<p style="margin: 2px 0;">Encadenada con factura anterior.</p>` : ''}
                </div>
            </div>
        </div>
    `;
}

let previaTemporalIndex = null;

async function verVistaPrevia(index) {
    previaTemporalIndex = index;
    const f = facturas[index];
    const container = document.getElementById('preview-container');
    container.innerHTML = await generarHTMLFactura(f);
    document.getElementById('modal-preview-factura').classList.remove('hidden');
    document.getElementById('modal-preview-factura').classList.add('flex');
}

function cerrarPreviaFactura() {
    document.getElementById('modal-preview-factura').classList.add('hidden');
    document.getElementById('modal-preview-factura').classList.remove('flex');
}

function imprimirVistaPrevia() {
    if (previaTemporalIndex === null) return;
    imprimirFacturaDirecta(previaTemporalIndex);
}

async function imprimirFacturaDirecta(index) {
    const f = facturas[index];
    if (!f) return;
    const html = await generarHTMLFactura(f);

    const ventImpresion = window.open('', '_blank');
    ventImpresion.document.write(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>Factura ${String(f.id).padStart(5, '0')}</title>
            <style>
                body { margin: 0; padding: 0; background: white; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
                @media print {
                    @page { margin: 0; }
                    body { margin: 0; }
                }
            </style>
        </head>
        <body>
            <div style="width: 100%; max-width: 800px; margin: 0 auto;">
                ${html}
            </div>
            <script>
                window.onload = function() {
                    setTimeout(() => {
                        window.print();
                        setTimeout(() => { window.close(); }, 500);
                    }, 500);
                };
            </script>
        </body>
        </html>
    `);
    ventImpresion.document.close();
}

function descargarDesdePrevia() {
    if (previaTemporalIndex !== null) {
        cerrarPreviaFactura();
        descargarPDF(previaTemporalIndex);
    }
}

async function descargarPDF(index) {
    const f = facturas[index];
    if (!f) return;

    const html = await generarHTMLFactura(f);
    const filename = `Factura_${String(f.id).padStart(5, '0')}.pdf`;

    // Create a temporary container in the main document
    // It must be visible to html2canvas (not display:none) but positioned offscreen
    const tempDiv = document.createElement('div');
    tempDiv.id = 'temp-pdf-render';
    tempDiv.style.cssText = 'position:absolute; left:-9999px; top:0; width:800px; background:white; z-index:-1;';
    tempDiv.innerHTML = html;
    document.body.appendChild(tempDiv);

    // Wait for images inside to load
    const images = tempDiv.querySelectorAll('img');
    if (images.length > 0) {
        await Promise.all(Array.from(images).map(img => {
            if (img.complete) return Promise.resolve();
            return new Promise(resolve => {
                img.onload = resolve;
                img.onerror = resolve;
            });
        }));
    }

    // Extra wait for browser to paint the DOM
    await new Promise(r => setTimeout(r, 300));

    const element = tempDiv.querySelector('#invoice-render') || tempDiv;

    try {
        await html2pdf().set({
            margin: [5, 5, 5, 5],
            filename: filename,
            image: { type: 'jpeg', quality: 0.98 },
            html2canvas: { 
                scale: 2, 
                useCORS: true, 
                logging: false,
                backgroundColor: '#ffffff'
            },
            jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
        }).from(element).save();
    } catch (err) {
        console.error('PDF generation error:', err);
        Swal.fire('Error', 'No se pudo generar el PDF. Inténtalo de nuevo.', 'error');
    } finally {
        document.body.removeChild(tempDiv);
    }
}

function borrarFacturaLegal(index) {
    const fCheck = facturas[index];
    if (fCheck && fCheck.hash) {
        Swal.fire({
            title: 'Factura sellada — no eliminable',
            html: 'Esta factura ya ha sido <b>sellada con sello de integridad SHA-256</b> y forma parte de la cadena de registro obligatoria según la <b>Ley 11/2021</b> y el <b>RD 1007/2023</b>.<br><br>Las facturas emitidas no pueden eliminarse. Si necesitas anularla, emite una <b>factura rectificativa</b>.',
            icon: 'error',
            confirmButtonColor: '#7c3ae3',
            confirmButtonText: 'Entendido'
        });
        return;
    }
    Swal.fire({
        title: '¿Eliminar Factura?',
        html: "Esta acción borrará la factura del registro. <br><br><b>ATENCIÓN:</b> El número de factura quedará inutilizado para mantener la legalidad fiscal y evitar duplicidades automáticas posteriores.",
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#ef4444',
        cancelButtonColor: '#334155',
        confirmButtonText: 'Sí, eliminar',
        cancelButtonText: 'Cancelar'
    }).then((result) => {
        if (result.isConfirmed) {
            facturas.splice(index, 1);
            guardarDatosEnDisco();
            actualizarTablas();
            Swal.fire({
                title: 'Eliminada',
                text: 'La factura ha sido borrada del sistema.',
                icon: 'success',
                timer: 2000,
                showConfirmButton: false
            });
        }
    });
}

function editarFactura(index) {
    const f = facturas[index];
    if (f && f.hash) {
        Swal.fire({
            title: 'Factura bloqueada',
            html: 'Esta factura tiene un <b>sello de integridad</b> y no puede modificarse según la normativa de facturación informática (<b>Ley 11/2021 / RD 1007/2023</b>).<br><br>Para corregir un error, emite una <b>factura rectificativa</b> referenciando la original.',
            icon: 'warning',
            confirmButtonColor: '#7c3ae3',
            confirmButtonText: 'Entendido'
        });
        return;
    }
    facturaEnEdicionIndex = index;

    // Poblar Selector de Cliente
    renderSelectClientes();
    const clienteIndex = clientes.findIndex(c => c.nif === f.cliente.nif);
    if (clienteIndex !== -1) {
        document.getElementById('fac-cliente').value = clienteIndex;
    }

    // Configurar ID
    document.getElementById('next-invoice-id').innerText = `INV-${String(f.id).padStart(3, '0')} (EDICIÓN)`;

    // Poblar Líneas
    document.getElementById('lineas-factura').innerHTML = '';
    lineasCount = 0;
    f.conceptos.forEach(c => {
        agregarLinea();
        const trs = document.querySelectorAll('#lineas-factura tr');
        const lastTr = trs[trs.length - 1];
        lastTr.querySelector('.desc-linea').value = c.descripcion;
        lastTr.querySelector('.imp-linea').value = c.importe;
    });

    calcularTotales();

    document.getElementById('btn-emitir').innerHTML = 'GUARDAR CAMBIOS <i class="fa-solid fa-save ml-2"></i>';

    // Navegar y activar edición
    navigate('nueva-factura', null);
}

// --- MANEJO DEL TEMA (LIGHT/DARK MODE) ---

// Propaga la clase 'dark' al módulo de logística para que sus variables CSS cambien
function syncDarkToLogistica() {
    const liModule = document.getElementById('li-module');
    if (!liModule) return;
    if (document.documentElement.classList.contains('dark')) {
        liModule.classList.add('dark');
    } else {
        liModule.classList.remove('dark');
    }
}

function initTheme() {
    // Modo claro por defecto — el oscuro solo si se ha guardado explícitamente
    if (localStorage.theme === 'dark') {
        document.documentElement.classList.add('dark');
    } else {
        document.documentElement.classList.remove('dark');
        if (!('theme' in localStorage)) localStorage.theme = 'light';
    }
    syncDarkToLogistica();
    actualizarIconoTema();
}

function toggleTheme() {
    if (document.documentElement.classList.contains('dark')) {
        document.documentElement.classList.remove('dark');
        localStorage.theme = 'light';
    } else {
        document.documentElement.classList.add('dark');
        localStorage.theme = 'dark';
    }
    syncDarkToLogistica();
    actualizarIconoTema();
    actualizarGraficos();
}

function actualizarIconoTema() {
    const icon = document.getElementById('theme-icon');
    if (!icon) return;
    if (document.documentElement.classList.contains('dark')) {
        icon.className = 'fa-solid fa-moon text-lg w-6 text-center text-purple-400';
    } else {
        icon.className = 'fa-solid fa-sun text-lg w-6 text-center text-amber-500';
    }
}

// --- SISTEMA DE COPIAS DE SEGURIDAD (UI) ---

function formatBytes(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / 1048576).toFixed(1) + ' MB';
}

function getTipoBackup(nombre) {
    if (nombre.includes('_manual_')) return { label: 'Manual', color: 'purple', icon: 'fa-hand' };
    if (nombre.includes('_auto_')) return { label: 'Automático', color: 'blue', icon: 'fa-robot' };
    if (nombre.includes('_inicio_')) return { label: 'Arranque', color: 'emerald', icon: 'fa-power-off' };
    if (nombre.includes('_pre-restauracion_')) return { label: 'Pre-Restauración', color: 'amber', icon: 'fa-shield' };
    return { label: 'Otro', color: 'slate', icon: 'fa-file' };
}

async function cargarBackups() {
    try {
        const res = await fetch('/api/backup/listar');
        const backups = await res.json();
        
        document.getElementById('bk-total').innerText = backups.length;
        
        if (backups.length > 0) {
            const ultima = new Date(backups[0].fecha);
            document.getElementById('bk-ultima').innerText = ultima.toLocaleString('es-ES', {
                day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'
            });
        } else {
            document.getElementById('bk-ultima').innerText = 'Ninguna';
        }
        
        const tbody = document.getElementById('tabla-backups');
        if (backups.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" class="px-6 py-8 text-center text-slate-400 dark:text-slate-500 italic">No hay copias de seguridad todavía.</td></tr>';
            return;
        }
        
        tbody.innerHTML = backups.map(bk => {
            const tipo = getTipoBackup(bk.nombre);
            const fecha = new Date(bk.fecha).toLocaleString('es-ES', {
                day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit'
            });
            return `
                <tr class="group hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                    <td class="px-6 py-4">
                        <span class="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-${tipo.color}-50 dark:bg-${tipo.color}-900/20 text-${tipo.color}-600 dark:text-${tipo.color}-400 text-xs font-bold">
                            <i class="fa-solid ${tipo.icon}"></i> ${tipo.label}
                        </span>
                    </td>
                    <td class="px-6 py-4 text-sm font-medium text-slate-700 dark:text-slate-300">${fecha}</td>
                    <td class="px-6 py-4 text-center">
                        <span class="text-sm font-bold text-slate-900 dark:text-white">${bk.clientes}</span>
                    </td>
                    <td class="px-6 py-4 text-center">
                        <span class="text-sm font-bold text-slate-900 dark:text-white">${bk.facturas}</span>
                    </td>
                    <td class="px-6 py-4 text-right text-sm text-slate-500">${formatBytes(bk.tamano)}</td>
                    <td class="px-6 py-4 text-center">
                        <div class="flex justify-center gap-1">
                            <button onclick="restaurarBackup('${bk.nombre}')" title="Restaurar" class="p-2 rounded-lg text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 transition-all">
                                <i class="fa-solid fa-clock-rotate-left text-sm"></i>
                            </button>
                            <button onclick="descargarBackup('${bk.nombre}')" title="Descargar" class="p-2 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-all">
                                <i class="fa-solid fa-download text-sm"></i>
                            </button>
                            <button onclick="eliminarBackup('${bk.nombre}')" title="Eliminar" class="p-2 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-all">
                                <i class="fa-solid fa-trash text-sm"></i>
                            </button>
                        </div>
                    </td>
                </tr>
            `;
        }).join('');
    } catch (error) {
        console.error('Error cargando backups:', error);
        document.getElementById('tabla-backups').innerHTML = '<tr><td colspan="6" class="px-6 py-8 text-center text-red-400 italic">Error al cargar las copias de seguridad.</td></tr>';
    }
}

function subirBackup(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = async function(e) {
        try {
            const contenido = JSON.parse(e.target.result);
            
            // Validar que sea un JSON básico de Logispro/MYL Express
            if (!contenido.clientes || !contenido.facturas) {
                Swal.fire('Error', 'El archivo no tiene el formato correcto.', 'error');
                return;
            }
            
            const result = await Swal.fire({
                title: '¿Cargar esta copia externa?',
                html: `<p class="text-sm text-gray-500 mb-2">Se reemplazarán <b>todos los datos actuales</b> con los del archivo subido.</p>
                       <p class="text-xs text-amber-600 bg-amber-50 p-2 rounded-lg mt-2">⚠️ Se creará un backup automático de los datos actuales antes de cargar, por seguridad.</p>`,
                icon: 'warning',
                showCancelButton: true,
                confirmButtonColor: '#059669',
                cancelButtonColor: '#334155',
                confirmButtonText: 'Sí, cargar copia',
                cancelButtonText: 'Cancelar'
            });

            if (result.isConfirmed) {
                const res = await fetch('/api/backup/subir', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(contenido)
                });
                const data = await res.json();
                if (data.success) {
                    await Swal.fire({
                        icon: 'success',
                        title: '¡Datos cargados!',
                        text: 'La aplicación se recargará con los datos del archivo.',
                        confirmButtonColor: '#7c3ae3',
                        timer: 2500,
                        showConfirmButton: false
                    });
                    window.location.reload();
                } else {
                    Swal.fire('Error', 'Hubo un problema al procesar el archivo.', 'error');
                }
            }
        } catch (error) {
            Swal.fire('Error', 'El archivo no se pudo leer correctamente. Verifica que sea un archivo JSON válido.', 'error');
        }
        
        // Limpiar el input para permitir subir el mismo archivo de nuevo si se desea
        event.target.value = '';
    };
    reader.readAsText(file);
}

async function crearBackupManual() {
    try {
        const res = await fetch('/api/backup/crear', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ tipo: 'manual' })
        });
        const data = await res.json();
        if (data.success) {
            Swal.fire({
                icon: 'success',
                title: '¡Copia creada!',
                html: `Se ha guardado la copia de seguridad correctamente.<br><code class="text-xs text-purple-600">${data.archivo}</code>`,
                confirmButtonColor: '#7c3ae3',
                timer: 3000,
                showConfirmButton: false
            });
            cargarBackups();
        }
    } catch (error) {
        Swal.fire('Error', 'No se pudo crear la copia de seguridad.', 'error');
    }
}

async function restaurarBackup(nombre) {
    const result = await Swal.fire({
        title: '¿Restaurar esta copia?',
        html: `<p class="text-sm text-gray-500 mb-2">Se reemplazarán <b>todos los datos actuales</b> (clientes y facturas) con los de esta copia de seguridad.</p>
               <p class="text-xs text-amber-600 bg-amber-50 p-2 rounded-lg mt-2">⚠️ Se creará un backup automático de los datos actuales antes de restaurar, por seguridad.</p>`,
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#059669',
        cancelButtonColor: '#334155',
        confirmButtonText: 'Sí, restaurar',
        cancelButtonText: 'Cancelar'
    });

    if (result.isConfirmed) {
        try {
            const res = await fetch('/api/backup/restaurar', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ nombre })
            });
            const data = await res.json();
            if (data.success) {
                await Swal.fire({
                    icon: 'success',
                    title: '¡Datos restaurados!',
                    text: 'La aplicación se recargará con los datos restaurados.',
                    confirmButtonColor: '#7c3ae3',
                    timer: 2500,
                    showConfirmButton: false
                });
                // Recargar toda la app para obtener los datos restaurados
                window.location.reload();
            }
        } catch (error) {
            Swal.fire('Error', 'No se pudo restaurar la copia.', 'error');
        }
    }
}

function descargarBackup(nombre) {
    window.open(`/api/backup/descargar/${encodeURIComponent(nombre)}?token=${authToken}`, '_blank');
}

async function eliminarBackup(nombre) {
    const result = await Swal.fire({
        title: '¿Eliminar esta copia?',
        text: 'Esta acción no se puede deshacer.',
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#ef4444',
        cancelButtonColor: '#334155',
        confirmButtonText: 'Sí, eliminar',
        cancelButtonText: 'Cancelar'
    });

    if (result.isConfirmed) {
        try {
            const res = await fetch(`/api/backup/eliminar/${encodeURIComponent(nombre)}`, { method: 'DELETE' });
            const data = await res.json();
            if (data.success) {
                Swal.fire({ icon: 'success', title: 'Eliminada', timer: 1500, showConfirmButton: false });
                cargarBackups();
            }
        } catch (error) {
            Swal.fire('Error', 'No se pudo eliminar la copia.', 'error');
        }
    }
}

// --- USUARIOS Y AUDITORÍA ---
async function cargarUsuarios() {
    try {
        const res = await fetch('/api/usuarios');
        const users = await res.json();
        const tbody = document.getElementById('tabla-usuarios');
        if (!tbody) return;

        // Actualizar stats
        const totalAdmins = users.filter(u => u.rol === 'admin' || u.rol === 'superadmin').length;
        const totalUsers  = users.filter(u => u.rol === 'user').length;
        const statTotal = document.getElementById('stat-total');
        const statAdmin = document.getElementById('stat-admin');
        const statUser  = document.getElementById('stat-user');
        const countLabel = document.getElementById('usr-count-label');
        if (statTotal)  statTotal.textContent  = users.length;
        if (statAdmin)  statAdmin.textContent  = totalAdmins;
        if (statUser)   statUser.textContent   = totalUsers;
        if (countLabel) countLabel.textContent = `${users.length} usuario${users.length !== 1 ? 's' : ''} registrado${users.length !== 1 ? 's' : ''}`;

        // Helper: iniciales del avatar (máx 2 letras)
        const initials = name => name.substring(0,2).toUpperCase();

        // Helper: clase avatar + badge según rol
        const rolClass = rol => rol === 'superadmin' ? 'super' : rol === 'admin' ? 'admin' : 'user';
        const rolLabel = rol => rol === 'superadmin' ? '<i class="fa-solid fa-crown"></i> Super' : rol === 'admin' ? '<i class="fa-solid fa-shield-halved"></i> Admin' : '<i class="fa-solid fa-user"></i> Regular';

        const yoUsername = localStorage.getItem('auth_username') || '';

        tbody.innerHTML = users.map(u => {
            const rc = rolClass(u.rol);
            const isMe = u.username === yoUsername;
            const isProtected = u.username === 'admin';
            const fecha = u.creado ? new Date(u.creado).toLocaleDateString('es-ES', {day:'numeric',month:'short',year:'numeric'}) : '—';
            return `
            <tr>
                <td>
                    <div class="usr-identity">
                        <div class="usr-avatar usr-avatar--${rc}">${initials(u.username)}</div>
                        <div>
                            <p class="usr-username">${u.username}${isMe ? `<span class="usr-you-tag"><i class="fa-solid fa-circle-dot" style="font-size:7px"></i> Tú</span>` : ''}</p>
                            <p class="usr-since">Desde ${fecha} &nbsp;·&nbsp; <span style="color:#059669"><i class="fa-solid fa-lock" style="font-size:9px"></i> Cifrada</span></p>
                        </div>
                    </div>
                </td>
                <td><span class="usr-role-badge usr-role-badge--${rc}">${rolLabel(u.rol)}</span></td>
                <td>
                    <div class="usr-row-actions" style="justify-content:flex-end">
                        <button onclick="resetearPassword('${u.username}')" class="usr-action-btn" title="Restablecer contraseña"><i class="fa-solid fa-key"></i></button>
                        ${!isProtected ? `<button onclick="borrarUsuario('${u.username}')" class="usr-action-btn danger" title="Eliminar usuario"><i class="fa-solid fa-trash-can"></i></button>` : `<span class="usr-action-btn disabled" title="Usuario protegido"><i class="fa-solid fa-shield"></i></span>`}
                    </div>
                </td>
            </tr>`;
        }).join('') || `<tr><td colspan="5" class="usr-loading">No hay usuarios registrados.</td></tr>`;

        staggerRows(tbody, 40);
    } catch (e) { console.error('Error cargando usuarios', e); }
}

const formUsuario = document.getElementById('form-nuevo-usuario');
if (formUsuario) {
    // Role card selection UX
    const roleHints = {
        user:       'Acceso a facturación, clientes y presupuestos.',
        admin:      'Todo lo anterior más gestión de logística (envíos, almacén, colaboradoras).',
        superadmin: 'Acceso total incluyendo gestión de usuarios y copias de seguridad.'
    };
    formUsuario.querySelectorAll('.usr-role-card').forEach(card => {
        card.addEventListener('click', () => {
            formUsuario.querySelectorAll('.usr-role-card').forEach(c => c.classList.remove('selected'));
            card.classList.add('selected');
            const val = card.querySelector('input[type="radio"]').value;
            const hint = document.getElementById('usr-role-hint');
            if (hint) hint.textContent = roleHints[val] || '';
        });
    });

    formUsuario.addEventListener('submit', async (e) => {
        e.preventDefault();
        const username = document.getElementById('new-usr-name').value.trim();
        const password = document.getElementById('new-usr-pass').value;
        const rolRadio = formUsuario.querySelector('input[name="new-usr-rol"]:checked');
        const rol = rolRadio ? rolRadio.value : 'user';

        if (!username || !password) return;

        const res = await fetch('/api/usuarios', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password, rol })
        });
        const data = await res.json();
        if (data.success) {
            showToast('Usuario creado correctamente', 'success');
            formUsuario.reset();
            // Resetear selección visual de role cards al estado inicial
            formUsuario.querySelectorAll('.usr-role-card').forEach(c => c.classList.remove('selected'));
            const firstCard = formUsuario.querySelector('.usr-role-card');
            if (firstCard) firstCard.classList.add('selected');
            const hint = document.getElementById('usr-role-hint');
            if (hint) hint.textContent = roleHints['user'];
            cargarUsuarios();
        } else {
            Swal.fire('Error', data.error || 'No se pudo crear', 'error');
        }
    });
}

async function resetearPassword(username) {
    const { value: nueva } = await Swal.fire({
        title: `Restablecer contraseña`,
        html: `Define una nueva contraseña para <b>${username}</b>.<br><span class="text-xs text-slate-500">Por seguridad, la contraseña anterior no puede mostrarse.</span>`,
        input: 'password',
        inputplaceholder: 'Nueva contraseña',
        inputAttributes: { autocomplete: 'new-password' },
        showCancelButton: true,
        confirmButtonText: 'Guardar',
        cancelButtonText: 'Cancelar',
        confirmButtonColor: '#7c3ae3',
        inputValidator: (v) => (!v || !v.trim()) ? 'La contraseña no puede estar vacía' : undefined
    });
    if (!nueva) return;
    try {
        const res = await fetch(`/api/usuarios/${encodeURIComponent(username)}/password`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ password: nueva })
        });
        const data = await res.json();
        if (data.success) {
            showToast('Contraseña restablecida correctamente', 'success');
        } else {
            Swal.fire('Error', data.error || 'No se pudo restablecer', 'error');
        }
    } catch (e) {
        Swal.fire('Error', 'Fallo de conexión', 'error');
    }
}

async function borrarUsuario(username) {
    const res = await Swal.fire({
        title: '¿Borrar usuario?', icon: 'warning', showCancelButton: true
    });
    if (res.isConfirmed) {
        const req = await fetch('/api/usuarios/' + username, { method: 'DELETE' });
        const data = await req.json();
        if (data.success) cargarUsuarios();
        else Swal.fire('Error', data.error || 'Error al borrar', 'error');
    }
}

async function cargarEventos() {
    try {
        const res = await fetch('/api/eventos');
        const eventos = await res.json();
        const tbody = document.getElementById('tabla-eventos');
        if (!tbody) return;
        tbody.innerHTML = eventos.map(e => {
            const isDel = e.accion.includes('DELETE');
            const isAdd = e.accion.includes('ADD') || e.accion.includes('CREATE');
            let color = 'text-slate-600 dark:text-slate-400';
            if (isDel) color = 'text-red-500 font-bold';
            if (isAdd) color = 'text-emerald-500 font-bold';
            
            return `
            <tr class="hover:bg-slate-50 dark:hover:bg-slate-800/50 text-xs">
                <td class="px-6 py-4 font-mono text-slate-500">${new Date(e.fecha).toLocaleString()}</td>
                <td class="px-6 py-4 font-bold text-slate-700 dark:text-slate-300">@${e.usuario}</td>
                <td class="px-6 py-4 ${color}">${e.accion}</td>
                <td class="px-6 py-4">${e.info}</td>
            </tr>
        `}).join('');
    } catch (e) {
        console.error('Error cargando eventos', e);
    }
}

// --- MANEJO PERFIL Y LOGOUT ---
function actualizarAvatarIndex() {
    const avatar = document.getElementById('nav-user-avatar');
    const icon = document.getElementById('nav-user-icon');
    if(avatar && icon) {
        if (usuarioActualFoto) {
            avatar.src = usuarioActualFoto;
            avatar.classList.remove('hidden');
            icon.classList.add('hidden');
        } else {
            avatar.src = '';
            avatar.classList.add('hidden');
            icon.classList.remove('hidden');
        }
    }
}

function toggleUserMenu() {
    const menu = document.getElementById('user-dropdown');
    if(menu) menu.classList.toggle('hidden');
}

// Cierra modal de perfil si se hace clic fuera del userMenu
document.addEventListener('click', (e) => {
    const btn = e.target.closest('button[onclick="toggleUserMenu()"]');
    const dropdown = document.getElementById('user-dropdown');
    if (!btn && dropdown && !dropdown.contains(e.target)) {
        dropdown.classList.add('hidden');
    }
});

// ── Mi Perfil — sección completa (reemplaza el modal) ────────────────────────

let prfFotoTemporal = null;
let prfMustChange   = false;  // true si el usuario debe cambiar contraseña

function abrirModalPerfil() {
    // Redirige a la sección de perfil en lugar de abrir un modal
    const dropdown = document.getElementById('user-dropdown');
    if (dropdown) dropdown.classList.add('hidden');
    navigate('perfil');
}
// Alias para compatibilidad
function cerrarModalPerfil() { navigate('dashboard'); }

function initPerfilSection() {
    // Rellenar datos del usuario
    const username = localStorage.getItem('auth_username') || usuarioActualUsername || '—';
    const rol = localStorage.getItem('auth_rol') || usuarioActualRol || 'user';
    const foto = localStorage.getItem('auth_foto') || usuarioActualFoto || null;

    // Username display
    const unDisplay = document.getElementById('prf-username-display');
    if (unDisplay) unDisplay.textContent = username;

    // Role badge
    const rolBadge = document.getElementById('prf-rol-badge');
    if (rolBadge) {
        const rc = rol === 'superadmin' ? 'super' : rol === 'admin' ? 'admin' : 'user';
        const rl = rol === 'superadmin' ? '<i class="fa-solid fa-crown"></i> Super Admin' : rol === 'admin' ? '<i class="fa-solid fa-shield-halved"></i> Administrador' : '<i class="fa-solid fa-user"></i> Usuario Regular';
        rolBadge.innerHTML = `<span class="usr-role-badge usr-role-badge--${rc}" style="font-size:11px">${rl}</span>`;
    }

    // Avatar (foto o iniciales)
    const imgEl = document.getElementById('prf-preview-img');
    const initEl = document.getElementById('prf-avatar-initials');
    if (foto && imgEl && initEl) {
        imgEl.src = foto;
        imgEl.classList.remove('hidden');
        initEl.style.display = 'none';
    } else if (imgEl && initEl) {
        imgEl.classList.add('hidden');
        imgEl.src = '';
        initEl.style.display = 'flex';
        initEl.textContent = username.substring(0, 2).toUpperCase();
    }

    // Banner de cambio forzado
    const banner = document.getElementById('perfil-force-banner');
    if (banner) banner.classList.toggle('show', prfMustChange);

    // Reset form
    const form = document.getElementById('form-cambiar-pass');
    if (form) form.reset();
    updatePassStrength('');
    prfFotoTemporal = null;
    const saveFotoBtn = document.getElementById('prf-save-foto-btn');
    if (saveFotoBtn) saveFotoBtn.classList.add('hidden');
}

// Cambio de foto
document.getElementById('prf-input-foto')?.addEventListener('change', function(e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
        prfFotoTemporal = ev.target.result;
        const imgEl = document.getElementById('prf-preview-img');
        const initEl = document.getElementById('prf-avatar-initials');
        if (imgEl && initEl) {
            imgEl.src = prfFotoTemporal;
            imgEl.classList.remove('hidden');
            initEl.style.display = 'none';
        }
        const saveFotoBtn = document.getElementById('prf-save-foto-btn');
        if (saveFotoBtn) saveFotoBtn.classList.remove('hidden');
    };
    reader.readAsDataURL(file);
});

async function guardarFotoPerfil() {
    if (!prfFotoTemporal) return;
    try {
        const res = await fetch('/api/perfil', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + authToken },
            body: JSON.stringify({ foto: prfFotoTemporal })
        });
        const data = await res.json();
        if (data.success) {
            usuarioActualFoto = data.foto;
            localStorage.setItem('auth_foto', data.foto || '');
            actualizarAvatarIndex();
            prfFotoTemporal = null;
            const saveFotoBtn = document.getElementById('prf-save-foto-btn');
            if (saveFotoBtn) saveFotoBtn.classList.add('hidden');
            showToast('Foto actualizada correctamente', 'success');
        } else {
            Swal.fire('Error', data.error || 'No se pudo guardar la foto', 'error');
        }
    } catch { Swal.fire('Error', 'Error de conexión', 'error'); }
}

// Indicador de fortaleza de contraseña — estándares modernos (OWASP 2024)
function updatePassStrength(val) {
    const fill  = document.getElementById('prf-strength-fill');
    const label = document.getElementById('prf-strength-label');
    if (!fill || !label) return;

    const actual  = document.getElementById('prf-pass-actual')?.value  || '';
    const confirm = document.getElementById('prf-pass-confirm')?.value || '';

    // ── Evaluación de cada requisito ─────────────────────────────────────
    const okLen   = val.length >= 10;
    const okUpper = /[A-Z]/.test(val);
    const okLower = /[a-z]/.test(val);
    const okNum   = /[0-9]/.test(val);
    const okSpec  = /[^a-zA-Z0-9]/.test(val);          // !@#$%^&*…
    const okDiff  = val.length > 0 && val !== actual;
    const okMatch = val.length > 0 && val === confirm;

    // ── Score 0–5 (solo los 5 requisitos de composición, no diff/match) ─
    const score = [okLen, okUpper, okLower, okNum, okSpec].filter(Boolean).length;

    const levels = [
        { pct:   0, color: '#e2e8f0', text: '' },
        { pct:  20, color: '#ef4444', text: 'Muy débil' },
        { pct:  40, color: '#f97316', text: 'Débil' },
        { pct:  60, color: '#eab308', text: 'Aceptable' },
        { pct:  80, color: '#3b82f6', text: 'Buena' },
        { pct: 100, color: '#10b981', text: '✓ Fuerte' },
    ];
    const lv = val.length === 0 ? levels[0] : levels[score];
    fill.style.width           = lv.pct + '%';
    fill.style.backgroundColor = lv.color;
    label.textContent          = lv.text;
    label.style.color          = lv.color;

    // ── Marcar cada requisito visualmente ────────────────────────────────
    const setReq = (id, ok) => {
        const el = document.getElementById(id);
        if (!el) return;
        const active = val.length > 0;
        el.classList.toggle('ok',   active && ok);
        el.classList.toggle('fail', active && !ok);
        if (!active) { el.classList.remove('ok', 'fail'); }
    };
    setReq('req-len',   okLen);
    setReq('req-upper', okUpper);
    setReq('req-lower', okLower);
    setReq('req-num',   okNum);
    setReq('req-spec',  okSpec);
    setReq('req-diff',  okDiff);
    setReq('req-match', okMatch);
}

// Alternar visibilidad de contraseña
function togglePassVis(inputId, btn) {
    const input = document.getElementById(inputId);
    if (!input) return;
    const isText = input.type === 'text';
    input.type = isText ? 'password' : 'text';
    const icon = btn.querySelector('i');
    if (icon) { icon.className = isText ? 'fa-solid fa-eye' : 'fa-solid fa-eye-slash'; }
}

// Submit formulario cambio de contraseña
document.getElementById('form-cambiar-pass')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const actual   = document.getElementById('prf-pass-actual').value;
    const nueva    = document.getElementById('prf-pass-nueva').value;
    const confirma = document.getElementById('prf-pass-confirm').value;

    if (!actual) return Swal.fire('Campo requerido', 'Introduce tu contraseña actual.', 'warning');
    if (nueva.length < 10)         return Swal.fire('Contraseña débil', 'La nueva contraseña debe tener al menos 10 caracteres.', 'warning');
    if (!/[A-Z]/.test(nueva))      return Swal.fire('Contraseña débil', 'Incluye al menos una letra mayúscula (A–Z).', 'warning');
    if (!/[a-z]/.test(nueva))      return Swal.fire('Contraseña débil', 'Incluye al menos una letra minúscula (a–z).', 'warning');
    if (!/[0-9]/.test(nueva))      return Swal.fire('Contraseña débil', 'Incluye al menos un número (0–9).', 'warning');
    if (!/[^a-zA-Z0-9]/.test(nueva)) return Swal.fire('Contraseña débil', 'Incluye al menos un carácter especial (!@#$%…).', 'warning');
    if (nueva !== confirma)        return Swal.fire('No coinciden', 'La nueva contraseña y su confirmación no son iguales.', 'error');
    if (nueva === actual)          return Swal.fire('Sin cambios', 'La nueva contraseña debe ser diferente a la actual.', 'info');

    try {
        const res = await fetch('/api/perfil', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + authToken },
            body: JSON.stringify({ currentPassword: actual, password: nueva })
        });
        const data = await res.json();
        if (data.success) {
            prfMustChange = false;
            showToast('Contraseña actualizada correctamente', 'success');
            document.getElementById('form-cambiar-pass').reset();
            updatePassStrength('');
            // Ocultar banner de primer login si estaba activo
            const banner = document.getElementById('perfil-force-banner');
            if (banner) banner.classList.remove('show');
            // Si era primer login, redirigir al dashboard
            if (prfMustChange === false && data.mustChangePassword === false) {
                setTimeout(() => navigate('dashboard'), 1200);
            }
        } else {
            Swal.fire('Error', data.error || 'No se pudo cambiar la contraseña', 'error');
        }
    } catch { Swal.fire('Error', 'Error de conexión', 'error'); }
});

// Actualizar requisitos en tiempo real al escribir en confirmar
document.getElementById('prf-pass-confirm')?.addEventListener('input', function() {
    const nueva = document.getElementById('prf-pass-nueva')?.value || '';
    updatePassStrength(nueva);
});

async function cerrarSesion() {
    try {
        await fetch('/api/logout', { method: 'POST' });
    } catch(e) {}
    
    authToken = null;
    localStorage.removeItem('auth_token');
    localStorage.removeItem('auth_rol');
    localStorage.removeItem('auth_username');
    localStorage.removeItem('auth_foto');
    clearTimeout(inactividadTimer);
    
    window.location.reload();
}

// ARRANQUE
initTheme();

// Comprobar si hay sesión activa por LocalStorage auto-login
// Se verifica con el servidor que el token sigue siendo válido antes de ocultar el login
async function verificarSesionAlArranque() {
    if (!authToken) return; // No hay token guardado, mostrar login normalmente
    
    try {
        // Usamos /api/datos como ping de verificación de sesión
        const test = await originalFetch('/api/datos', {
            headers: { 'Authorization': 'Bearer ' + authToken }
        });
        
        if (test.status === 401) {
            // El servidor se reinició, token inválido — limpiar y mostrar login
            console.log('[Arranque] Token expirado tras reinicio del servidor. Solicitando nueva sesión.');
            authToken = null;
            localStorage.removeItem('auth_token');
            localStorage.removeItem('auth_rol');
            localStorage.removeItem('auth_username');
            localStorage.removeItem('auth_foto');
            // El login ya es visible por defecto, no hacer nada más
            return;
        }
        
        if (test.ok) {
            // Sesión válida, cargar la app
            const data = await test.json();
            clientes = data.clientes || [];
            facturas = data.facturas || [];
            migrarFechasAISO(facturas); // Migrar fechas antiguas d/m/aaaa → ISO
            datosYaCargados = true; // ✅ Datos cargados, ya es seguro guardar
            
            document.getElementById('auth-overlay').classList.add('hidden');
            
            const dropUser = document.getElementById('dropdown-username');
            const dropRole = document.getElementById('dropdown-role');
            if (dropUser) dropUser.innerText = usuarioActualUsername;
            if (dropRole) dropRole.innerText = usuarioActualRol;
            actualizarAvatarIndex();
            
            resetInactividad();
            aplicarRestriccionesRol();
            
            // Cargar UI con los datos ya obtenidos
            actualizarTablas();
            actualizarDashboard();
            agregarLinea();
        }
    } catch(e) {
        // Error de red — el servidor puede estar arrancando aún
        console.warn('[Arranque] No se pudo contactar con el servidor. Mostrando login.');
        authToken = null;
        localStorage.removeItem('auth_token');
    }
}

verificarSesionAlArranque();

// ============================================================
// --- EXPORTACIÓN MASIVA DE FACTURAS (ZIP con PDFs) ---
// ============================================================

function togglePanelExportacion() {
    const panel = document.getElementById('panel-exportacion');
    const btn = document.getElementById('btn-toggle-exportacion');
    const oculto = panel.classList.contains('hidden');

    if (oculto) {
        panel.classList.remove('hidden');
        btn.classList.add('bg-emerald-700');
        btn.innerHTML = '<i class="fa-solid fa-xmark"></i> Cerrar';
        inicializarSelectoresExportacion();
    } else {
        panel.classList.add('hidden');
        btn.classList.remove('bg-emerald-700');
        btn.innerHTML = '<i class="fa-solid fa-file-zipper"></i> Exportar lote';
    }
}

function inicializarSelectoresExportacion() {
    // Años disponibles (de las facturas existentes)
    const aniosSet = new Set();
    facturas.forEach(f => {
        const s = String(f.fecha || '').trim();
        // ISO: YYYY-MM-DD → año = parte[0]
        if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
            aniosSet.add(s.split('-')[0]);
        } else {
            // Retro-compatibilidad: d/m/aaaa → año = parte[2]
            const p = s.split('/');
            if (p.length === 3) aniosSet.add(p[2]);
        }
    });
    const aniosOrdenados = [...aniosSet].sort((a, b) => b - a);

    const selMesAnio = document.getElementById('export-mes-anio');
    const selAnio = document.getElementById('export-anio');
    const anioActual = new Date().getFullYear();

    // Si no hay facturas, poner el año actual como opción mínima
    const opcionesAnio = aniosOrdenados.length > 0 ? aniosOrdenados : [String(anioActual)];
    const optionsHtml = opcionesAnio.map(a => `<option value="${a}">${a}</option>`).join('');
    selMesAnio.innerHTML = optionsHtml;
    selAnio.innerHTML = optionsHtml;

    // Mes actual por defecto
    const mesActual = new Date().getMonth() + 1;
    document.getElementById('export-mes').value = mesActual;

    // Clientes disponibles
    const selCliente = document.getElementById('export-cliente');
    // Solo clientes que tienen facturas
    const nifConFacturas = new Set(facturas.map(f => f.cliente.nif));
    const clientesConFacturas = clientes.filter(c => nifConFacturas.has(c.nif));
    selCliente.innerHTML = clientesConFacturas.length > 0
        ? clientesConFacturas.map(c => `<option value="${c.nif}">${c.nombre} (${c.nif})</option>`).join('')
        : '<option value="">— Sin clientes con facturas —</option>';

    // Actualizar contador al cambiar selects
    ['export-mes', 'export-mes-anio', 'export-anio', 'export-cliente'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.addEventListener('change', actualizarContadorExport);
    });
    actualizarContadorExport();
}

let tabExportActual = 'mes';

function seleccionarTabExport(tab) {
    tabExportActual = tab;
    document.querySelectorAll('.tab-export-btn').forEach(btn => {
        btn.classList.remove('bg-purple-600', 'text-white', 'shadow-md');
        btn.classList.add('bg-slate-100', 'dark:bg-slate-800', 'text-slate-500');
    });
    document.getElementById(`tab-export-${tab}`).classList.add('bg-purple-600', 'text-white', 'shadow-md');
    document.getElementById(`tab-export-${tab}`).classList.remove('bg-slate-100', 'dark:bg-slate-800', 'text-slate-500');

    document.querySelectorAll('.panel-export-content').forEach(p => p.classList.add('hidden'));
    document.getElementById(`panel-export-${tab}`).classList.remove('hidden');

    actualizarContadorExport();
}

function obtenerFacturasFiltradas() {
    if (tabExportActual === 'mes') {
        const mes = parseInt(document.getElementById('export-mes').value);
        const anio = document.getElementById('export-mes-anio').value;
        return facturas.filter(f => {
            const s = String(f.fecha || '').trim();
            if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
                // ISO: YYYY-MM-DD
                return parseInt(s.split('-')[1], 10) === mes && s.split('-')[0] === anio;
            }
            // Retro-compatibilidad
            const p = s.split('/');
            return p.length === 3 && parseInt(p[1]) === mes && p[2] === anio;
        });
    }
    if (tabExportActual === 'anio') {
        const anio = document.getElementById('export-anio').value;
        return facturas.filter(f => {
            const s = String(f.fecha || '').trim();
            if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s.split('-')[0] === anio;
            // Retro-compatibilidad
            const p = s.split('/');
            return p.length === 3 && p[2] === anio;
        });
    }
    if (tabExportActual === 'cliente') {
        const nif = document.getElementById('export-cliente').value;
        return facturas.filter(f => f.cliente.nif === nif);
    }
    return [];
}

function actualizarContadorExport() {
    const filtradas = obtenerFacturasFiltradas();
    const cont = document.getElementById('export-contador');
    const txt = document.getElementById('export-contador-txt');
    cont.classList.remove('hidden');
    if (filtradas.length === 0) {
        txt.innerHTML = '<span class="text-amber-500 font-semibold">No hay facturas para los filtros seleccionados.</span>';
    } else {
        txt.innerHTML = `Se exportarán <strong class="text-emerald-600">${filtradas.length} factura${filtradas.length !== 1 ? 's' : ''}</strong> en un archivo ZIP.`;
    }
}

async function lanzarExportacion(modo) {
    const facturasFiltradas = obtenerFacturasFiltradas();

    if (facturasFiltradas.length === 0) {
        Swal.fire({
            title: 'Sin resultados',
            text: 'No hay facturas para los filtros seleccionados.',
            icon: 'warning',
            confirmButtonColor: '#059669'
        });
        return;
    }

    // Nombre del ZIP
    let nombreZip = 'Facturas';
    if (modo === 'mes') {
        const mesesNombres = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
        const mes = parseInt(document.getElementById('export-mes').value);
        const anio = document.getElementById('export-mes-anio').value;
        nombreZip = `Facturas_${mesesNombres[mes-1]}_${anio}`;
    } else if (modo === 'anio') {
        const anio = document.getElementById('export-anio').value;
        nombreZip = `Facturas_${anio}`;
    } else if (modo === 'cliente') {
        const nif = document.getElementById('export-cliente').value;
        const cli = clientes.find(c => c.nif === nif);
        nombreZip = `Facturas_${cli ? cli.nombre.replace(/[^a-zA-Z0-9_\-]/g, '_') : nif}`;
    }

    // Mostrar progreso
    Swal.fire({
        title: 'Generando ZIP...',
        html: `<p class="text-slate-500">Procesando <strong>${facturasFiltradas.length}</strong> factura(s). Por favor espera.</p>
               <div id="swal-progress-bar" style="height:6px;background:#d1fae5;border-radius:9999px;margin-top:12px;overflow:hidden;">
                 <div id="swal-progress-fill" style="height:100%;width:0%;background:#059669;border-radius:9999px;transition:width 0.3s;"></div>
               </div>`,
        allowOutsideClick: false,
        showConfirmButton: false,
        didOpen: () => Swal.showLoading()
    });

    const zip = new JSZip();
    const carpeta = zip.folder('Facturas_MYL');

    for (let i = 0; i < facturasFiltradas.length; i++) {
        const f = facturasFiltradas[i];

        // Actualizar barra de progreso
        const pct = Math.round(((i) / facturasFiltradas.length) * 100);
        const fill = document.getElementById('swal-progress-fill');
        if (fill) fill.style.width = pct + '%';

        const html = await generarHTMLFactura(f);
        const tempDiv = document.createElement('div');
        tempDiv.style.cssText = 'position:absolute;left:-9999px;top:0;width:800px;background:white;z-index:-1;';
        tempDiv.innerHTML = html;
        document.body.appendChild(tempDiv);

        // Esperar a que carguen imágenes
        const imgs = tempDiv.querySelectorAll('img');
        if (imgs.length > 0) {
            await Promise.all(Array.from(imgs).map(img => {
                if (img.complete) return Promise.resolve();
                return new Promise(r => { img.onload = r; img.onerror = r; });
            }));
        }
        await new Promise(r => setTimeout(r, 200));

        const element = tempDiv.querySelector('#invoice-render') || tempDiv;
        try {
            const pdfBlob = await html2pdf().set({
                margin: [5, 5, 5, 5],
                filename: `Factura_${String(f.id).padStart(5,'0')}.pdf`,
                image: { type: 'jpeg', quality: 0.95 },
                html2canvas: { scale: 2, useCORS: true, logging: false, backgroundColor: '#ffffff' },
                jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
            }).from(element).outputPdf('blob');

            carpeta.file(`Factura_INV-${String(f.id).padStart(5,'0')}_${f.cliente.nombre.replace(/[^a-zA-Z0-9_\-]/g, '_')}.pdf`, pdfBlob);
        } catch(err) {
            console.error(`Error generando PDF para factura ${f.id}:`, err);
        } finally {
            document.body.removeChild(tempDiv);
        }
    }

    // Barra al 100%
    const fill = document.getElementById('swal-progress-fill');
    if (fill) fill.style.width = '100%';
    await new Promise(r => setTimeout(r, 300));

    // Generar y descargar el ZIP
    try {
        const zipBlob = await zip.generateAsync({ type: 'blob' });
        const url = URL.createObjectURL(zipBlob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${nombreZip}.zip`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        Swal.fire({
            title: '¡ZIP descargado!',
            html: `Se han exportado <strong>${facturasFiltradas.length}</strong> factura(s) correctamente.`,
            icon: 'success',
            confirmButtonColor: '#059669',
            timer: 3500,
            showConfirmButton: false
        });
    } catch(err) {
        console.error('Error generando ZIP:', err);
        Swal.fire('Error', 'No se pudo generar el archivo ZIP.', 'error');
    }
}

// ═══════════════════════════════════════════════
// MÓDULO DE PRESUPUESTOS
// ═══════════════════════════════════════════════

// Cargar presupuestos desde el servidor
async function cargarPresupuestosDelServidor() {
    try {
        const res = await fetch('/api/presupuestos');
        if (res.ok) {
            const data = await res.json();
            // Solo actualizar si la respuesta es un array válido — nunca borrar con un error
            if (Array.isArray(data)) { presupuestos = data; migrarFechasAISO(presupuestos); }
        }
        // Si la respuesta no es ok (401, 500…) conservar los presupuestos que ya hay en memoria
    } catch(e) {
        // Error de red: NO tocar presupuestos — mantener lo que haya en memoria
        console.warn('[Presupuestos] Fallo de carga (manteniendo datos en memoria):', e.message);
    }
}

async function guardarPresupuestosEnServidor() {
    if (!authToken || !datosYaCargados) return;
    try {
        await fetch('/api/presupuestos', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(presupuestos)
        });
    } catch(e) {
        console.error('[Presupuestos] Error guardando:', e.message);
    }
}

// Líneas del formulario de presupuesto
let lineasPresupuestoCount = 0;
let presupuestoEnEdicionIndex = null;

function agregarLineaPresupuesto() {
    lineasPresupuestoCount++;
    const tbody = document.getElementById('lineas-presupuesto');
    const tr = document.createElement('tr');
    tr.id = `linea-pres-${lineasPresupuestoCount}`;
    tr.className = 'group animate-in fade-in';
    tr.innerHTML = `
        <td class="py-4">
            <input type="text" class="desc-linea-pres w-full bg-transparent border-none focus:ring-0 text-slate-800 dark:text-slate-200 placeholder-slate-600 font-medium" placeholder="Descripción del servicio..." required>
        </td>
        <td class="py-4 text-right">
            <div class="flex items-center justify-end gap-1">
                <input type="number" step="0.01" class="imp-linea-pres w-24 bg-transparent border-none text-right focus:ring-0 text-slate-900 dark:text-white font-bold" placeholder="0.00" oninput="calcularTotalesPresupuesto()" required>
                <span class="text-slate-400 dark:text-slate-500 font-bold">€</span>
            </div>
        </td>
        <td class="py-4 text-center">
            <button type="button" onclick="eliminarLineaPresupuesto(${lineasPresupuestoCount})" class="text-slate-600 hover:text-red-500 transition-all opacity-0 group-hover:opacity-100">
                <i class="fa-solid fa-trash-can"></i>
            </button>
        </td>
    `;
    tbody.appendChild(tr);
}

function eliminarLineaPresupuesto(id) {
    const el = document.getElementById(`linea-pres-${id}`);
    if (el) el.remove();
    calcularTotalesPresupuesto();
}

function calcularTotalesPresupuesto() {
    let subtotal = 0;
    document.querySelectorAll('.imp-linea-pres').forEach(input => subtotal += parseFloat(input.value) || 0);
    const ivaPorcentaje = parseFloat(document.getElementById('pres-iva-porcentaje').value) || 0;
    const iva = subtotal * (ivaPorcentaje / 100);
    const total = subtotal + iva;
    document.getElementById('pres-subtotal').innerText = subtotal.toFixed(2) + ' €';
    document.getElementById('pres-iva').innerText = iva.toFixed(2) + ' €';
    document.getElementById('pres-total').innerText = total.toFixed(2) + ' €';
    return { subtotal, iva, total };
}

function renderSelectClientesPresupuesto() {
    const select = document.getElementById('pres-cliente');
    const valorActual = select.value;
    select.innerHTML = '<option value="">-- Elige un cliente --</option>' +
        clientes.map((c, i) => `<option value="${i}">${c.nombre} (${c.nif})</option>`).join('');
    select.value = valorActual;
}

// Submit del formulario de presupuesto
document.getElementById('form-presupuesto').addEventListener('submit', function(e) {
    e.preventDefault();
    const indexCli = document.getElementById('pres-cliente').value;
    if (!indexCli && indexCli !== 0) return Swal.fire('Error', 'Debes seleccionar un cliente.', 'warning');

    const conceptos = [];
    const descs = document.querySelectorAll('.desc-linea-pres');
    const imps = document.querySelectorAll('.imp-linea-pres');
    if (descs.length === 0) return Swal.fire('Sin líneas', 'Añade al menos un concepto al presupuesto.', 'info');
    for (let i = 0; i < descs.length; i++) {
        conceptos.push({ descripcion: descs[i].value, importe: parseFloat(imps[i].value) || 0 });
    }

    const { subtotal, iva, total } = calcularTotalesPresupuesto();
    const ivaPorcentaje = parseFloat(document.getElementById('pres-iva-porcentaje').value) || 0;

    if (presupuestoEnEdicionIndex !== null) {
        presupuestos[presupuestoEnEdicionIndex].cliente = { ...clientes[indexCli] };
        presupuestos[presupuestoEnEdicionIndex].conceptos = conceptos;
        presupuestos[presupuestoEnEdicionIndex].subtotal = subtotal;
        presupuestos[presupuestoEnEdicionIndex].iva = iva;
        presupuestos[presupuestoEnEdicionIndex].ivaPorcentaje = ivaPorcentaje;
        presupuestos[presupuestoEnEdicionIndex].total = total;
    } else {
        presupuestos.push({
            id: presupuestos.length > 0 ? presupuestos[presupuestos.length - 1].id + 1 : 1,
            fecha: new Date().toISOString().split('T')[0], // ISO YYYY-MM-DD
            cliente: { ...clientes[indexCli] },
            conceptos, subtotal, iva, ivaPorcentaje, total
        });
    }

    guardarPresupuestosEnServidor();

    Swal.fire({
        title: presupuestoEnEdicionIndex !== null ? 'Presupuesto Actualizado' : 'Presupuesto Guardado',
        text: 'El presupuesto se ha guardado correctamente.',
        icon: 'success',
        confirmButtonColor: '#7c3ae3'
    }).then(() => {
        this.reset();
        document.getElementById('lineas-presupuesto').innerHTML = '';
        lineasPresupuestoCount = 0;
        presupuestoEnEdicionIndex = null;
        document.getElementById('btn-emitir-presupuesto').innerHTML = 'GUARDAR PRESUPUESTO <i class="fa-solid fa-paper-plane ml-2"></i>';
        navigate('presupuestos', document.querySelectorAll('.nav-btn')[3]);
    });
});

function cancelarPresupuesto() {
    document.getElementById('form-presupuesto').reset();
    document.getElementById('lineas-presupuesto').innerHTML = '';
    lineasPresupuestoCount = 0;
    presupuestoEnEdicionIndex = null;
    document.getElementById('btn-emitir-presupuesto').innerHTML = 'GUARDAR PRESUPUESTO <i class="fa-solid fa-paper-plane ml-2"></i>';
    navigate('presupuestos', document.querySelectorAll('.nav-btn')[3]);
}

// Renderizar tabla de presupuestos
function renderTablaPresupuestos() {
    const tbody = document.getElementById('tabla-presupuestos');
    if (!tbody) return;
    const ordenados = [...presupuestos].reverse();

    // Helper para el badge de estado
    const badgeEstado = (estado) => {
        const cfg = {
            'pendiente':  { cls: 'bg-amber-500/10  text-amber-400  border-amber-500/30',  icon: 'fa-clock',         label: 'Pendiente'  },
            'aceptado':   { cls: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30', icon: 'fa-circle-check', label: 'Aceptado'   },
            'rechazado':  { cls: 'bg-red-500/10     text-red-400     border-red-500/30',     icon: 'fa-circle-xmark', label: 'Rechazado'  }
        };
        const b = cfg[estado] || cfg['pendiente'];
        return `<span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold border ${b.cls}"><i class="fa-solid ${b.icon}"></i>${b.label}</span>`;
    };

    tbody.innerHTML = ordenados.map((p, i) => {
        const indexReal = presupuestos.length - 1 - i;
        const estado = p.estado || 'pendiente';
        const isPendiente = estado === 'pendiente';

        // Botones de acción — máximo 3 visibles + dropdown "···" para secundarios
        // PENDIENTE: [Aceptar] [Vista previa] [···→ Editar, PDF, Rechazar, Borrar]
        // NO PENDIENTE: [Vista previa] [PDF] [···→ Borrar]
        const menuId = `pres-menu-${indexReal}`;
        if (isPendiente) {
            const dropItems = `
                <button class="pm-item" onclick="editarPresupuesto(${indexReal});closePresMenu()"><i class="fa-solid fa-pen"></i>Editar</button>
                <button class="pm-item" onclick="descargarPDFPresupuesto(${indexReal});closePresMenu()"><i class="fa-solid fa-file-pdf"></i>Descargar PDF</button>
                <hr class="pm-sep">
                <button class="pm-item warn" onclick="rechazarPresupuesto(${indexReal});closePresMenu()"><i class="fa-solid fa-circle-xmark"></i>Rechazar</button>
                <button class="pm-item danger" onclick="borrarPresupuesto(${indexReal});closePresMenu()"><i class="fa-solid fa-trash-can"></i>Eliminar</button>`;
            return `
            <tr class="group hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors">
                <td class="px-4 py-3 font-mono text-purple-500 dark:text-purple-400 font-bold text-xs whitespace-nowrap">P-${String(p.id).padStart(3, '0')}</td>
                <td class="px-4 py-3 text-xs text-slate-500 dark:text-slate-400 whitespace-nowrap">${formatFechaES(p.fecha)}</td>
                <td class="px-4 py-3 min-w-0">
                    <p class="font-semibold text-slate-900 dark:text-white text-sm truncate">${p.cliente.nombre}</p>
                    <p class="text-[10px] text-slate-400 font-mono truncate">${p.cliente.nif}</p>
                </td>
                <td class="px-4 py-3 text-right">
                    <p class="font-bold text-slate-900 dark:text-white text-sm whitespace-nowrap">${p.total.toFixed(2)}€</p>
                    <p class="text-[10px] text-slate-400">Base ${p.subtotal.toFixed(2)}€</p>
                </td>
                <td class="px-4 py-3 text-center">${badgeEstado(estado)}</td>
                <td class="px-4 py-3">
                    <div class="flex justify-center gap-1 items-center">
                        <button onclick="aceptarPresupuesto(${indexReal})" class="btn-icon success" title="Aceptar — convertir en factura"><i class="fa-solid fa-circle-check"></i></button>
                        <button onclick="verVistaPreviaPresupuesto(${indexReal})" class="btn-icon" title="Vista Previa"><i class="fa-solid fa-eye"></i></button>
                        <div class="pres-menu-wrap" id="${menuId}-wrap">
                            <button class="btn-icon pm-trigger" onclick="togglePresMenu('${menuId}')" title="Más acciones"><i class="fa-solid fa-ellipsis-vertical"></i></button>
                            <div class="pres-menu" id="${menuId}">${dropItems}</div>
                        </div>
                    </div>
                </td>
            </tr>
            `;
        } else {
            const dropItems = `
                <button class="pm-item danger" onclick="borrarPresupuesto(${indexReal});closePresMenu()"><i class="fa-solid fa-trash-can"></i>Eliminar</button>`;
            return `
            <tr class="group hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors ${estado === 'rechazado' ? 'opacity-60' : ''}">
                <td class="px-4 py-3 font-mono text-purple-500 dark:text-purple-400 font-bold text-xs whitespace-nowrap">P-${String(p.id).padStart(3, '0')}</td>
                <td class="px-4 py-3 text-xs text-slate-500 dark:text-slate-400 whitespace-nowrap">${formatFechaES(p.fecha)}</td>
                <td class="px-4 py-3 min-w-0">
                    <p class="font-semibold text-slate-900 dark:text-white text-sm truncate">${p.cliente.nombre}</p>
                    <p class="text-[10px] text-slate-400 font-mono truncate">${p.cliente.nif}</p>
                </td>
                <td class="px-4 py-3 text-right">
                    <p class="font-bold text-slate-900 dark:text-white text-sm whitespace-nowrap">${p.total.toFixed(2)}€</p>
                    <p class="text-[10px] text-slate-400">Base ${p.subtotal.toFixed(2)}€</p>
                </td>
                <td class="px-4 py-3 text-center">${badgeEstado(estado)}</td>
                <td class="px-4 py-3">
                    <div class="flex justify-center gap-1 items-center">
                        <button onclick="verVistaPreviaPresupuesto(${indexReal})" class="btn-icon" title="Vista Previa"><i class="fa-solid fa-eye"></i></button>
                        <button onclick="descargarPDFPresupuesto(${indexReal})" class="btn-icon" title="Descargar PDF"><i class="fa-solid fa-file-pdf"></i></button>
                        <div class="pres-menu-wrap" id="${menuId}-wrap">
                            <button class="btn-icon pm-trigger" onclick="togglePresMenu('${menuId}')" title="Más acciones"><i class="fa-solid fa-ellipsis-vertical"></i></button>
                            <div class="pres-menu" id="${menuId}">${dropItems}</div>
                        </div>
                    </div>
                </td>
            </tr>
            `;
        }
    }).join('') || '<tr><td colspan="6" class="p-8 text-center text-slate-600 italic">Aún no hay presupuestos registrados.</td></tr>';
    staggerRows(tbody, 30);
}

// ── Dropdown menu helpers para tabla de presupuestos (portal en body) ────────
// El portal vive directamente en <body> para escapar de cualquier
// transform/stacking-context creado por staggerRows o fade-in.
let _presMenuPortal = null;
function _getPresMenuPortal() {
    if (!_presMenuPortal) {
        _presMenuPortal = document.createElement('div');
        _presMenuPortal.id = 'pres-menu-portal';
        _presMenuPortal.className = 'pres-menu';
        document.body.appendChild(_presMenuPortal);
    }
    return _presMenuPortal;
}

function togglePresMenu(id) {
    const sourceMenu = document.getElementById(id);
    if (!sourceMenu) return;
    const portal = _getPresMenuPortal();
    const isOpen = portal.style.display === 'flex' && portal.dataset.sourceId === id;
    closePresMenu();
    if (!isOpen) {
        portal.innerHTML = sourceMenu.innerHTML;
        portal.dataset.sourceId = id;
        const trigger = document.getElementById(id + '-wrap')?.querySelector('.pm-trigger');
        if (trigger) {
            const tr = trigger.getBoundingClientRect();
            portal.style.top = (tr.bottom + 6) + 'px';
            portal.style.right = (window.innerWidth - tr.right) + 'px';
            portal.style.left = 'auto';
            portal.style.display = 'flex';
            requestAnimationFrame(() => {
                const mr = portal.getBoundingClientRect();
                if (mr.bottom > window.innerHeight - 8) {
                    portal.style.top = (tr.top - mr.height - 6) + 'px';
                }
            });
        }
    }
}
function closePresMenu() {
    const p = document.getElementById('pres-menu-portal');
    if (p) { p.style.display = 'none'; p.dataset.sourceId = ''; }
}
// cerrar al hacer click fuera
document.addEventListener('click', (e) => {
    if (!e.target.closest('.pres-menu-wrap') && !e.target.closest('#pres-menu-portal')) closePresMenu();
});

// Búsqueda en tiempo real en tabla de presupuestos
const busquedaPresupuestoInput = document.getElementById('busqueda-presupuesto');
if (busquedaPresupuestoInput) {
    busquedaPresupuestoInput.addEventListener('input', function(e) {
        const query = e.target.value.toLowerCase();
        document.querySelectorAll('#tabla-presupuestos tr').forEach(f => {
            f.style.display = f.innerText.toLowerCase().includes(query) ? '' : 'none';
        });
    });
}

// Generar HTML de presupuesto (reutiliza la misma plantilla de factura con etiqueta PRESUPUESTO)
function generarHTMLPresupuesto(p) {
    // Reutiliza la función de factura pero pasando un objeto con tipo sobreescrito
    const doc = Object.assign({}, p, { _tipo: 'PRESUPUESTO', _ref: `PRES-${String(p.id).padStart(3, '0')}` });
    return `
        <div id="presupuesto-render" style="padding: 40px; background: white; color: #334155; font-family: sans-serif; width: 800px; max-width: 100%; box-sizing: border-box; margin: 0 auto;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 50px;">
                <div style="flex-grow: 1;">
                    <img src="logo-myl.png" style="height: 60px; margin-bottom: 10px;">
                    <p style="margin: 0; font-size: 14px; color: #64748b; font-weight: bold; letter-spacing: 0.05em;">EXPRESS LOGíSTICA</p>
                </div>
                <div style="text-align: right;">
                    <h2 style="margin: 0; font-size: 20px;">PRESUPUESTO</h2>
                    <p style="margin: 5px 0; font-size: 16px; font-weight: bold; color: #1e293b;">#PRES-${String(p.id).padStart(3, '0')}</p>
                    <p style="margin: 0; font-size: 12px; color: #64748b;">Fecha: ${formatFechaES(p.fecha)}</p>
                </div>
            </div>

            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 40px; margin-bottom: 50px;">
                <div>
                    <h4 style="border-bottom: 1px solid #e2e8f0; padding-bottom: 5px; margin-bottom: 10px; font-size: 12px; color: #94a3b8; text-transform: uppercase;">EMISOR</h4>
                    <p style="margin: 0; font-weight: bold;">Myl Express Log&#237;stica S.L.</p>
                    <p style="margin: 2px 0; font-size: 13px;">CIF: B26658302</p>
                    <p style="margin: 2px 0; font-size: 13px;">Calle Mercurio 5</p>
                    <p style="margin: 2px 0; font-size: 13px;">45200 Illescas (Toledo)</p>
                </div>
                <div>
                    <h4 style="border-bottom: 1px solid #e2e8f0; padding-bottom: 5px; margin-bottom: 10px; font-size: 12px; color: #94a3b8; text-transform: uppercase;">CLIENTE</h4>
                    <p style="margin: 0; font-weight: bold;">${p.cliente.nombre}</p>
                    <p style="margin: 2px 0; font-size: 13px;">NIF/CIF: ${p.cliente.nif}</p>
                    <p style="margin: 2px 0; font-size: 13px;">${p.cliente.dir}</p>
                    <p style="margin: 2px 0; font-size: 13px;">${p.cliente.cp} ${p.cliente.pob}</p>
                </div>
            </div>

            <table style="width: 100%; border-collapse: collapse; margin-bottom: 50px;">
                <thead>
                    <tr style="background: #f8fafc; border-bottom: 2px solid #e2e8f0;">
                        <th style="padding: 12px; text-align: left; font-size: 12px; color: #64748b; text-transform: uppercase;">Descripción</th>
                        <th style="padding: 12px; text-align: right; font-size: 12px; color: #64748b; text-transform: uppercase;">Importe</th>
                    </tr>
                </thead>
                <tbody>
                    ${p.conceptos.map(l => `
                        <tr style="border-bottom: 1px solid #f1f5f9;">
                            <td style="padding: 15px 12px; font-size: 14px;">${l.descripcion}</td>
                            <td style="padding: 15px 12px; text-align: right; font-size: 14px; font-weight: bold;">${l.importe.toFixed(2)}€</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>

            <div style="display: flex; justify-content: flex-end;">
                <div style="width: 250px;">
                    <div style="display: flex; justify-content: space-between; padding: 5px 0;">
                        <span style="font-size: 14px; color: #64748b;">Base Imponible</span>
                        <span style="font-size: 14px; font-weight: bold;">${p.subtotal.toFixed(2)}€</span>
                    </div>
                    <div style="display: flex; justify-content: space-between; padding: 5px 0;">
                        <span style="font-size: 14px; color: #64748b;">IVA (${p.ivaPorcentaje !== undefined ? p.ivaPorcentaje : 21}%)</span>
                        <span style="font-size: 14px; font-weight: bold;">${p.iva.toFixed(2)}€</span>
                    </div>
                    <div style="display: flex; justify-content: space-between; padding: 15px 0; border-top: 2px solid #e2e8f0; margin-top: 10px;">
                        <span style="font-size: 18px; font-weight: bold; color: #1e293b;">TOTAL</span>
                        <span style="font-size: 22px; font-weight: 900; color: #7c3ae3;">${p.total.toFixed(2)}€</span>
                    </div>
                </div>
            </div>

            <div style="margin-top: 60px; padding-top: 20px; border-top: 1px solid #f1f5f9; font-size: 11px; color: #94a3b8; line-height: 1.8;">
                <p style="margin: 0;">Este presupuesto tiene una validez de <strong style="color: #64748b;">30 días</strong> desde su fecha de emisión.</p>
                <p style="margin: 4px 0 0 0;">Forma de pago: <strong style="color: #64748b;">${p.cliente.pago || 'Transferencia'}</strong></p>
                <p style="margin: 4px 0 0 0;">N&#250;mero de cuenta (IBAN): <strong style="color: #1e293b; font-size: 12px; letter-spacing: 0.05em;">ES27 0049 3753 1120 1402 0292</strong></p>
                <p style="margin: 8px 0 0 0;">De acuerdo con la Ley Org&#225;nica 15/1999 de Protecci&#243;n de Datos de Car&#225;cter Personal, los datos del cliente ser&#225;n tratados con la debida confidencialidad.</p>
            </div>
        </div>
    `;
}

// Vista previa del presupuesto
let previaPresupuestoIndex = null;

function verVistaPreviaPresupuesto(index) {
    previaPresupuestoIndex = index;
    const p = presupuestos[index];
    document.getElementById('preview-presupuesto-container').innerHTML = generarHTMLPresupuesto(p);
    const modal = document.getElementById('modal-preview-presupuesto');
    modal.classList.remove('hidden');
    modal.classList.add('flex');
}

function cerrarPreviaPresupuesto() {
    const modal = document.getElementById('modal-preview-presupuesto');
    modal.classList.add('hidden');
    modal.classList.remove('flex');
}

function imprimirVistaPreviaPresupuesto() {
    if (previaPresupuestoIndex === null) return;
    const p = presupuestos[previaPresupuestoIndex];
    const html = generarHTMLPresupuesto(p);
    const ventImpresion = window.open('', '_blank');
    ventImpresion.document.write(`
        <!DOCTYPE html><html><head>
        <title>Presupuesto ${String(p.id).padStart(3, '0')}</title>
        <style>body { margin: 0; padding: 0; background: white; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        @media print { @page { margin: 0; } body { margin: 0; } }</style>
        </head><body><div style="width:100%;max-width:800px;margin:0 auto;">${html}</div>
        <script>window.onload=function(){setTimeout(()=>{window.print();setTimeout(()=>{window.close();},500);},500);};<\/script>
        </body></html>`);
    ventImpresion.document.close();
}

function descargarDesdeVistaPreviaPresupuesto() {
    if (previaPresupuestoIndex !== null) {
        cerrarPreviaPresupuesto();
        descargarPDFPresupuesto(previaPresupuestoIndex);
    }
}

async function descargarPDFPresupuesto(index) {
    const p = presupuestos[index];
    if (!p) return;
    const html = generarHTMLPresupuesto(p);
    const filename = `Presupuesto_${String(p.id).padStart(3, '0')}_${p.cliente.nombre.replace(/\s+/g, '_')}.pdf`;

    const tempDiv = document.createElement('div');
    tempDiv.style.cssText = 'position:absolute; left:-9999px; top:0; width:800px; background:white; z-index:-1;';
    tempDiv.innerHTML = html;
    document.body.appendChild(tempDiv);

    const images = tempDiv.querySelectorAll('img');
    if (images.length > 0) {
        await Promise.all(Array.from(images).map(img => {
            if (img.complete) return Promise.resolve();
            return new Promise(resolve => { img.onload = resolve; img.onerror = resolve; });
        }));
    }
    await new Promise(r => setTimeout(r, 300));

    const element = tempDiv.querySelector('#presupuesto-render') || tempDiv;
    try {
        await html2pdf().set({
            margin: [5, 5, 5, 5],
            filename: filename,
            image: { type: 'jpeg', quality: 0.98 },
            html2canvas: { scale: 2, useCORS: true, logging: false, backgroundColor: '#ffffff' },
            jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
        }).from(element).save();
    } catch (err) {
        console.error('Error PDF presupuesto:', err);
        Swal.fire('Error', 'No se pudo generar el PDF.', 'error');
    } finally {
        document.body.removeChild(tempDiv);
    }
}

// Editar presupuesto existente
function editarPresupuesto(index) {
    const p = presupuestos[index];
    presupuestoEnEdicionIndex = index;
    renderSelectClientesPresupuesto();
    const clienteIndex = clientes.findIndex(c => c.nif === p.cliente.nif);
    if (clienteIndex !== -1) document.getElementById('pres-cliente').value = clienteIndex;
    document.getElementById('next-presupuesto-id').innerText = `PRES-${String(p.id).padStart(3, '0')}`;
    document.getElementById('lineas-presupuesto').innerHTML = '';
    lineasPresupuestoCount = 0;
    p.conceptos.forEach(c => {
        agregarLineaPresupuesto();
        const descs = document.querySelectorAll('.desc-linea-pres');
        const imps = document.querySelectorAll('.imp-linea-pres');
        descs[descs.length - 1].value = c.descripcion;
        imps[imps.length - 1].value = c.importe;
    });
    document.getElementById('pres-iva-porcentaje').value = p.ivaPorcentaje || 21;
    calcularTotalesPresupuesto();
    document.getElementById('btn-emitir-presupuesto').innerHTML = 'ACTUALIZAR PRESUPUESTO <i class="fa-solid fa-floppy-disk ml-2"></i>';
    navigate('nuevo-presupuesto', null);
    // Quitar resaltado de nav al editar (no corresponde a ningún botón)
    document.querySelectorAll('.nav-btn').forEach(el => {
        el.classList.remove('bg-purple-600', 'text-white', 'shadow-lg', 'shadow-purple-900/20', 'active');
        el.classList.add('text-slate-500', 'hover:bg-slate-100', 'dark:hover:bg-slate-800', 'hover:text-slate-900', 'dark:text-slate-400', 'dark:hover:text-white');
    });
}

// Aceptar presupuesto → cambia estado a 'aceptado' y crea factura automáticamente
function aceptarPresupuesto(index) {
    const p = presupuestos[index];
    if (!p || p.estado === 'aceptado') return;

    Swal.fire({
        title: '¿Aceptar presupuesto?',
        html: `El presupuesto <strong>PRES-${String(p.id).padStart(3, '0')}</strong> se marcará como <span class="text-emerald-500 font-bold">Aceptado</span> y se generará automáticamente una factura para <strong>${p.cliente.nombre}</strong>.`,
        icon: 'question',
        showCancelButton: true,
        confirmButtonColor: '#059669',
        cancelButtonColor: '#334155',
        confirmButtonText: '<i class="fa-solid fa-circle-check mr-2"></i>Sí, aceptar',
        cancelButtonText: 'Cancelar'
    }).then(result => {
        if (!result.isConfirmed) return;

        // 1. Marcar presupuesto como aceptado
        presupuestos[index].estado = 'aceptado';
        presupuestos[index].facturaId = null; // se rellenará abajo

        // 2. Crear la factura a partir del presupuesto
        const nuevaFactura = {
            id: facturas.length > 0 ? facturas[facturas.length - 1].id + 1 : 1,
            fecha: new Date().toISOString().split('T')[0], // ISO YYYY-MM-DD
            cliente: { ...p.cliente },
            conceptos: p.conceptos.map(c => ({ ...c })),
            subtotal: p.subtotal,
            iva: p.iva,
            ivaPorcentaje: p.ivaPorcentaje,
            total: p.total,
            origenPresupuesto: `PRES-${String(p.id).padStart(3, '0')}` // referencia al presupuesto original
        };
        facturas.push(nuevaFactura);
        presupuestos[index].facturaId = nuevaFactura.id; // vincular

        // 3. Guardar todo
        guardarDatosEnDisco();          // guarda facturas (y clientes)
        guardarPresupuestosEnServidor(); // guarda presupuestos

        // 4. Refrescar UI
        renderTablaPresupuestos();
        actualizarTablas();
        actualizarDashboard();

        Swal.fire({
            title: '¡Presupuesto Aceptado!',
            html: `Se ha creado la factura <strong>INV-${String(nuevaFactura.id).padStart(5, '0')}</strong> para <strong>${p.cliente.nombre}</strong> correctamente.`,
            icon: 'success',
            confirmButtonColor: '#059669',
            confirmButtonText: 'Ver Facturas'
        }).then(r => {
            if (r.isConfirmed) {
                // Navegar a la lista de facturas
                navigate('facturas', document.querySelectorAll('.nav-btn')[2]);
            }
        });
    });
}

// Rechazar presupuesto → cambia estado a 'rechazado'
function rechazarPresupuesto(index) {
    const p = presupuestos[index];
    if (!p || p.estado === 'rechazado') return;

    Swal.fire({
        title: '¿Rechazar presupuesto?',
        html: `El presupuesto <strong>PRES-${String(p.id).padStart(3, '0')}</strong> quedará marcado como <span class="text-red-500 font-bold">Rechazado</span>.`,
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#ef4444',
        cancelButtonColor: '#334155',
        confirmButtonText: '<i class="fa-solid fa-circle-xmark mr-2"></i>Sí, rechazar',
        cancelButtonText: 'Cancelar'
    }).then(result => {
        if (!result.isConfirmed) return;
        presupuestos[index].estado = 'rechazado';
        guardarPresupuestosEnServidor();
        renderTablaPresupuestos();
        Swal.fire({
            title: 'Presupuesto Rechazado',
            text: 'El presupuesto ha quedado marcado como rechazado.',
            icon: 'info',
            timer: 2000,
            showConfirmButton: false
        });
    });
}

// Borrar presupuesto
function borrarPresupuesto(index) {
    Swal.fire({
        title: '¿Eliminar Presupuesto?',
        text: 'Esta acción no se puede deshacer.',
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#ef4444',
        cancelButtonColor: '#334155',
        confirmButtonText: 'Sí, eliminar',
        cancelButtonText: 'Cancelar'
    }).then(result => {
        if (result.isConfirmed) {
            presupuestos.splice(index, 1);
            guardarPresupuestosEnServidor();
            renderTablaPresupuestos();
            Swal.fire({ title: 'Eliminado', icon: 'success', timer: 1500, showConfirmButton: false });
        }
    });
}
// ══════════════════════════════════════════════════════════════════════════════
//  MÓDULO ACTUALIZACIONES OTA
// ══════════════════════════════════════════════════════════════════════════════

let actPaqueteCargado = null; // paquete .myl parseado actualmente en memoria

// ── Carga historial al entrar en la sección ─────────────────────────────────
async function actCargarHistorial() {
    try {
        const res = await fetch('/api/actualizacion/historial', {
            headers: { 'Authorization': `Bearer ${authToken}` }
        });
        const data = await res.json();

        // Versión actual
        const elVer = document.getElementById('act-version-actual');
        if (elVer) elVer.textContent = `v${data.versionActual || '1.0.0'}`;

        // Total
        const historial = data.historial || [];
        const elTotal = document.getElementById('act-total');
        if (elTotal) elTotal.textContent = historial.length;

        // Última
        const elUlt = document.getElementById('act-ultima');
        if (elUlt) {
            if (historial.length > 0) {
                const ul = historial[0];
                elUlt.textContent = `v${ul.version} · ${new Date(ul.fecha).toLocaleDateString('es-ES')}`;
            } else {
                elUlt.textContent = 'Ninguna';
            }
        }

        // Tabla historial
        const wrap = document.getElementById('act-historial-wrap');
        if (!wrap) return;

        if (historial.length === 0) {
            wrap.innerHTML = `<div class="flex items-center justify-center py-12 gap-3 text-slate-300 dark:text-slate-600">
                <i class="fa-solid fa-clock-rotate-left text-2xl"></i>
                <span class="text-sm font-medium">Sin actualizaciones registradas</span>
            </div>`;
            return;
        }

        wrap.innerHTML = `<div class="overflow-x-auto">
            <table class="w-full text-left">
                <thead class="bg-slate-50 dark:bg-slate-800/50 text-slate-400 dark:text-slate-500 text-xs font-semibold uppercase tracking-wider">
                    <tr>
                        <th class="px-6 py-3">Versión</th>
                        <th class="px-6 py-3">Fecha</th>
                        <th class="px-6 py-3">Archivos</th>
                        <th class="px-6 py-3">Aplicada por</th>
                        <th class="px-6 py-3">Cambios</th>
                    </tr>
                </thead>
                <tbody class="divide-y divide-slate-100 dark:divide-slate-800">
                    ${historial.map((h, i) => `
                    <tr class="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
                        <td class="px-6 py-4">
                            <span class="font-mono font-bold text-purple-600 dark:text-purple-400 text-sm">v${h.version}</span>
                            ${i === 0 ? '<span class="ml-2 text-[9px] font-bold bg-emerald-100 dark:bg-emerald-900/40 text-emerald-600 dark:text-emerald-400 px-1.5 py-0.5 rounded-full">ACTUAL</span>' : ''}
                        </td>
                        <td class="px-6 py-4 text-sm text-slate-600 dark:text-slate-400">${new Date(h.fecha).toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' })}</td>
                        <td class="px-6 py-4">
                            <div class="flex flex-wrap gap-1">
                                ${(h.archivos || []).map(a => `<span class="text-[10px] font-mono bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 px-1.5 py-0.5 rounded">${a.split('/').pop()}</span>`).join('')}
                            </div>
                        </td>
                        <td class="px-6 py-4 text-sm text-slate-500 dark:text-slate-400">${h.aplicadoPor || h.autor || '-'}</td>
                        <td class="px-6 py-4 text-sm text-slate-600 dark:text-slate-400">
                            <ul class="list-disc list-inside space-y-0.5">
                                ${(h.changelog || []).map(c => `<li>${c}</li>`).join('')}
                            </ul>
                        </td>
                    </tr>`).join('')}
                </tbody>
            </table>
        </div>`;
    } catch(e) {
        console.error('[Actualizaciones] Error cargando historial:', e);
    }
}

// ── Manejo del drop de archivo ──────────────────────────────────────────────
function actHandleDrop(event) {
    event.preventDefault();
    document.getElementById('act-dropzone').classList.remove('act-dz-over');
    const file = event.dataTransfer.files[0];
    if (file) actProcesarArchivo(file);
}

function actCargarArchivo(event) {
    const file = event.target.files[0];
    if (file) actProcesarArchivo(file);
    // Limpiar el input para permitir cargar el mismo archivo de nuevo
    event.target.value = '';
}

async function actProcesarArchivo(file) {
    // Leer el archivo
    const texto = await file.text();
    let paquete;
    try {
        paquete = JSON.parse(texto);
    } catch(e) {
        Swal.fire({ icon: 'error', title: 'Archivo inválido', text: 'El archivo no es un JSON válido.', confirmButtonColor: '#7c3ae3' });
        return;
    }

    // Preview en servidor (valida + checksum)
    let preview;
    try {
        const res = await fetch('/api/actualizacion/preview', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${authToken}` },
            body: JSON.stringify(paquete)
        });
        preview = await res.json();
        if (!preview.success) {
            Swal.fire({ icon: 'error', title: 'Paquete rechazado', text: preview.error, confirmButtonColor: '#7c3ae3' });
            return;
        }
    } catch(e) {
        Swal.fire({ icon: 'error', title: 'Error de red', text: 'No se pudo conectar con el servidor.', confirmButtonColor: '#7c3ae3' });
        return;
    }

    // Guardar en memoria
    actPaqueteCargado = paquete;

    // Mostrar info del archivo cargado
    document.getElementById('act-dropzone').classList.add('hidden');
    const infoEl = document.getElementById('act-archivo-info');
    infoEl.classList.remove('hidden');
    document.getElementById('act-archivo-nombre').textContent = file.name;
    document.getElementById('act-archivo-meta').textContent =
        `v${preview.version} · ${preview.archivos.length} archivos · ${(file.size / 1024).toFixed(1)} KB`;

    // Habilitar botón aplicar
    const btnAplicar = document.getElementById('act-btn-aplicar');
    if (btnAplicar) btnAplicar.disabled = false;

    // Rellenar preview panel
    document.getElementById('act-preview-empty').classList.add('hidden');
    const content = document.getElementById('act-preview-content');
    content.classList.remove('hidden');

    document.getElementById('act-prev-version').textContent = `v${preview.versionBase} → v${preview.version}`;
    document.getElementById('act-prev-fecha').textContent =
        preview.fecha ? `· ${new Date(preview.fecha).toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' })}` : '';
    document.getElementById('act-prev-autor').textContent = preview.autor ? `· ${preview.autor}` : '';
    document.getElementById('act-prev-checksum').textContent = preview.checksum || '-';

    // Changelog
    const clEl = document.getElementById('act-prev-changelog');
    clEl.innerHTML = (preview.changelog || []).map(c =>
        `<li class="flex items-start gap-2 text-sm text-slate-700 dark:text-slate-300">
            <i class="fa-solid fa-circle-check text-emerald-500 text-xs mt-0.5 shrink-0"></i>
            ${c}
        </li>`
    ).join('');

    // Archivos
    const archEl = document.getElementById('act-prev-archivos');
    archEl.innerHTML = (preview.archivos || []).map(a =>
        `<div class="flex items-center justify-between gap-2 bg-slate-50 dark:bg-slate-800/60 rounded-lg px-3 py-2">
            <span class="font-mono text-xs text-slate-600 dark:text-slate-300">${a.ruta}</span>
            <span class="text-xs text-slate-400 shrink-0">${(a.tamano / 1024).toFixed(1)} KB</span>
        </div>`
    ).join('');
}

// ── Resetear estado ─────────────────────────────────────────────────────────
function actResetear() {
    actPaqueteCargado = null;
    document.getElementById('act-dropzone').classList.remove('hidden');
    document.getElementById('act-archivo-info').classList.add('hidden');
    document.getElementById('act-preview-empty').classList.remove('hidden');
    document.getElementById('act-preview-content').classList.add('hidden');
    const btnAplicar = document.getElementById('act-btn-aplicar');
    if (btnAplicar) btnAplicar.disabled = true;
}

// ── Aplicar actualización ───────────────────────────────────────────────────
async function actAplicar() {
    if (!actPaqueteCargado) return;

    const confirm = await Swal.fire({
        title: `¿Aplicar v${actPaqueteCargado.version}?`,
        html: `Se actualizarán <strong>${actPaqueteCargado.archivos.length} archivo(s)</strong>.<br>
               Se creará un rollback automático de los archivos actuales.<br><br>
               <span class="text-sm text-gray-500">Si incluye cambios en servidor.js, reinicia el servidor después.</span>`,
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#7c3ae3',
        cancelButtonColor: '#94a3b8',
        confirmButtonText: '<i class="fa-solid fa-rocket mr-1"></i>Aplicar ahora',
        cancelButtonText: 'Cancelar'
    });

    if (!confirm.isConfirmed) return;

    // Mostrar carga
    Swal.fire({
        title: 'Aplicando actualización...',
        html: 'Escribiendo archivos y creando rollback...',
        allowOutsideClick: false,
        didOpen: () => Swal.showLoading()
    });

    try {
        const res = await fetch('/api/actualizacion/aplicar', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${authToken}` },
            body: JSON.stringify(actPaqueteCargado)
        });
        const data = await res.json();

        if (!data.success) {
            Swal.fire({ icon: 'error', title: 'Error al aplicar', text: data.error, confirmButtonColor: '#7c3ae3' });
            return;
        }

        // Éxito
        const necesitaReinicio = actPaqueteCargado.archivos.some(a =>
            a.ruta === 'servidor.js' || a.ruta === 'db_sqlite.js'
        );

        await Swal.fire({
            icon: 'success',
            title: `¡Actualización v${data.version} aplicada!`,
            html: `${data.archivos} archivo(s) actualizados correctamente.${necesitaReinicio
                ? '<br><br><span class="text-amber-600 font-semibold"><i class="fa-solid fa-triangle-exclamation mr-1"></i>Reinicia el servidor para que los cambios en servidor.js surtan efecto.</span>'
                : ''}`,
            confirmButtonColor: '#7c3ae3',
            confirmButtonText: 'Entendido'
        });

        actResetear();
        actCargarHistorial();

        // Si solo son archivos de frontend, recargar la página automáticamente
        if (!necesitaReinicio) {
            showToast('Recargando interfaz...', 'info');
            setTimeout(() => location.reload(), 1500);
        }

    } catch(e) {
        Swal.fire({ icon: 'error', title: 'Error de red', text: 'No se pudo conectar con el servidor.', confirmButtonColor: '#7c3ae3' });
    }
}

// ── Reiniciar servidor ──────────────────────────────────────────────────────
async function actReiniciar() {
    const confirm = await Swal.fire({
        title: '¿Reiniciar el servidor?',
        text: 'La app quedará inaccesible unos segundos mientras el servicio Windows la relanza.',
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#ef4444',
        cancelButtonColor: '#94a3b8',
        confirmButtonText: 'Sí, reiniciar',
        cancelButtonText: 'Cancelar'
    });
    if (!confirm.isConfirmed) return;

    try {
        await fetch('/api/actualizacion/reiniciar', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${authToken}` }
        });
        Swal.fire({
            icon: 'info',
            title: 'Servidor reiniciando...',
            html: 'La página se recargará automáticamente en unos segundos.',
            timer: 6000,
            timerProgressBar: true,
            showConfirmButton: false,
            didClose: () => location.reload()
        });
    } catch(e) {
        // Es normal que la fetch falle si el servidor ya cerró
        setTimeout(() => location.reload(), 4000);
    }
}
