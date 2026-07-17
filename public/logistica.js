// MÓDULO DE LOGÍSTICA — Integrado en MYL Facturación

// ════════════════════════════════════════════════════════════════
// INTEGRACIÓN CON SERVIDOR MYL — Sustitución de localStorage
// ════════════════════════════════════════════════════════════════

window.LI = {
  init: async function() {
    await cargarDatosServidor();
    if(typeof renderCurrentViewLI === 'function') renderCurrentViewLI();
  }
};

// ── Sincronización en tiempo real (WebSockets) ────────────────────────────────
if (window.socket) {
  window.socket.on('logisticaActualizada', async () => {
    const syncBar = document.getElementById('li-sync-bar');
    if (syncBar) syncBar.style.display = 'flex';
    
    await cargarDatosServidor();
    if (typeof renderCurrentViewLI === 'function') renderCurrentViewLI();
    
    if (syncBar) {
      setTimeout(() => { syncBar.style.display = 'none'; }, 800);
    }
  });
}

async function cargarDatosServidor() {
  try {
    const token = window.authToken;
    if (!token) { console.warn('[LI] Sin token de autenticación'); return; }
    const r = await fetch('/api/logistica/datos', {headers:{'Authorization':'Bearer '+token}});
    if (!r.ok) throw new Error('HTTP '+r.status);
    const d = await r.json();
    if (Array.isArray(d.envios))        shipments = d.envios;
    if (Array.isArray(d.palets))        pallets   = d.palets;
    if (Array.isArray(d.colaboradoras)) partners  = d.colaboradoras;
    // Clientes: compartidos con facturación — siempre mapear el formato
    sincronizarClientes();
    if (clients.length === 0 && Array.isArray(d.clientes) && d.clientes.length > 0) {
      clients = d.clientes;
    }
    console.log('[LI] Datos cargados: envíos='+shipments.length+' palets='+pallets.length+' socios='+partners.length+' clients='+clients.length);
  } catch(e) { console.error('[LI] Error cargando datos:', e); }
}

async function guardarDatos() {
  try {
    const token = window.authToken;
    if (!token) return;
    const r = await fetch('/api/logistica/datos', {
      method: 'POST',
      headers: {'Authorization':'Bearer '+token, 'Content-Type':'application/json'},
      body: JSON.stringify({ envios: shipments, palets: pallets, colaboradoras: partners })
    });
    if (!r.ok) {
        const err = await r.json();
        throw new Error(err.error || 'Error HTTP ' + r.status);
    }
  } catch(e) { 
      console.error('[LI] Error guardando:', e); 
      if (typeof Swal !== 'undefined') {
          Swal.fire('Error de Sincronización', 'No se pudieron guardar los cambios: ' + e.message, 'error');
      }
  }
}

function sincronizarClientes() {
  if (window.appClientes && window.appClientes.length > 0) {
    clients = window.appClientes.map((c, i) => ({
      id:      'fac-' + i,
      name:    c.nombre   || c.name    || '',
      tax_id:  c.nif      || c.tax_id  || '',
      email:   c.email    || '',
      phone:   c.tlf      || c.phone   || '',
      address: c.dir      || c.address || '',
    }));
  } else {
    clients = [];
  }
  if (typeof renderClients === 'function') renderClients();
}
// ════════════════════════════════════════════════════════════════════════════
// MÓDULO AUTENTICACIÓN Y USUARIOS
// ════════════════════════════════════════════════════════════════════════════

// ── Utilidad: hash de contraseña simple (no criptográfico — sólo demo) ────────
function hashPass(str) {
  // FNV-1a 32-bit hash, encoded as hex string
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = (h * 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

// ── Usuarios del sistema ───────────────────────────────────────────────────────
// pass almacenado como hash de la contraseña
let appUsers = [
  {id:'u1', username:'admin',    firstname:'Admin',    lastname:'Principal',  email:'admin@logistica.es',   role:'admin',    passHash: hashPass('admin123'),    active:true,  lastLogin:null},
  {id:'u2', username:'operario', firstname:'Carlos',   lastname:'López Ruiz', email:'carlos@logistica.es',  role:'operario', passHash: hashPass('operario123'), active:true,  lastLogin:null},
  {id:'u3', username:'consulta', firstname:'Ana',      lastname:'García Mena',email:'ana@logistica.es',     role:'consulta', passHash: hashPass('consulta123'), active:true,  lastLogin:null},
];

let currentUser = null; // usuario logueado
let editUserId = null;
let changingPass = false; // en modal edición, si queremos cambiar pass

function saveUsersToStorage() {
  // Usuarios gestionados por servidor facturación
}

// ── Colores y etiquetas de roles ──────────────────────────────────────────────
const ROLE_META = {
  admin:    { label: 'Administrador', color: '#7c3aed', bg: 'rgba(124,58,237,.1)', short: 'ADM' },
  operario: { label: 'Operario',      color: '#16a34a', bg: 'rgba(22,163,74,.1)',  short: 'OPR' },
  consulta: { label: 'Solo lectura',  color: '#d97706', bg: 'rgba(217,119,6,.1)', short: 'CON' },
};

function roleBadge(role) {
  const m = ROLE_META[role] || ROLE_META.consulta;
  return `<span style="display:inline-flex;align-items:center;padding:2px 8px;border-radius:4px;
    font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;
    background:${m.bg};color:${m.color}">${m.label}</span>`;
}

// ── Avatar initials & color ───────────────────────────────────────────────────
function userInitials(u) {
  return ((u.firstname[0]||'') + (u.lastname[0]||'')).toUpperCase();
}
function userColor(u) {
  const colors = ['#7c3aed','#16a34a','#d97706','#2563eb','#db2777','#0891b2','#9333ea'];
  const idx = u.username.charCodeAt(0) % colors.length;
  return colors[idx];
}
function userFullName(u) { return u.firstname + ' ' + u.lastname; }

// ── Permisos por rol ──────────────────────────────────────────────────────────
function canWrite() { return currentUser && currentUser.role !== 'consulta'; }
function isAdmin()  { return currentUser && currentUser.role === 'admin'; }

// ── Aplicar restricciones visuales según rol ──────────────────────────────────
function applyRoleRestrictions() {
  // Sincronizar SIEMPRE desde el usuario autenticado de la app principal
  if (window.currentAppUser) {
    currentUser = window.currentAppUser;
  }

  // Si por algún motivo currentUser sigue null, asumir operario (acceso normal)
  if (!currentUser) {
    currentUser = { role: 'operario', username: 'usuario', firstname: 'Usuario', lastname: '', active: true };
  }

  // Sección de admin en sidebar
  const adminSection = document.getElementById('admin-section');
  if (adminSection) adminSection.style.display = isAdmin() ? '' : 'none';

  // Badge de solo lectura
  const badge = document.getElementById('readonly-badge');
  if (badge) badge.style.display = canWrite() ? 'none' : 'flex';

  // Botones de escritura — Sólo dentro del módulo de logística (#li-module)
  // para no afectar a los botones de la app principal
  const liModule = document.getElementById('li-module') || document;
  liModule.querySelectorAll('.btn-primary, .btn-danger, .btn-success').forEach(btn => {
    // No ocultar los de login/logout/perfil/tema
    const skip = ['theme-toggle','plt-print-btn'].includes(btn.id);
    if (!skip) btn.style.display = canWrite() ? '' : 'none';
  });
}


// ── Login ─────────────────────────────────────────────────────────────────────
function doLogin() {
  const username = document.getElementById('login-user').value.trim().toLowerCase();
  const pass     = document.getElementById('login-pass').value;
  const errEl    = document.getElementById('login-error');

  if (!username || !pass) {
    errEl.style.display = 'block';
    errEl.textContent   = 'Introduce usuario y contraseña';
    return;
  }

  const user = appUsers.find(u =>
    u.username.toLowerCase() === username &&
    u.passHash === hashPass(pass) &&
    u.active
  );

  if (!user) {
    errEl.style.display = 'block';
    errEl.textContent   = 'Usuario o contraseña incorrectos';
    document.getElementById('login-pass').value = '';
    return;
  }

  // Update last login
  user.lastLogin = new Date().toLocaleString('es-ES');
  saveUsersToStorage();

  currentUser = user;
  document.getElementById('login-screen').style.display = 'none';
  initApp();
}

// ── Logout ────────────────────────────────────────────────────────────────────
function doLogout() {
  closeUserMenu();
  currentUser = null;
  // Clear fields
  document.getElementById('login-user').value = '';
  document.getElementById('login-pass').value = '';
  document.getElementById('login-error').style.display = 'none';
  document.getElementById('login-screen').style.display = 'flex';
}

// ── Init app after login ──────────────────────────────────────────────────────
function initApp() {
  // Update topbar chip
  const u = currentUser;
  const color = userColor(u);
  document.getElementById('user-avatar').textContent      = userInitials(u);
  document.getElementById('user-avatar').style.background = color;
  document.getElementById('user-chip-name').textContent   = userFullName(u);
  document.getElementById('user-chip-role').textContent   = ROLE_META[u.role]?.label || u.role;

  // Show/hide "Gestión de usuarios" in menu
  document.getElementById('um-users').style.display = isAdmin() ? 'flex' : 'none';

  // Apply permissions
  applyRoleRestrictions();

  // Init data
  updateBadges();
  renderShipments();

  // Theme icon - usa actualizarIconoTema de app.js si existe
  if (typeof actualizarIconoTema === 'function') actualizarIconoTema();

  // Sidebar date
  setDate();
}

// ── User menu toggle ──────────────────────────────────────────────────────────
// toggleUserMenu / closeUserMenu eliminados: usa las de app.js para evitar conflictos

// ── Mi perfil ─────────────────────────────────────────────────────────────────
function openMyProfile(e) {
  e && e.stopPropagation();
  // Usa la funcion de la app principal si existe, sino ignora
  if (typeof abrirModalPerfil === 'function') { abrirModalPerfil(); return; }
  const u = currentUser;
  const color = userColor(u);
  document.getElementById('prof-avatar').textContent       = userInitials(u);
  document.getElementById('prof-avatar').style.background  = color;
  document.getElementById('prof-fullname').textContent     = userFullName(u);
  document.getElementById('prof-username-chip').textContent= '@' + u.username;
  document.getElementById('prof-role-badge').innerHTML     = roleBadge(u.role);
  document.getElementById('prof-pass').value  = '';
  document.getElementById('prof-pass2').value = '';
  document.getElementById('modal-profile').classList.remove('hidden');
}

function saveProfile() {
  const pass  = document.getElementById('prof-pass').value;
  const pass2 = document.getElementById('prof-pass2').value;
  if (pass || pass2) {
    if (pass.length < 6) { alert('La contraseña debe tener al menos 6 caracteres.'); return; }
    if (pass !== pass2)  { alert('Las contraseñas no coinciden.'); return; }
    appUsers = appUsers.map(u => u.id === currentUser.id ? {...u, passHash: hashPass(pass)} : u);
    currentUser = {...currentUser, passHash: hashPass(pass)};
    saveUsersToStorage();
    showScanToast('Contraseña actualizada correctamente', 'ok');
  }
  closeModal('modal-profile');
}

// ══════════════════════════════════════════════════════════════════════════════
// GESTIÓN DE USUARIOS (sólo admin)
// ══════════════════════════════════════════════════════════════════════════════

function renderUsers() {
  const total   = appUsers.length;
  const active  = appUsers.filter(u=>u.active).length;
  const admins  = appUsers.filter(u=>u.role==='admin').length;
  document.getElementById('usr-sub').textContent = `${total} usuarios registrados`;

  // KPI grid
  document.getElementById('usr-kpi-grid').innerHTML = [
    {label:'Total usuarios',    val:total,               color:'var(--accent)',  icon:'M8 2a3 3 0 110 6 3 3 0 010-6zM2 14c0-3.3 2.7-6 6-6s6 2.7 6 6'},
    {label:'Usuarios activos',  val:active,              color:'var(--green)',   icon:'M2 8l4 4 8-8'},
    {label:'Administradores',   val:admins,              color:'#7c3aed',        icon:'M10 6l2 2 4-4M5 5a2.5 2.5 0 100 5 2.5 2.5 0 000-5zM1 13c0-2.8 1.8-5 4-5'},
    {label:'Inactivos',         val:total-active,        color:'var(--text3)',   icon:'M8 2a3 3 0 110 6 3 3 0 010-6zM4 14h8'},
  ].map(w=>`
    <div class="kpi-card">
      <div style="display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:6px">
        <div style="font-size:11px;font-weight:600;color:var(--text3);text-transform:uppercase;letter-spacing:.8px">${w.label}</div>
        <div style="width:44px;height:44px;border-radius:10px;background:${w.color}14;display:flex;align-items:center;justify-content:center;flex-shrink:0">
          <svg viewBox="0 0 16 16" style="width:22px;height:22px;stroke:${w.color};fill:none;stroke-width:1.6;opacity:.8"><path d="${w.icon}"/></svg>
        </div>
      </div>
      <div style="font-size:34px;font-weight:700;color:var(--text);letter-spacing:-1px;line-height:1">${String(w.val).padStart(2,'0')}</div>
    </div>`).join('');

  // Table
  const tb = document.getElementById('usr-tbody');
  if (!appUsers.length) {
    tb.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:40px;color:var(--text3)">Sin usuarios</td></tr>`;
    return;
  }
  tb.innerHTML = appUsers.map(u => {
    const isSelf = u.id === currentUser?.id;
    const color  = userColor(u);
    const lastLog = u.lastLogin || '—';
    const activeBadge = u.active
      ? `<span style="display:inline-flex;align-items:center;gap:4px;padding:3px 8px;border-radius:4px;font-size:11px;font-weight:600;background:#f0fdf4;color:#14532d;border:1px solid #86efac"><span style="width:5px;height:5px;border-radius:50%;background:#16a34a"></span>Activo</span>`
      : `<span style="display:inline-flex;align-items:center;gap:4px;padding:3px 8px;border-radius:4px;font-size:11px;font-weight:600;background:#f0f1f5;color:#4b5263;border:1px solid #d0d4de"><span style="width:5px;height:5px;border-radius:50%;background:#7c8494"></span>Inactivo</span>`;
    return `<tr>
      <td>
        <div style="display:flex;align-items:center;gap:10px">
          <div style="width:32px;height:32px;border-radius:50%;background:${color};display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;color:#fff;flex-shrink:0">${userInitials(u)}</div>
          <div>
            <div style="font-size:13px;font-weight:600;color:var(--text);font-family:var(--mono)">@${u.username}</div>
            ${u.email ? `<div style="font-size:11px;color:var(--text3)">${u.email}</div>` : ''}
          </div>
        </div>
      </td>
      <td style="font-size:13px;color:var(--text);font-weight:500">${userFullName(u)}${isSelf ? ' <span style="font-size:10px;color:var(--accent);font-weight:600">(tú)</span>' : ''}</td>
      <td>${roleBadge(u.role)}</td>
      <td style="font-size:12px;color:var(--text3);font-family:var(--mono)">${lastLog}</td>
      <td>${activeBadge}</td>
      <td>
        <div class="td-action">
          <button class="btn btn-ghost btn-sm" onclick="openUserModal('${u.id}')">Editar</button>
          ${!isSelf ? `<button class="btn btn-danger btn-sm" onclick="deleteUser('${u.id}')">Eliminar</button>` : ''}
        </div>
      </td>
    </tr>`;
  }).join('');

  // Update badge
  document.getElementById('nb-users').textContent = appUsers.length;
}

// ── Abrir modal usuario ───────────────────────────────────────────────────────
function openUserModal(id = null) {
  if (!isAdmin()) return;
  editUserId = id;
  changingPass = !id; // si es nuevo, siempre mostrar campos de pass

  const u = id ? appUsers.find(x => x.id === id) : {};
  document.getElementById('modal-user-title').textContent = id ? 'Editar usuario' : 'Nuevo usuario';

  document.getElementById('usr-firstname').value = u.firstname || '';
  document.getElementById('usr-lastname').value  = u.lastname  || '';
  document.getElementById('usr-username').value  = u.username  || '';
  document.getElementById('usr-email').value     = u.email     || '';
  document.getElementById('usr-role').value      = u.role      || 'operario';
  document.getElementById('usr-active').checked  = u.active !== false;
  document.getElementById('usr-pass').value      = '';
  document.getElementById('usr-pass2').value     = '';

  // Toggle pass visibility
  const toggleBtn = document.getElementById('usr-pass-toggle-btn');
  const passFields = document.getElementById('usr-pass-fields');
  const passReq    = document.getElementById('usr-pass-req');
  const pass2Req   = document.getElementById('usr-pass2-req');

  if (id) {
    // Editing: hide pass fields by default, show toggle button
    toggleBtn.style.display = 'inline-flex';
    passFields.style.display = 'none';
    passReq.style.display = 'none';
    pass2Req.style.display = 'none';
    changingPass = false;
    toggleBtn.textContent = 'Cambiar contraseña';
  } else {
    // New: show pass fields, hide toggle button
    toggleBtn.style.display = 'none';
    passFields.style.display = '';
    passReq.style.display = 'inline';
    pass2Req.style.display = 'inline';
    changingPass = true;
  }

  document.getElementById('modal-user').classList.remove('hidden');
  setTimeout(() => document.getElementById('usr-firstname').focus(), 80);
}

function toggleChangePass() {
  changingPass = !changingPass;
  const passFields = document.getElementById('usr-pass-fields');
  const toggleBtn  = document.getElementById('usr-pass-toggle-btn');
  const passReq    = document.getElementById('usr-pass-req');
  const pass2Req   = document.getElementById('usr-pass2-req');
  passFields.style.display = changingPass ? '' : 'none';
  passReq.style.display    = changingPass ? 'inline' : 'none';
  pass2Req.style.display   = changingPass ? 'inline' : 'none';
  toggleBtn.textContent    = changingPass ? 'Cancelar cambio' : 'Cambiar contraseña';
  if (changingPass) document.getElementById('usr-pass').focus();
}

// ── Guardar usuario ───────────────────────────────────────────────────────────
function saveUser() {
  if (!isAdmin()) return;

  const firstname = document.getElementById('usr-firstname').value.trim();
  const lastname  = document.getElementById('usr-lastname').value.trim();
  const username  = document.getElementById('usr-username').value.trim().toLowerCase().replace(/\s+/g,'.');
  const email     = document.getElementById('usr-email').value.trim();
  const role      = document.getElementById('usr-role').value;
  const active    = document.getElementById('usr-active').checked;
  const pass      = document.getElementById('usr-pass').value;
  const pass2     = document.getElementById('usr-pass2').value;

  // Validaciones
  if (!firstname || !lastname || !username) {
    alert('Nombre, apellidos y usuario son obligatorios.'); return;
  }
  if (username.length < 3) {
    alert('El nombre de usuario debe tener al menos 3 caracteres.'); return;
  }
  // Check username unique
  const dup = appUsers.find(u => u.username === username && u.id !== editUserId);
  if (dup) { alert(`El usuario "@${username}" ya existe.`); return; }

  if (changingPass) {
    if (pass.length < 6) { alert('La contraseña debe tener al menos 6 caracteres.'); return; }
    if (pass !== pass2)  { alert('Las contraseñas no coinciden.'); return; }
  } else if (!editUserId) {
    alert('Debes establecer una contraseña para el nuevo usuario.'); return;
  }

  // Impedir eliminar el propio rol admin si es el último admin
  if (editUserId === currentUser?.id && role !== 'admin' && currentUser.role === 'admin') {
    const otherAdmins = appUsers.filter(u => u.role === 'admin' && u.id !== editUserId);
    if (!otherAdmins.length) {
      alert('No puedes cambiar tu propio rol si eres el único administrador.'); return;
    }
  }

  if (editUserId) {
    appUsers = appUsers.map(u => {
      if (u.id !== editUserId) return u;
      const updated = { ...u, firstname, lastname, username, email, role, active };
      if (changingPass && pass) updated.passHash = hashPass(pass);
      return updated;
    });
    // Update currentUser if self-edit
    if (editUserId === currentUser?.id) {
      currentUser = appUsers.find(u => u.id === editUserId);
      document.getElementById('user-chip-name').textContent = userFullName(currentUser);
      document.getElementById('user-chip-role').textContent = ROLE_META[currentUser.role]?.label;
    }
  } else {
    appUsers.push({
      id: 'u' + genId(),
      username, firstname, lastname, email, role, active,
      passHash: hashPass(pass),
      lastLogin: null,
    });
  }

  saveUsersToStorage();
  closeModal('modal-user');
  renderUsers();
  applyRoleRestrictions();
  showScanToast(editUserId ? 'Usuario actualizado' : 'Usuario creado correctamente', 'ok');
}

// ── Eliminar usuario ──────────────────────────────────────────────────────────
function deleteUser(id) {
  if (!isAdmin()) return;
  if (id === currentUser?.id) { showScanToast('Error: No puedes eliminarte a ti mismo.', 'error'); return; }
  const u = appUsers.find(x => x.id === id);
  if (!u) return;
  if (u.role === 'admin') {
    const otherAdmins = appUsers.filter(x => x.role === 'admin' && x.id !== id);
    if (!otherAdmins.length) {
      showScanToast('Error: No puedes eliminar al último administrador.', 'error'); return;
    }
  }
  
  Swal.fire({
    title: '¿Eliminar usuario?',
    text: `¿Eliminar a "@${u.username}" (${userFullName(u)})?`,
    icon: 'warning',
    showCancelButton: true,
    confirmButtonColor: '#ef4444',
    cancelButtonColor: '#64748b',
    confirmButtonText: 'Sí, eliminar',
    cancelButtonText: 'Cancelar'
  }).then((result) => {
    if (result.isConfirmed) {
      appUsers = appUsers.filter(x => x.id !== id);
      saveUsersToStorage();
      renderUsers();
      showScanToast('Usuario eliminado', 'ok');
    }
  });
}

// ── updateBadges override: add users badge ────────────────────────────────────
// (extends the original updateBadges)
const _origUpdateBadges = updateBadges;
updateBadges = function() {
  _origUpdateBadges();
  const nbUsr = document.getElementById('nb-users');
  if (nbUsr) nbUsr.textContent = appUsers.length;
};


// ── roundRect polyfill (older browsers) ───────────────────────────────────────
if (!CanvasRenderingContext2D.prototype.roundRect) {
  CanvasRenderingContext2D.prototype.roundRect = function(x,y,w,h,r){
    this.beginPath();
    this.moveTo(x+r, y);
    this.lineTo(x+w-r, y);
    this.quadraticCurveTo(x+w, y, x+w, y+r);
    this.lineTo(x+w, y+h-r);
    this.quadraticCurveTo(x+w, y+h, x+w-r, y+h);
    this.lineTo(x+r, y+h);
    this.quadraticCurveTo(x, y+h, x, y+h-r);
    this.lineTo(x, y+r);
    this.quadraticCurveTo(x, y, x+r, y);
    this.closePath();
    return this;
  };
}

// ── Data ─────────────────────────────────────────────────────────────────────
function gDate(o=0){const d=new Date();d.setDate(d.getDate()-o);return d.toLocaleDateString('es-ES');}
function genId(){return Math.random().toString(36).slice(2,8).toUpperCase();}

const STATUS_MAP = {
  'Recogido':    {cls:'pill-recogido',  hex:'#8a91a0'},
  'Empacado':    {cls:'pill-empacado',  hex:'#f59e0b'},
  'En Tránsito': {cls:'pill-transito',  hex:'#3b6ff5'},
  'Entregado':   {cls:'pill-entregado', hex:'#22c55e'},
};

let clients = [];
let partners = [];
let shipments = [];

let editClientId=null, editPartnerId=null, currentDetailId=null, currentFilter='Todos';

// ── Nav ───────────────────────────────────────────────────────────────────────
const VIEWS = ['shipments','storage','labels','clients','partners','users','new-shipment','new-pallet','new-partner','detail-shipment','detail-pallet'];
const TB = {
  shipments:  ['Envíos','Gestión de servicios'],
  storage:    ['Almacén Palets','Gestión de palets almacenados'],
  labels:     ['Documentos','Etiquetas y resguardos'],
  users:      ['Usuarios','Gestión de accesos y roles'],
  clients:    ['Clientes','Gestión de emisores'],
  partners:   ['Colaboradoras','Transportistas subcontratadas'],
  'new-shipment': ['Envíos','Registrar nuevo envío'],
  'new-pallet':   ['Almacén','Registrar entrada'],
  'new-partner':  ['Colaboradoras','Nueva colaboradora'],
  'detail-shipment': ['Envíos','Detalle del envío'],
  'detail-pallet':   ['Almacén','Detalle de la entrada'],
};

function showView(v) {
  VIEWS.forEach(id => {
    document.getElementById('view-'+id)?.classList.toggle('hidden', id!==v);
  });
  document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(b => {
    if(b.getAttribute('onclick')?.includes("'"+v+"'")) b.classList.add('active');
  });
  const tbTitle = document.getElementById('tb-title');
  const tbSub   = document.getElementById('tb-sub');
  if (tbTitle) tbTitle.textContent = TB[v]?.[0] || v;
  if (tbSub)   tbSub.textContent   = TB[v]?.[1] || '';
  // Actualizar título de página principal del header
  const pageTitle = document.getElementById('page-title');
  if (pageTitle) pageTitle.textContent = TB[v]?.[0] || 'Logística';
  updateBadges();
  if(v==='shipments') renderShipments();
  if(v==='clients')   renderClients();
  if(v==='partners')  renderPartners();
  if(v==='labels')    renderLabelsView();
  if(v==='storage')   renderStorage();
  if(v==='users')     { if(isAdmin()) renderUsers(); else showScanToast('Acceso restringido a administradores', 'error'); }
  // Solo aplicar restricciones si el rol es consulta (no ocultar botones innecesariamente)
  if (currentUser && currentUser.role === 'consulta') {
    setTimeout(applyRoleRestrictions, 50);
  }
}

function updateBadges() {
  ['nb-shipments', 'nb-storage', 'nb-clients', 'nb-partners', 'nb-users', 'nav-badge-envios', 'nav-badge-almacen', 'nav-badge-colaboradoras'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = 'none';
  });
}

// ── Topbar date ───────────────────────────────────────────────────────────────
function setDate() {
  const now = new Date();
  const formatted = now.toLocaleDateString('es-ES',{weekday:'long',day:'2-digit',month:'long',year:'numeric'});
  document.getElementById('topbar-date').textContent =
    now.toLocaleDateString('es-ES',{weekday:'short',day:'2-digit',month:'short',year:'numeric'}).toUpperCase();
  const sidebarEl = document.getElementById('sidebar-date-display');
  if(sidebarEl) sidebarEl.textContent = formatted.charAt(0).toUpperCase() + formatted.slice(1);
}
setDate();

// ── Pill helper ───────────────────────────────────────────────────────────────
function pill(status) {
  const m = STATUS_MAP[status] || {cls:'pill-recogido',hex:'#8a91a0'};
  return `<span class="pill ${m.cls}"><span class="pill-dot"></span>${status}</span>`;
}

// ── Shipments + KPI widgets ───────────────────────────────────────────────────
function renderKPIs() {
  const total  = shipments.length || 1;
  const counts = {
    'Recogido':    shipments.filter(s=>s.status==='Recogido').length,
    'Empacado':    shipments.filter(s=>s.status==='Empacado').length,
    'En Tránsito': shipments.filter(s=>s.status==='En Tránsito').length,
    'Entregado':   shipments.filter(s=>s.status==='Entregado').length,
  };
  const widgets = [
    { label:'Total envíos',  val:shipments.length, color:'var(--accent)',  icon:'M1 4h14M1 4v9a1 1 0 001 1h12a1 1 0 001-1V4M1 4l2-3h10l2 3', pct:100, mono:true },
    { label:'Recogidos',     val:counts['Recogido'],    color:'var(--text3)',  icon:'M8 2v4M4 6l4 2 4-2M4 6v6l4 2 4-2V6',  pct:Math.round(counts['Recogido']/total*100) },
    { label:'Empacados',     val:counts['Empacado'],    color:'var(--amber)',  icon:'M2 4h12v10H2zM2 4l6 5 6-5',            pct:Math.round(counts['Empacado']/total*100) },
    { label:'En tránsito',   val:counts['En Tránsito'], color:'var(--accent)', icon:'M1 8h10M8 5l3 3-3 3M14 4v8',           pct:Math.round(counts['En Tránsito']/total*100) },
    { label:'Entregados',    val:counts['Entregado'],   color:'var(--green)',  icon:'M2 8l4 4 8-8',                          pct:Math.round(counts['Entregado']/total*100) },
  ];
  document.getElementById('kpi-grid').innerHTML = widgets.map((w,i) => `
    <div class="kpi-card-v3" style="animation-delay:${i*70}ms">
      <span class="kpi-accent-line" style="background:${w.color};opacity:0.9"></span>
      <div class="kpi-body" style="display:flex;flex-direction:column;gap:10px;padding:16px 16px 14px">
        <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:8px">
          <p class="kpi-label-v3" style="margin:0;padding-top:2px">${w.label}</p>
          <div style="width:34px;height:34px;border-radius:10px;background:${w.color}18;display:flex;align-items:center;justify-content:center;flex-shrink:0">
            <svg viewBox="0 0 16 16" style="width:16px;height:16px;stroke:${w.color};fill:none;stroke-width:1.8"><path d="${w.icon}"/></svg>
          </div>
        </div>
        <div class="kpi-val" style="font-variant-numeric:tabular-nums;font-size:clamp(1.4rem,3vw,1.85rem)">${String(w.val).padStart(2,'0')}</div>
        <div style="height:2px;background:var(--border);border-radius:2px;overflow:hidden">
          <div style="height:100%;width:${w.pct}%;background:${w.color};border-radius:2px;transition:width .7s cubic-bezier(.16,1,.3,1)"></div>
        </div>
      </div>
    </div>`).join('');
}

// ── Shipments table ───────────────────────────────────────────────────────────
function renderShipments() {
  renderKPIs();
  document.getElementById('ship-sub').textContent = `${shipments.length} registros`;
  const statuses = ['Todos',...Object.keys(STATUS_MAP)];
  document.getElementById('filter-strip').innerHTML =
    statuses.map(s=>`<button class="filter-chip${s===currentFilter?' active':''}" onclick="setFilter('${s}')">${s}</button>`).join('') +
    `<input type="text" class="search-input" id="ship-search" placeholder="Buscar tracking o cliente…" oninput="renderShipTable()">`;
  renderShipTable();
}

function setFilter(f){ currentFilter=f; renderShipments(); }

function renderShipTable() {
  const q = (document.getElementById('ship-search')||{}).value?.toLowerCase()||'';
  let rows = shipments.filter(s => currentFilter==='Todos' || s.status===currentFilter);
  if(q) rows = rows.filter(s =>
    s.tracking.toLowerCase().includes(q) ||
    (clients.find(c=>c.id===s.client_id)?.name||'').toLowerCase().includes(q)
  );
  const tb = document.getElementById('ship-tbody');
  if(!rows.length){ tb.innerHTML=`<tr><td colspan="9" style="text-align:center;padding:32px;color:var(--text3)">Sin resultados</td></tr>`; return; }
  const ell = 'overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:0';
  tb.innerHTML = rows.map(s => {
    const cl = clients.find(c=>c.id===s.client_id);
    const pt = partners.find(p=>p.id===s.partner_id);
    return `<tr>
      <td class="td-mono" style="${ell}" title="${s.tracking}">${s.tracking}</td>
      <td style="${ell}" title="${cl?.name||''}"><div style="font-weight:500;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${cl?.name?.split(' ').slice(0,2).join(' ')||'—'}</div></td>
      <td style="${ell}" title="${s.origin}"><span style="font-size:12px;color:var(--text2)">${s.origin}</span></td>
      <td style="${ell}" title="${s.dest}"><span style="font-size:12px;color:var(--text2)">${s.dest}</span></td>
      <td style="text-align:center;font-size:12px;color:var(--text2)">${s.weight}kg</td>
      <td style="text-align:center;font-size:12px;color:var(--text2)">${s.units||1}</td>
      <td style="${ell}" title="${pt?.company_name||''}"><span style="font-size:12px;color:var(--text2);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${pt?.company_name?.split(' ')[0]||'—'}</span></td>
      <td>${statusBtn(s.id, s.status)}</td>
      <td style="text-align:center">
        <div style="display:inline-flex;gap:2px">
          <button class="btn-icon" onclick="openDetail('${s.id}')" title="Ver detalle"><i class="fa-solid fa-eye"></i></button>
          <button class="btn-icon" onclick="openDocsDirect('${s.id}')" title="Documentos"><i class="fa-solid fa-file"></i></button>
        </div>
      </td>
    </tr>`;
  }).join('');
}

function updateStatus(id, status) {
  shipments = shipments.map(s => s.id===id ? {...s,status} : s);
  renderShipTable();
  guardarDatos();
}

// ── New Shipment ──────────────────────────────────────────────────────────────
function openNewShipment() {
  try {
    // Reset partner dropdown
    const sp = document.getElementById('sh-partner');
    if (sp) {
      sp.innerHTML = '<option value="">Seleccionar subcontrata…</option>' +
        (partners||[]).filter(p=>p.active).map(p=>`<option value="${p.id}">${p.company_name} — ${p.base_rate?.toFixed(2)} €/kg</option>`).join('');
    }
    // Reset text fields
    ['sh-dest','sh-weight','sh-dims','sh-contents','sh-dest-phone','sh-dest-address'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.value = '';
    });
    // Also clear read-only remitente fields
    ['sh-origin','sh-origin-name','sh-origin-phone'].forEach(id => {
      const el = document.getElementById(id); if (el) el.value = '';
    });
    const units = document.getElementById('sh-units');
    if (units) units.value = '1';
    const shType = document.getElementById('sh-type');
    if (shType) shType.value = 'Economy';
    // Reset client section
    try { clearClientSelection(); } catch(e) { console.warn('[LI] clearClientSelection:', e); }
    try { setClientMode('search'); } catch(e) { console.warn('[LI] setClientMode:', e); }
    try { filterClientSearch(); } catch(e) { console.warn('[LI] filterClientSearch:', e); }
  } catch(e) {
    console.error('[LI] openNewShipment init error:', e);
  }
  // Siempre abrir la vista aunque haya errores de init
  showView('new-shipment');
}

// ── Client search in shipment modal ──────────────────────────────────────────
function setClientMode(mode) {
  const searchPanel = document.getElementById('sh-client-search-panel');
  const newPanel    = document.getElementById('sh-client-new-panel');
  const btnSearch   = document.getElementById('btn-search-client');
  const btnNew      = document.getElementById('btn-new-client-inline');
  if (mode === 'search') {
    searchPanel.classList.remove('hidden');
    newPanel.classList.add('hidden');
    btnSearch.style.borderColor = 'var(--accent)'; btnSearch.style.color = 'var(--accent)';
    btnNew.style.borderColor = ''; btnNew.style.color = '';
    document.getElementById('sh-client-search-input').focus();
  } else {
    newPanel.classList.remove('hidden');
    searchPanel.classList.add('hidden');
    btnNew.style.borderColor = 'var(--accent)'; btnNew.style.color = 'var(--accent)';
    btnSearch.style.borderColor = ''; btnSearch.style.color = '';
    document.getElementById('sh-new-cl-name').focus();
  }
}

function filterClientSearch() {
  const q = (document.getElementById('sh-client-search-input')?.value || '').toLowerCase().trim();
  const results = document.getElementById('sh-client-results');
  const list = q
    ? clients.filter(c =>
        c.name.toLowerCase().includes(q) ||
        (c.email||'').toLowerCase().includes(q) ||
        (c.phone||'').toLowerCase().includes(q) ||
        (c.tax_id||'').toLowerCase().includes(q) ||
        (c.address||'').toLowerCase().includes(q)
      )
    : clients;

  if (!list.length) {
    results.innerHTML = `<div style="padding:14px;font-size:12px;color:var(--text3);text-align:center">Sin resultados — prueba con otro término o crea un cliente nuevo</div>`;
    return;
  }
  results.innerHTML = list.map(c => `
    <div onclick="selectClient('${c.id}')"
      style="display:flex;align-items:center;gap:10px;padding:9px 12px;cursor:pointer;border-bottom:1px solid var(--border);transition:background .08s"
      onmouseover="this.style.background='var(--bg3)'" onmouseout="this.style.background=''">
      <div style="width:28px;height:28px;border-radius:5px;background:rgba(124,58,237,.1);display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:700;color:var(--accent);font-family:var(--mono);flex-shrink:0">${c.name.slice(0,2).toUpperCase()}</div>
      <div style="flex:1;min-width:0">
        <div style="font-size:13px;font-weight:500;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${c.name}</div>
        <div style="font-size:11px;color:var(--text3);font-family:var(--mono)">${[c.email,c.phone,c.tax_id].filter(Boolean).join(' · ')}</div>
      </div>
      <svg viewBox="0 0 16 16" style="width:12px;height:12px;stroke:var(--text3);fill:none;stroke-width:2;flex-shrink:0"><path d="M3 8h10M9 4l4 4-4 4"/></svg>
    </div>`).join('');
}

function selectClient(id) {
  const c = clients.find(x => x.id === id);
  if (!c) return;
  document.getElementById('sh-client').value = id;
  document.getElementById('sh-client-avatar').textContent = c.name.slice(0,2).toUpperCase();
  document.getElementById('sh-client-name-display').textContent = c.name;
  document.getElementById('sh-client-detail-display').textContent = [c.email, c.phone, c.tax_id].filter(Boolean).join(' · ');
  document.getElementById('sh-client-selected').classList.remove('hidden');
  document.getElementById('sh-client-selected').style.display = 'flex';
  document.getElementById('sh-client-search-panel').classList.add('hidden');
  document.getElementById('sh-client-new-panel').classList.add('hidden');
  // Auto-fill read-only Remitente fields from selected client
  const nameEl  = document.getElementById('sh-origin-name');
  const phoneEl = document.getElementById('sh-origin-phone');
  const addrEl  = document.getElementById('sh-origin');
  if (nameEl)  nameEl.value  = c.name    || '';
  if (phoneEl) phoneEl.value = c.phone   || '';
  if (addrEl)  addrEl.value  = c.address || '';
}

function clearClientSelection() {
  document.getElementById('sh-client').value = '';
  document.getElementById('sh-client-selected').classList.add('hidden');
  document.getElementById('sh-client-search-input').value = '';
  filterClientSearch();
}

function saveInlineClient() {
  const name = document.getElementById('sh-new-cl-name').value.trim();
  if (!name) { alert('El nombre es obligatorio.'); return; }
  
  const newData = {
    nombre: name,
    email: document.getElementById('sh-new-cl-email').value.trim(),
    tlf:   document.getElementById('sh-new-cl-phone').value.trim(),
    nif:   document.getElementById('sh-new-cl-tax').value.trim(),
    dir:   document.getElementById('sh-new-cl-address').value.trim()
  };
  
  if(!window.appClientes) window.appClientes = [];
  window.appClientes.push(newData);
  const newId = 'fac-' + (window.appClientes.length - 1);
  
  if (typeof window.guardarGlobal === 'function') window.guardarGlobal();
  sincronizarClientes();
  updateBadges();
  
  ['sh-new-cl-name','sh-new-cl-email','sh-new-cl-phone','sh-new-cl-tax','sh-new-cl-address'].forEach(id => document.getElementById(id).value = '');
  selectClient(newId);
  showScanToast('Cliente creado y seleccionado: ' + name, 'info');
}

// ── Client search in pallet modal ──────────────────────────────────────────
function setPltClientMode(mode) {
  const searchPanel = document.getElementById('plt-client-search-panel');
  const newPanel    = document.getElementById('plt-client-new-panel');
  const btnSearch   = document.getElementById('btn-search-plt-client');
  const btnNew      = document.getElementById('btn-new-plt-client');
  if (mode === 'search') {
    searchPanel.classList.remove('hidden');
    newPanel.classList.add('hidden');
    btnSearch.style.borderColor = 'var(--accent)'; btnSearch.style.color = 'var(--accent)';
    btnNew.style.borderColor = ''; btnNew.style.color = '';
    document.getElementById('plt-client-search-input').focus();
    filterPltClientSearch();
  } else {
    newPanel.classList.remove('hidden');
    searchPanel.classList.add('hidden');
    btnNew.style.borderColor = 'var(--accent)'; btnNew.style.color = 'var(--accent)';
    btnSearch.style.borderColor = ''; btnSearch.style.color = '';
    document.getElementById('plt-new-cl-name').focus();
  }
}

function filterPltClientSearch() {
  const q = (document.getElementById('plt-client-search-input')?.value || '').toLowerCase().trim();
  const results = document.getElementById('plt-client-results');
  const list = q
    ? clients.filter(c =>
        c.name.toLowerCase().includes(q) ||
        (c.email||'').toLowerCase().includes(q) ||
        (c.phone||'').toLowerCase().includes(q) ||
        (c.tax_id||'').toLowerCase().includes(q) ||
        (c.address||'').toLowerCase().includes(q)
      )
    : clients;

  if (!list.length) {
    results.innerHTML = `<div style="padding:14px;font-size:12px;color:var(--text3);text-align:center">Sin resultados — prueba con otro término o crea un nuevo responsable</div>`;
    return;
  }
  results.innerHTML = list.map(c => `
    <div onclick="selectPltClient('${c.id}')"
      style="display:flex;align-items:center;gap:10px;padding:9px 12px;cursor:pointer;border-bottom:1px solid var(--border);transition:background .08s"
      onmouseover="this.style.background='var(--bg3)'" onmouseout="this.style.background=''">
      <div style="width:28px;height:28px;border-radius:5px;background:rgba(124,58,237,.1);display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:700;color:var(--accent);font-family:var(--mono);flex-shrink:0">${c.name.slice(0,2).toUpperCase()}</div>
      <div style="flex:1;min-width:0">
        <div style="font-size:13px;font-weight:500;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${c.name}</div>
        <div style="font-size:11px;color:var(--text3);font-family:var(--mono)">${[c.email,c.phone,c.tax_id].filter(Boolean).join(' · ')}</div>
      </div>
      <svg viewBox="0 0 16 16" style="width:12px;height:12px;stroke:var(--text3);fill:none;stroke-width:2;flex-shrink:0"><path d="M3 8h10M9 4l4 4-4 4"/></svg>
    </div>`).join('');
}

function selectPltClient(id) {
  const c = clients.find(x => x.id === id);
  if (!c) return;
  document.getElementById('plt-client').value = id;
  document.getElementById('plt-client-avatar').textContent = c.name.slice(0,2).toUpperCase();
  document.getElementById('plt-client-name-display').textContent = c.name;
  document.getElementById('plt-client-detail-display').textContent = [c.email, c.phone, c.tax_id].filter(Boolean).join(' · ');
  document.getElementById('plt-client-selected').classList.remove('hidden');
  document.getElementById('plt-client-selected').style.display = 'flex';
  document.getElementById('plt-client-search-panel').classList.add('hidden');
  document.getElementById('plt-client-new-panel').classList.add('hidden');
}

function clearPltClientSelection() {
  document.getElementById('plt-client').value = '';
  document.getElementById('plt-client-selected').classList.add('hidden');
  document.getElementById('plt-client-selected').style.display = '';
  setPltClientMode('search');
}

function saveInlinePltClient() {
  const name = document.getElementById('plt-new-cl-name').value.trim();
  const type = document.getElementById('plt-new-cl-type').value;
  if (!name) { alert('El nombre es obligatorio.'); return; }
  
  const newData = {
    tipo: type,
    nombre: name,
    email: document.getElementById('plt-new-cl-email').value.trim(),
    tlf:   document.getElementById('plt-new-cl-phone').value.trim(),
    nif:   document.getElementById('plt-new-cl-tax').value.trim(),
    dir:   document.getElementById('plt-new-cl-address').value.trim()
  };
  
  if(!window.appClientes) window.appClientes = [];
  window.appClientes.push(newData);
  const newId = 'fac-' + (window.appClientes.length - 1);
  
  if (typeof window.guardarGlobal === 'function') window.guardarGlobal();
  sincronizarClientes();
  updateBadges();
  
  ['plt-new-cl-name','plt-new-cl-email','plt-new-cl-phone','plt-new-cl-tax','plt-new-cl-address'].forEach(id => document.getElementById(id).value = '');
  selectPltClient(newId);
  showScanToast('Responsable creado: ' + name, 'info');
}

function saveShipment() {
  const cid = document.getElementById('sh-client').value;
  const pid = document.getElementById('sh-partner').value;
  const w   = document.getElementById('sh-weight').value;
  const destName = document.getElementById('sh-dest').value.trim();
  if (!cid || !pid || !w || !destName) {
    alert('Cliente, subcontrata, peso y nombre del destinatario son obligatorios.');
    return;
  }
  const newShipment = {
    id: 's' + genId(), tracking: 'LOG-' + genId(),
    client_id: cid, partner_id: pid, status: 'Recogido',
    weight:   parseFloat(w),
    dims:     document.getElementById('sh-dims').value     || '—',
    units:    parseInt(document.getElementById('sh-units').value) || 1,
    type:     document.getElementById('sh-type').value     || 'Economy',
    contents: document.getElementById('sh-contents').value || '',
    origin:   document.getElementById('sh-origin').value   || '—',
    dest:     destName,
    dest_phone:   document.getElementById('sh-dest-phone').value.trim()   || '',
    dest_address: document.getElementById('sh-dest-address').value.trim() || '',
    created: gDate(0)
  };
  shipments = [...shipments, newShipment];
  showView('shipments');
  updateBadges();
  renderShipments();
  showReceiptModal(newShipment.id);
  guardarDatos();
  showScanToast('Envío añadido', 'ok');
}

// ── Detail ────────────────────────────────────────────────────────────────────

// Pinta el timeline de estado (Pendiente→Recogido→En tránsito→Entregado)
// y muestra/oculta el banner de incidencia según el estado actual.
function renderShipmentTimeline(status) {
  const order = ['Pendiente', 'Recogido', 'En tránsito', 'Entregado'];
  const active = order.indexOf(status);
  const isInc  = status === 'Incidencia';
  document.querySelectorAll('#dt-timeline .dt-tl-step').forEach((el, i) => {
    el.classList.remove('is-done', 'is-active', 'is-future');
    if (isInc)             el.classList.add('is-future');
    else if (i < active)   el.classList.add('is-done');
    else if (i === active) el.classList.add('is-active');
    else                   el.classList.add('is-future');
  });
  const tl = document.getElementById('dt-timeline');
  if (tl) tl.style.opacity = isInc ? '.5' : '1';
  const inc = document.getElementById('dt-incidencia');
  if (inc) inc.style.display = isInc ? 'flex' : 'none';
}

function openDetail(id) {
  currentDetailId = id;
  const s  = shipments.find(x=>x.id===id);
  const cl = clients.find(c=>c.id===s.client_id);
  const pt = partners.find(p=>p.id===s.partner_id);

  // Breadcrumb + título principal
  const titleDisplay = document.getElementById('dt-title-display');
  if (titleDisplay) titleDisplay.textContent = s.tracking;

  // Tracking en header
  const titleEl = document.getElementById('dt-title');
  if (titleEl) titleEl.textContent = s.tracking;

  // Badge de estado coloreado
  const badgeEl = document.getElementById('dt-status-badge');
  if (badgeEl) {
    const statusStyles = {
      'Recogido':    { bg:'rgba(100,116,139,.12)', color:'#64748b',  border:'rgba(100,116,139,.2)',  dot:'#94a3b8' },
      'Pendiente':   { bg:'rgba(217,119,6,.1)',    color:'#92400e',  border:'rgba(217,119,6,.2)',    dot:'#d97706' },
      'En tránsito': { bg:'rgba(124,58,237,.1)',   color:'#5b21b6',  border:'rgba(124,58,237,.2)',   dot:'#7c3aed' },
      'Entregado':   { bg:'rgba(22,163,74,.1)',    color:'#14532d',  border:'rgba(22,163,74,.2)',    dot:'#16a34a' },
      'Incidencia':  { bg:'rgba(220,38,38,.1)',    color:'#991b1b',  border:'rgba(220,38,38,.2)',    dot:'#dc2626' },
    };
    const st = statusStyles[s.status] || statusStyles['Recogido'];
    badgeEl.style.cssText = `display:inline-flex;align-items:center;gap:5px;padding:4px 11px;border-radius:20px;font-size:11px;font-weight:700;font-family:var(--mono);background:${st.bg};color:${st.color};border:1px solid ${st.border}`;
    badgeEl.innerHTML = `<span style="width:6px;height:6px;border-radius:50%;background:${st.dot};flex-shrink:0"></span>${s.status}`;
  }

  // Selector de estado
  document.getElementById('dt-status-select').value = s.status;

  // Timeline de estado + banner de incidencia
  renderShipmentTimeline(s.status);

  // Hero metrics
  const mWeight = document.getElementById('dt-m-weight');
  const mUnits  = document.getElementById('dt-m-units');
  const mType   = document.getElementById('dt-m-type');
  if (mWeight) mWeight.textContent = (s.weight || '—') + ' kg';
  if (mUnits)  mUnits.textContent  = (s.units || 1) + ((s.units || 1) === 1 ? ' bulto' : ' bultos');
  if (mType)   mType.textContent   = s.type || 'Economy';

  // Origen & Destino
  const originEl = document.getElementById('dt-origin');
  if (originEl) originEl.textContent = s.origin || '—';

  const destEl     = document.getElementById('dt-dest');
  const destAddr   = document.getElementById('dt-dest-addr');
  const destPhone  = document.getElementById('dt-dest-phone');
  if (destEl)    destEl.textContent    = s.dest || '—';
  if (destAddr)  destAddr.textContent  = s.dest_address || '';
  if (destPhone) destPhone.textContent = s.dest_phone || '';

  // Logística
  const clientEl      = document.getElementById('dt-client');
  const partnerEl     = document.getElementById('dt-partner');
  const partnerZoneEl = document.getElementById('dt-partner-zone');
  if (clientEl)      clientEl.textContent      = cl?.name || '—';
  if (partnerEl)     partnerEl.textContent      = pt?.company_name || '—';
  if (partnerZoneEl) partnerZoneEl.textContent  = pt?.service_zones ? 'Zona: ' + pt.service_zones : '';

  // Detalles del envío
  const dimsEl     = document.getElementById('dt-dims');
  const createdEl  = document.getElementById('dt-created');
  const trackEl    = document.getElementById('dt-tracking-code');
  if (dimsEl)    dimsEl.textContent    = s.dims ? s.dims + ' cm' : '—';
  if (createdEl) createdEl.textContent = s.created || '—';
  if (trackEl)   trackEl.textContent   = s.tracking || '—';

  // Observaciones (solo si hay contenido)
  const obsRow = document.getElementById('dt-obs-row');
  const obsEl  = document.getElementById('dt-obs');
  if (s.contents && s.contents.trim() && s.contents !== '—') {
    if (obsEl)  obsEl.textContent     = s.contents;
    if (obsRow) obsRow.style.display  = 'block';
  } else {
    if (obsRow) obsRow.style.display  = 'none';
  }

  showView('detail-shipment');
}


function updateStatusFromDetail() {
  const status = document.getElementById('dt-status-select').value;
  shipments = shipments.map(s => s.id===currentDetailId ? {...s,status} : s);
  // Actualizar el badge visual
  const badgeEl = document.getElementById('dt-status-badge');
  if (badgeEl) {
    const statusStyles = {
      'Recogido':    { bg:'rgba(100,116,139,.12)', color:'#64748b',  border:'rgba(100,116,139,.2)',  dot:'#94a3b8' },
      'Pendiente':   { bg:'rgba(217,119,6,.1)',    color:'#92400e',  border:'rgba(217,119,6,.2)',    dot:'#d97706' },
      'En tránsito': { bg:'rgba(124,58,237,.1)',   color:'#5b21b6',  border:'rgba(124,58,237,.2)',   dot:'#7c3aed' },
      'Entregado':   { bg:'rgba(22,163,74,.1)',    color:'#14532d',  border:'rgba(22,163,74,.2)',    dot:'#16a34a' },
      'Incidencia':  { bg:'rgba(220,38,38,.1)',    color:'#991b1b',  border:'rgba(220,38,38,.2)',    dot:'#dc2626' },
    };
    const st = statusStyles[status] || statusStyles['Recogido'];
    badgeEl.style.cssText = `display:inline-flex;align-items:center;gap:5px;padding:4px 11px;border-radius:20px;font-size:11px;font-weight:700;font-family:var(--mono);background:${st.bg};color:${st.color};border:1px solid ${st.border}`;
    badgeEl.innerHTML = `<span style="width:6px;height:6px;border-radius:50%;background:${st.dot};flex-shrink:0"></span>${status}`;
  }
  renderShipmentTimeline(status);
  renderShipTable();
  guardarDatos();
}

function deleteShipment() {
  if (!currentDetailId) return;
  Swal.fire({
    title: '¿Eliminar envío?',
    text: 'Esta acción no se puede deshacer.',
    icon: 'warning',
    showCancelButton: true,
    confirmButtonColor: '#ef4444',
    cancelButtonColor: '#64748b',
    confirmButtonText: 'Sí, eliminar',
    cancelButtonText: 'Cancelar'
  }).then((result) => {
    if (result.isConfirmed) {
      shipments = shipments.filter(s => s.id !== currentDetailId);
      showView('shipments');
      updateBadges();
      renderShipTable();
      guardarDatos();
      showScanToast('Envío eliminado correctamente', 'ok');
    }
  });
}

function openDocsForShipment() {
  showView('shipments');
  openDocsDirect(currentDetailId);
}

function openDocsDirect(id) {
  currentDetailId = id;
  showView('labels');          // renderLabelsView runs inside here
  const sel = document.getElementById('lbl-tracking');
  sel.value = id;              // set selector to this shipment
  autoGenDocs(id);             // generate both docs immediately
}

function autoGenDocs(id) {
  const s  = shipments.find(x => x.id === id);
  if (!s) return;
  const cl = clients.find(c => c.id === s.client_id);
  const pt = partners.find(p => p.id === s.partner_id);

  // ── Etiqueta
  const labelArea = document.getElementById('label-area');
  labelArea.classList.remove('hidden');
  const labelImg = document.getElementById('label-img');
  labelImg.src = '';
  labelImg.style.minHeight = '180px';
  labelImg.style.background = 'var(--bg3)';
  labelImg.style.borderRadius = '6px';
  drawLabel(s, cl, pt).then(img => {
    labelImg.src = img;
    labelImg.style.minHeight = '';
    labelImg.style.background = '';
    document.getElementById('label-dl').href = img;
    document.getElementById('label-dl').download = 'etiqueta-' + s.tracking + '.png';
  });

  // ── Resguardo
  const receiptArea = document.getElementById('receipt-area');
  receiptArea.classList.remove('hidden');
  const receiptImg = document.getElementById('receipt-img');
  receiptImg.src = '';
  receiptImg.style.minHeight = '180px';
  receiptImg.style.background = 'var(--bg3)';
  receiptImg.style.borderRadius = '6px';
  drawReceipt(s, cl, pt).then(img => {
    receiptImg.src = img;
    receiptImg.style.minHeight = '';
    receiptImg.style.background = '';
    document.getElementById('receipt-dl').href = img;
    document.getElementById('receipt-dl').download = 'resguardo-' + s.tracking + '.png';
  });
}

// ── Labels view ───────────────────────────────────────────────────────────────
function renderLabelsView() {
  const sel = document.getElementById('lbl-tracking');
  const prevId = sel?.value;   // preserve any pre-set value from openDocsDirect
  sel.innerHTML = '<option value="">Seleccionar envío…</option>' +
    shipments.map(s=>`<option value="${s.id}">${s.tracking} — ${clients.find(c=>c.id===s.client_id)?.name?.split(' ')[0]||''}</option>`).join('');
  if (prevId) sel.value = prevId;
  // Only hide docs if no shipment is pre-selected (manual navigation)
  if (!prevId) {
    document.getElementById('label-area').classList.add('hidden');
    document.getElementById('receipt-area').classList.add('hidden');
  }
}

function loadDocShipment() {
  // Manual change in the selector — regenerate both
  const id = document.getElementById('lbl-tracking').value;
  if (!id) {
    document.getElementById('label-area').classList.add('hidden');
    document.getElementById('receipt-area').classList.add('hidden');
    return;
  }
  autoGenDocs(id);
}

// ── Clients ───────────────────────────────────────────────────────────────────
function renderClients() {
  const q = (document.getElementById('cl-search')?.value || '').toLowerCase().trim();
  let list = clients;
  if (q) list = list.filter(c =>
    c.name.toLowerCase().includes(q) ||
    (c.email||'').toLowerCase().includes(q) ||
    (c.phone||'').toLowerCase().includes(q) ||
    (c.tax_id||'').toLowerCase().includes(q) ||
    (c.address||'').toLowerCase().includes(q)
  );
  document.getElementById('cl-sub').textContent = `${clients.length} registrados`;
  document.getElementById('cl-count').textContent = q ? `${list.length} de ${clients.length}` : `${clients.length} clientes`;

  const td = (val, mono=false, dim=false) =>
    `<td style="padding:13px 18px;font-size:13px;color:${dim?'var(--text3)':'var(--text2)'};border-bottom:1px solid var(--border);font-family:${mono?'var(--mono)':'var(--font)'};white-space:nowrap;max-width:200px;overflow:hidden;text-overflow:ellipsis">${val||'—'}</td>`;

  document.getElementById('client-list').innerHTML = list.length ? list.map(c => `
    <tr style="transition:background .08s" onmouseover="this.style.background='var(--bg3)'" onmouseout="this.style.background=''">
      <td style="padding:13px 18px;border-bottom:1px solid var(--border);white-space:nowrap">
        <div style="display:flex;align-items:center;gap:10px">
          <div style="width:32px;height:32px;border-radius:8px;background:rgba(124,58,237,.1);display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;color:var(--accent);font-family:var(--mono);flex-shrink:0">${c.name.slice(0,2).toUpperCase()}</div>
          <span style="font-size:13px;font-weight:500;color:var(--text)">${c.name}</span>
        </div>
      </td>
      ${td(c.email, true, true)}
      ${td(c.phone, true, true)}
      ${td(c.tax_id, true, true)}
      ${td(c.address, false, true)}
      <td style="padding:13px 18px;border-bottom:1px solid var(--border);white-space:nowrap">
        <div style="display:flex;gap:6px;justify-content:flex-end">
          <button class="btn btn-ghost btn-sm" onclick="editClient('${c.id}')">Editar</button>
          <button class="btn btn-danger btn-sm" onclick="deleteClient('${c.id}')">Eliminar</button>
        </div>
      </td>
    </tr>`).join('') :
    `<tr><td colspan="6" style="padding:40px;text-align:center;color:var(--text3);font-size:13px">Sin resultados para "${q}"</td></tr>`;
}

function openClientModal(id=null) {
  editClientId=id;
  const c=id?clients.find(x=>x.id===id):{};
  document.getElementById('modal-client-title').textContent=id?'Editar cliente':'Nuevo cliente';
  document.getElementById('cl-name').value=c.name||'';
  document.getElementById('cl-email').value=c.email||'';
  document.getElementById('cl-phone').value=c.phone||'';
  document.getElementById('cl-address').value=c.address||'';
  document.getElementById('cl-tax').value=c.tax_id||'';
  document.getElementById('modal-client').classList.remove('hidden');
}
function editClient(id){openClientModal(id);}
function deleteClient(id) {
  Swal.fire({
    title: '¿Eliminar cliente?',
    text: 'Esta acción no se puede deshacer.',
    icon: 'warning',
    showCancelButton: true,
    confirmButtonColor: '#ef4444',
    cancelButtonColor: '#64748b',
    confirmButtonText: 'Sí, eliminar',
    cancelButtonText: 'Cancelar'
  }).then((result) => {
    if (result.isConfirmed) {
      const idx = parseInt(id.replace('fac-', ''), 10);
      if (!isNaN(idx) && window.appClientes) {
        window.appClientes.splice(idx, 1);
        if(typeof window.guardarGlobal === 'function') window.guardarGlobal();
        sincronizarClientes();
      }
      updateBadges();
      showScanToast('Cliente eliminado', 'ok');
    }
  });
}

function saveClient() {
  const name=document.getElementById('cl-name').value.trim();
  const email=document.getElementById('cl-email').value.trim();
  if(!name||!email){alert('Nombre y email son obligatorios.');return;}
  
  const data = {
    nombre: name,
    email: email,
    tlf: document.getElementById('cl-phone').value,
    dir: document.getElementById('cl-address').value,
    nif: document.getElementById('cl-tax').value
  };

  if(!window.appClientes) window.appClientes = [];
  
  if(editClientId) {
    const idx = parseInt(editClientId.replace('fac-', ''), 10);
    if (!isNaN(idx) && window.appClientes[idx]) {
       window.appClientes[idx] = { ...window.appClientes[idx], ...data };
    }
  } else {
    window.appClientes.push(data);
  }
  
  if(typeof window.guardarGlobal === 'function') window.guardarGlobal();
  sincronizarClientes();
  
  closeModal('modal-client'); updateBadges();
  showScanToast('Cliente guardado', 'ok');
}

// ── Partners ──────────────────────────────────────────────────────────────────
function renderPartners() {
  const q = (document.getElementById('pt-search')?.value || '').toLowerCase().trim();
  let list = partners;
  if (q) list = list.filter(p =>
    p.company_name.toLowerCase().includes(q) ||
    (p.contact_email||'').toLowerCase().includes(q) ||
    (p.service_zones||'').toLowerCase().includes(q) ||
    (p.phone||'').toLowerCase().includes(q)
  );
  document.getElementById('pt-count').textContent = q ? `${list.length} de ${partners.length}` : `${partners.length} colaboradoras`;

  const td = (val, mono=false, dim=false) =>
    `<td style="padding:13px 18px;font-size:13px;color:${dim?'var(--text3)':'var(--text2)'};border-bottom:1px solid var(--border);font-family:${mono?'var(--mono)':'var(--font)'};white-space:nowrap">${val||'—'}</td>`;

  const ellP = 'overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:0';
  document.getElementById('partner-list').innerHTML = list.length ? list.map(p => `
    <tr style="transition:background .08s;border-left:2px solid ${p.active?'var(--accent)':'var(--border2)'}"
      onmouseover="this.style.background='var(--bg3)'" onmouseout="this.style.background=''">
      <td style="padding:11px 12px;border-bottom:1px solid var(--border);${ellP}">
        <div style="display:flex;align-items:center;gap:8px;min-width:0">
          <div style="width:28px;height:28px;border-radius:7px;background:${p.active?'rgba(124,58,237,.1)':'var(--bg3)'};display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:700;color:${p.active?'var(--accent)':'var(--text3)'};font-family:var(--mono);flex-shrink:0">${p.company_name.slice(0,2).toUpperCase()}</div>
          <span style="font-size:13px;font-weight:500;color:var(--text);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${p.company_name}</span>
        </div>
      </td>
      <td style="padding:11px 12px;border-bottom:1px solid var(--border);${ellP};font-size:12px;color:var(--text2)" title="${p.contact_email||''}">${p.contact_email||'—'}</td>
      <td style="padding:11px 12px;border-bottom:1px solid var(--border);font-size:12px;color:var(--text2);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${p.phone||'—'}</td>
      <td style="padding:11px 12px;border-bottom:1px solid var(--border);${ellP};font-size:12px;color:var(--text2)" title="${p.service_zones||''}">${p.service_zones||'—'}</td>
      <td style="padding:11px 12px;border-bottom:1px solid var(--border)">
        <span style="font-size:13px;font-weight:600;color:var(--text);font-family:var(--mono)">${p.base_rate?.toFixed(2)}</span>
        <span style="font-size:11px;color:var(--text3)">€/kg</span>
      </td>
      <td style="padding:11px 12px;border-bottom:1px solid var(--border)">
        <span style="display:inline-flex;align-items:center;gap:4px;padding:3px 7px;border-radius:4px;font-size:11px;font-weight:600;font-family:var(--mono);
          background:${p.active?'rgba(124,58,237,.1)':'rgba(138,145,160,.1)'};
          color:${p.active?'var(--accent)':'var(--text3)'};
          border:1px solid ${p.active?'rgba(124,58,237,.25)':'rgba(138,145,160,.2)'}">
          <span style="width:5px;height:5px;border-radius:50%;background:${p.active?'var(--accent)':'var(--text3)'}"></span>
          ${p.active ? 'Activa' : 'Inactiva'}
        </span>
      </td>
      <td style="padding:11px 12px;border-bottom:1px solid var(--border);text-align:center">
        <div style="display:inline-flex;gap:2px">
          <button class="btn-icon" onclick="editPartner('${p.id}')" title="Editar"><i class="fa-solid fa-pen"></i></button>
          <button class="btn-icon danger" onclick="deletePartner('${p.id}')" title="Eliminar"><i class="fa-solid fa-trash-can"></i></button>
        </div>
      </td>
    </tr>`).join('') :
    `<tr><td colspan="7" style="padding:40px;text-align:center;color:var(--text3);font-size:13px">Sin resultados para "${q}"</td></tr>`;
}

function openPartnerModal(id=null) {
  editPartnerId=id;
  const p=id?partners.find(x=>x.id===id):{};
  document.getElementById('modal-partner-title').textContent=id?'Editar colaboradora':'Nueva colaboradora';
  document.getElementById('pt-name').value=p.company_name||'';
  document.getElementById('pt-email').value=p.contact_email||'';
  document.getElementById('pt-phone').value=p.phone||'';
  document.getElementById('pt-zones').value=p.service_zones||'';
  document.getElementById('pt-rate').value=p.base_rate||'';
  document.getElementById('pt-active').checked=p.active!==false;
  showView('new-partner');
}
function editPartner(id){openPartnerModal(id);}

function deletePartner(id) {
  Swal.fire({
    title: '¿Eliminar colaboradora?',
    text: 'Esta acción no se puede deshacer.',
    icon: 'warning',
    showCancelButton: true,
    confirmButtonColor: '#ef4444',
    cancelButtonColor: '#64748b',
    confirmButtonText: 'Sí, eliminar',
    cancelButtonText: 'Cancelar'
  }).then((result) => {
    if (result.isConfirmed) {
      partners = partners.filter(p => p.id !== id);
      updateBadges();
      renderPartners();
      guardarDatos();
      showScanToast('Colaboradora eliminada', 'ok');
    }
  });
}

function savePartner() {
  const name=document.getElementById('pt-name').value.trim();
  if(!name){alert('Nombre de empresa obligatorio.');return;}
  const data={company_name:name,contact_email:document.getElementById('pt-email').value,phone:document.getElementById('pt-phone').value,service_zones:document.getElementById('pt-zones').value,base_rate:parseFloat(document.getElementById('pt-rate').value)||0,active:document.getElementById('pt-active').checked};
  if(editPartnerId) partners=partners.map(p=>p.id===editPartnerId?{...data,id:editPartnerId}:p);
  else partners=[...partners,{...data,id:'p'+genId()}];
  showView('partners'); renderPartners(); updateBadges();
  guardarDatos();
  showScanToast('Colaboradora guardada', 'ok');
}

// ── Utils ─────────────────────────────────────────────────────────────────────
function closeModal(id){ const el = document.getElementById(id); if(el) el.classList.add('hidden'); }

// ── Canvas Document Generators (4× resolution for sharpness) ──────────────────
const DPR = 4; // high-res multiplier

function hiCanvas(w, h) {
  const cv = document.createElement('canvas');
  cv.width  = w * DPR;
  cv.height = h * DPR;
  const ctx = cv.getContext('2d');
  ctx.scale(DPR, DPR);
  return {cv, ctx};
}

function drawLabel(s, cl, pt) {
  // Zebra ZT230 @ 200 DPI — Portrait 8.2cm x 14.5cm
  // W=646 dots, H=1142 dots. DPR=2 -> canvas 1292x2284px (400 DPI source)
  const W = 646, H = 1142, DPR = 2;
  const cv = document.createElement('canvas');
  cv.width = W * DPR; cv.height = H * DPR;
  const c = cv.getContext('2d');
  c.scale(DPR, DPR);
  const BLK  = '#000000';
  const WHT  = '#FFFFFF';
  const MONO = "ui-monospace,'SF Mono',Menlo,Consolas,monospace";
  const SANS = "-apple-system,'Helvetica Neue',Arial,sans-serif";

  // strokeFill: draws text with thin outline — makes text thicker for thermal printing
  function sf(text, x, y, sw) {
    var s = (sw === undefined) ? 1.3 : sw;
    c.save();
    c.lineWidth = s; c.lineJoin = 'round'; c.miterLimit = 2;
    c.strokeStyle = BLK; c.strokeText(text, x, y);
    c.restore();
    c.fillText(text, x, y);
  }

  // wrapWords: split text into lines that fit within maxPx using measureText (exact!)
  function wrapWords(text, maxPx, maxLines) {
    var words = text.split(' ');
    var lines = [], cur = '';
    for (var i = 0; i < words.length; i++) {
      var test = cur ? cur + ' ' + words[i] : words[i];
      if (c.measureText(test).width <= maxPx) {
        cur = test;
      } else {
        if (cur) lines.push(cur);
        cur = words[i];
      }
    }
    if (cur) lines.push(cur);
    return lines.slice(0, maxLines || 3);
  }

  // phoneIcon: modern smartphone silhouette icon — pure black, no grays
  // x,y = top-left corner, h = total height in logical px
  function phoneIcon(x, y, h) {
    var w  = h * 0.55;         // phone width ~55% of height
    var r  = h * 0.10;         // corner radius
    c.save(); c.fillStyle = BLK;
    // Body (rounded rect)
    c.beginPath();
    c.moveTo(x + r, y);
    c.lineTo(x + w - r, y); c.arcTo(x + w, y,     x + w, y + r,     r);
    c.lineTo(x + w, y + h - r); c.arcTo(x + w, y + h, x + w - r, y + h, r);
    c.lineTo(x + r, y + h); c.arcTo(x,     y + h, x,     y + h - r, r);
    c.lineTo(x, y + r); c.arcTo(x, y, x + r, y, r);
    c.closePath(); c.fill();
    // Screen (white inset rectangle)
    c.fillStyle = WHT;
    c.fillRect(x + w * 0.12, y + h * 0.12, w * 0.76, h * 0.65);
    // Home button dot (bottom centre)
    c.beginPath();
    c.arc(x + w / 2, y + h * 0.88, h * 0.06, 0, Math.PI * 2);
    c.fill();
    // Speaker slot (top centre, black — already drawn as body; punch white slot)
    c.fillRect(x + w * 0.32, y + h * 0.06, w * 0.36, h * 0.04);
    c.restore();
  }

  // typeBadge: filled black rectangle with white label text
  function typeBadge(label, cx, cy, fontSize) {
    c.save();
    c.font = '700 ' + fontSize + 'px ' + SANS;
    var tw = c.measureText(label).width;
    var ph = fontSize * 0.55, pw = tw + fontSize * 1.2;
    var bx = cx - pw / 2, by = cy - fontSize * 0.82;
    var br = fontSize * 0.22;
    // filled pill
    c.fillStyle = BLK;
    c.beginPath();
    c.moveTo(bx + br, by); c.lineTo(bx + pw - br, by);
    c.arcTo(bx + pw, by, bx + pw, by + br, br);
    c.lineTo(bx + pw, by + fontSize + ph - br);
    c.arcTo(bx + pw, by + fontSize + ph, bx + pw - br, by + fontSize + ph, br);
    c.lineTo(bx + br, by + fontSize + ph);
    c.arcTo(bx, by + fontSize + ph, bx, by + fontSize + ph - br, br);
    c.lineTo(bx, by + br); c.arcTo(bx, by, bx + br, by, br);
    c.closePath(); c.fill();
    // white text in pill
    c.fillStyle = WHT;
    c.textAlign = 'center';
    c.fillText(label, cx, cy);
    c.textAlign = 'left';
    c.restore();
    return fontSize + ph + 6; // returns total height used
  }


  const bcTrack = s.tracking.replace(/-/g, '');
  const bcCv    = document.createElement('canvas');
  try {
    JsBarcode(bcCv, bcTrack, {
      format: 'CODE128', width: 3, height: 200,
      displayValue: false, margin: 10,
      background: WHT, lineColor: BLK,
    });
  } catch(e) { console.error('[BC]', e); }

  const bcImg   = new Image(); bcImg.src   = bcCv.toDataURL('image/png');
  const logoImg = new Image(); logoImg.src = 'logo-myl.png';

  function render() {
    const MARGIN = 14; // left/right margin
    const TW = W - MARGIN * 2; // usable text width

    c.fillStyle = WHT; c.fillRect(0, 0, W, H);
    c.strokeStyle = BLK; c.lineWidth = 2;
    c.strokeRect(1, 1, W - 2, H - 2);

    var y = 2; // cursor Y from top

    // ══ ZONA 1: CABECERA (logo + empresa) ══
    // Logo: blanco, logo drawn at natural colors (dark on white = perfect thermal)
    var LOGO_AREA = 64;
    if (logoImg.complete && logoImg.width > 0) {
      var sc = Math.min((W - 32) / logoImg.naturalWidth, LOGO_AREA / logoImg.naturalHeight);
      var lW = logoImg.naturalWidth * sc, lH = logoImg.naturalHeight * sc;
      c.drawImage(logoImg, (W - lW) / 2, y + 4 + (LOGO_AREA - lH) / 2, lW, lH);
    }
    y += LOGO_AREA + 4;
    c.fillStyle = BLK;
    c.font = '700 20px ' + SANS; c.textAlign = 'center';
    sf('MYL EXPRESS LOGISTICA S.L.', W / 2, y + 18, 1.0);
    c.font = '700 13px ' + SANS;
    sf('AGENCIA DE TRANSPORTE Y LOGISTICA', W / 2, y + 33, 0.7);
    c.textAlign = 'left';
    y += 38;
    // Header bottom double border
    c.fillStyle = BLK;
    c.fillRect(0, y, W, 3);
    c.fillRect(0, y + 5, W, 1);
    y += 9;

    // ══ ZONA 2: TRACKING # ══
    c.fillStyle = BLK; c.font = '800 28px ' + MONO;
    c.textAlign = 'center';
    sf(s.tracking, W / 2, y + 34, 1.2);
    c.textAlign = 'left';
    y += 38;
    // Service type — plain bold text, centered, no badge
    if (s.type) {
      c.fillStyle = BLK; c.font = '700 17px ' + SANS;
      c.textAlign = 'center';
      sf(s.type.toUpperCase(), W / 2, y + 18, 0.9);
      c.textAlign = 'left';
      y += 24;
    }
    // Dashed separator
    c.save(); c.setLineDash([11, 6]);
    c.strokeStyle = BLK; c.lineWidth = 1.5;
    c.beginPath(); c.moveTo(MARGIN, y); c.lineTo(W - MARGIN, y); c.stroke();
    c.restore();
    y += 6;

    // ══ ZONA 3: DESTINATARIO (nombre + dirección + tel) ══
    c.fillStyle = BLK;
    c.font = '700 16px ' + SANS;
    sf('DESTINATARIO', MARGIN, y + 16, 0.8);
    y += 22;

    // Destination NAME — same size as sender name (700/19px), word-wrap 2 lines
    c.font = '700 19px ' + SANS;
    var destText  = (s.dest || '--').toUpperCase();
    var destLines = wrapWords(destText, TW - 56, 2);
    var destLineH = 24;
    // Units badge top-right
    c.textAlign = 'right';
    sf(String(s.units || 1).padStart(2, '0'), W - MARGIN, y + destLineH - 2, 1.2);
    c.textAlign = 'left';
    for (var di = 0; di < destLines.length; di++) {
      sf(destLines[di], MARGIN, y + (di + 1) * destLineH, 1.2);
    }
    y += destLines.length * destLineH + 4;

    // Destination ADDRESS (if available)
    if (s.dest_address) {
      c.font = '700 17px ' + SANS;
      var addrLines = wrapWords(s.dest_address, TW, 2);
      for (var ai = 0; ai < addrLines.length; ai++) {
        sf(addrLines[ai], MARGIN, y + 18, 1.2);
        y += 20;
      }
    }
    // Destination PHONE — modern smartphone icon + number
    if (s.dest_phone) {
      var icH = 18; // icon height px
      phoneIcon(MARGIN, y + 2, icH);
      c.font = '700 17px ' + SANS; c.fillStyle = BLK;
      sf(s.dest_phone, MARGIN + icH * 0.6 + 6, y + 17, 1.2);
      y += 22;
    }
    y += 4;

    // Thin separator between destination and sender
    c.strokeStyle = BLK; c.lineWidth = 1.5;
    c.beginPath(); c.moveTo(MARGIN, y); c.lineTo(W - MARGIN, y); c.stroke();
    y += 8;

    // ══ REMITENTE section ══
    c.font = '700 16px ' + SANS;
    sf('REMITENTE', MARGIN, y + 14, 0.8);
    y += 20;

    c.font = '700 19px ' + SANS;
    sf((cl?.name || '--').toUpperCase().substring(0, 26), MARGIN, y + 19, 1.2);
    y += 22;

    c.font = '700 17px ' + SANS;
    if (cl?.address) { sf(cl.address.substring(0, 40), MARGIN, y + 17, 1.2); y += 20; }
    // Sender PHONE — modern smartphone icon + number
    if (cl?.phone) {
      var icH2 = 17;
      phoneIcon(MARGIN, y + 2, icH2);
      c.font = '700 17px ' + SANS; c.fillStyle = BLK;
      sf(cl.phone, MARGIN + icH2 * 0.6 + 5, y + 17, 1.2);
      y += 21;
    }
    // NIF removed — no se imprime en la etiqueta por privacidad

    // Transporter (right column)
    c.font = '700 15px ' + SANS; c.textAlign = 'right';
    sf('TRANSP.: ' + (pt?.company_name || '--').substring(0, 16), W - MARGIN, y - 72, 1.0);
    sf((pt?.service_zones || '--').substring(0, 18), W - MARGIN, y - 52, 1.0);
    c.textAlign = 'left';

    y += 6;
    // Zone 3 bottom border
    c.fillStyle = BLK; c.fillRect(0, y, W, 3); y += 3;


    // ══ ZONA 4: CONTENIDO + DIMS + FECHA ══
    var Z4Y = y, Z4H = 100;
    c.strokeStyle = BLK; c.lineWidth = 2;
    c.strokeRect(5, Z4Y + 3, W - 10, Z4H - 6);

    c.fillStyle = BLK;
    c.font = '700 16px ' + SANS;
    sf('OBSERVACIONES:', MARGIN + 2, Z4Y + 22, 0.8);
    c.font = '700 20px ' + SANS;
    var obsText = (s.contents || '').trim();
    sf(obsText ? obsText.substring(0, 34) : '—', MARGIN + 2, Z4Y + 46, 1.3);

    // Dims/peso/fecha — 18px bold — clearly readable
    c.font = '700 18px ' + MONO; c.textAlign = 'right';
    sf((s.dims || '--') + '  |  ' + s.weight + ' kg  |  ' + (s.units || 1) + ' u.  |  ' + s.created, W - MARGIN - 2, Z4Y + Z4H - 12, 1.1);
    c.textAlign = 'left';

    y = Z4Y + Z4H;
    c.fillStyle = BLK; c.fillRect(0, y, W, 3); y += 3;

    // ══ ZONA 5: CODIGO DE BARRAS — fills ALL remaining space, tracking anchored at bottom ══
    var Z5Y = y;
    var Z5H = H - Z5Y - 2; // full remaining height down to bottom border

    // "CODIGO DE SEGUIMIENTO" label at top of zone
    c.fillStyle = BLK; c.font = '700 16px ' + SANS;
    c.textAlign = 'center';
    sf('CODIGO DE SEGUIMIENTO', W / 2, Z5Y + 20, 0.7);
    c.textAlign = 'left';

    // Tracking text ANCHORED to the very bottom of the label (no white gap)
    var TRACK_Y = Z5Y + Z5H - 6;  // absolute bottom baseline

    // Barcode image fills between label and tracking text
    var bcTop    = Z5Y + 24;
    var bcBottom = TRACK_Y - 30; // 30px above tracking text baseline
    var bcAvailH = bcBottom - bcTop;
    var bcNatW   = bcCv.width  || 370;
    var bcNatH   = bcCv.height || 220;
    var bcDrawH  = Math.max(80, bcAvailH); // use all available height
    var bcDrawW  = Math.min(W - 32, (bcNatW / bcNatH) * bcDrawH);
    var bcDrawX  = (W - bcDrawW) / 2;
    try {
      c.drawImage(bcImg, bcDrawX, bcTop, bcDrawW, bcDrawH);
    } catch(e) {
      c.strokeStyle = BLK; c.lineWidth = 1;
      c.strokeRect(bcDrawX, bcTop, bcDrawW, bcDrawH);
    }

    // Tracking number — at absolute bottom, always visible, no gap below
    c.fillStyle = BLK; c.font = '700 22px ' + MONO;
    c.textAlign = 'center';
    sf(s.tracking, W / 2, TRACK_Y, 1.0);
    c.textAlign = 'left';
  }

  return new Promise(resolve => {
    let loaded = 0;
    const check = () => { if (++loaded === 2) { render(); resolve(cv.toDataURL('image/png')); } };
    bcImg.onload   = check; bcImg.onerror   = check;
    logoImg.onload = check; logoImg.onerror = check;
    if (bcImg.complete)   check();
    if (logoImg.complete) check();
  });
}


// generateQRDataURL eliminado — funcionalidad QR eliminada


function generateBarcodeDataURL(text, w, h) {
  // IMPORTANT: Do NOT rescale the barcode canvas — rescaling distorts bar widths
  // and makes barcodes unreadable by scanners. Generate at native size.
  const cv = document.createElement('canvas');
  try {
    JsBarcode(cv, text, {
      format: 'CODE128',
      width: 3,       // bar module width in px (must be integer, no rescaling)
      height: h,
      displayValue: false,
      margin: 4,
      background: '#ffffff',
      lineColor: '#000000',
    });
  } catch(e) {
    console.error('[BC] JsBarcode error:', e);
  }
  return cv.toDataURL('image/png');
}

function drawReceipt(s, cl, pt) {
  // Thermal 58mm ticket — 384px @ 203dpi
  const W = 384;
  const MARGIN = 16;
  const TW = W - MARGIN * 2;
  const FONT = "Inter, ui-monospace, 'SF Mono', Menlo, monospace";
  const SANS = "Inter, -apple-system, 'Helvetica Neue', sans-serif";

  // Build Code128 barcode for tracking code
  const BW = TW, BH = 48;
  const bcDataUrl = generateBarcodeDataURL(s.tracking.replace(/-/g,''), BW, BH);
  const bcImg = new Image(); bcImg.src = bcDataUrl;
  const logoImg = new Image(); logoImg.src = 'logo-myl.png';

  function buildContent(c, finalH) {
    c.fillStyle = '#FFFFFF';
    c.fillRect(0, 0, W, finalH || 9999);
    let y = MARGIN;

    // ── Header
    c.fillStyle = '#000'; c.font = `700 17px ${SANS}`;
    c.textAlign = 'center';
    if (logoImg.complete && logoImg.width > 0) {
      const lgH = 40;
      const lgW = logoImg.width * (lgH / Math.max(1, logoImg.height));
      c.drawImage(logoImg, (W - lgW)/2, y, lgW, lgH);
      y += lgH + 8;
    } else {
      c.fillText('MYL EXPRESS', W/2, y + 14); y += 22;
    }
    c.font = `400 10px ${FONT}`; c.fillStyle = '#555';
    c.fillText('RESGUARDO DE ENVÍO', W/2, y + 10); y += 16;
    c.textAlign = 'left';

    function dashedLine() {
      c.fillStyle = '#AAAAAA'; c.font = `400 9px ${FONT}`;
      c.textAlign = 'center';
      c.fillText('· · · · · · · · · · · · · · · · · · · · · · · · · · · ·', W/2, y + 7);
      c.textAlign = 'left'; y += 14;
    }

    function field(label, value) {
      const val = String(value || '—');
      c.font = `600 9px ${SANS}`; c.fillStyle = '#666';
      c.fillText(label.toUpperCase(), MARGIN, y + 9);
      c.font = `500 11px ${FONT}`; c.fillStyle = '#000';
      const words = val.split(' ');
      let line = '', lines = [];
      for (const w of words) {
        const test = line ? line + ' ' + w : w;
        if (c.measureText(test).width > TW) { lines.push(line); line = w; }
        else line = test;
      }
      lines.push(line);
      if (lines.length === 1 && c.measureText(val).width < TW * 0.65) {
        c.textAlign = 'right'; c.fillText(val, W - MARGIN, y + 9); c.textAlign = 'left'; y += 18;
      } else {
        y += 12; lines.forEach(l => { c.fillText(l, MARGIN + 4, y + 9); y += 14; });
      }
      c.strokeStyle = '#E8E8E8'; c.lineWidth = 0.5;
      c.beginPath(); c.moveTo(MARGIN, y + 2); c.lineTo(W - MARGIN, y + 2); c.stroke();
      y += 7;
    }

    dashedLine();

    // Tracking large
    c.fillStyle = '#000'; c.font = `700 18px ${FONT}`;
    c.textAlign = 'center';
    c.fillText(s.tracking, W/2, y + 16); y += 24;
    c.font = `700 11px ${SANS}`;
    c.fillText('[ ' + s.status.toUpperCase() + ' ]', W/2, y + 10); y += 18;
    c.textAlign = 'left';
    dashedLine();

    // Client
    c.font = `700 10px ${SANS}`; c.fillStyle = '#000';
    c.fillText('CLIENTE', MARGIN, y + 9); y += 16;
    field('Nombre', cl?.name);
    field('NIF/CIF', cl?.tax_id);
    field('Teléfono', cl?.phone);
    dashedLine();

    // Shipment
    c.font = `700 10px ${SANS}`; c.fillStyle = '#000';
    c.fillText('ENVÍO', MARGIN, y + 9); y += 16;
    field('Origen', s.origin);
    field('Destino', s.dest);
    field('Peso', s.weight + ' kg');
    field('Bultos', s.units || 1);
    field('Dimensiones', s.dims);
    field('Contenido', s.contents);
    field('Fecha', s.created);
    dashedLine();

    // Carrier
    c.font = `700 10px ${SANS}`; c.fillStyle = '#000';
    c.fillText('TRANSPORTISTA', MARGIN, y + 9); y += 16;
    field('Empresa', pt?.company_name);
    field('Zonas', pt?.service_zones);
    dashedLine();

    dashedLine();

    // ── Barcode Code128 (real, centered)
    const bcX = MARGIN;
    try { c.drawImage(bcImg, bcX, y, BW, BH); } catch(e) {
      c.fillStyle = '#EEE'; c.fillRect(bcX, y, BW, BH);
    }
    y += BH + 6;
    c.font = `500 10px ${FONT}`; c.fillStyle = '#000';
    c.textAlign = 'center';
    c.fillText(s.tracking, W/2, y + 9); y += 18;
    c.textAlign = 'left';
    dashedLine();

    // Footer
    c.font = `400 9px ${FONT}`; c.fillStyle = '#888';
    c.textAlign = 'center';
    c.fillText(new Date().toLocaleString('es-ES'), W/2, y + 9); y += 14;
    c.fillText('Myl Express Logística S.L.', W/2, y + 9); y += 14;
    c.fillText('Conserve este resguardo', W/2, y + 9); y += 20;
    c.textAlign = 'left';
    return y;
  }

  // Two-pass: measure → render
  return new Promise(resolve => {
    // Wait for barcode and logo
    let loaded = 0;
    const check = () => { if(++loaded === 2) render(); };
    bcImg.onload = check; logoImg.onload = check;
    bcImg.onerror = check; logoImg.onerror = check;
    // If already cached/loaded
    if (bcImg.complete) check();
    if (logoImg.complete) check();

    function render() {
      const tempCv = document.createElement('canvas');
      tempCv.width = W; tempCv.height = 2400;
      const totalH = buildContent(tempCv.getContext('2d'), 2400) + MARGIN;
      const {cv, ctx} = hiCanvas(W, totalH);
      buildContent(ctx, totalH);
      resolve(cv.toDataURL('image/png'));
    }
  });
}

// ── Gen handlers ──────────────────────────────────────────────────────────────
function genLabel() {
  const sid = document.getElementById('lbl-tracking').value;
  if(!sid){alert('Selecciona un envío primero.');return;}
  const s=shipments.find(x=>x.id===sid);
  const cl=clients.find(c=>c.id===s.client_id);
  const pt=partners.find(p=>p.id===s.partner_id);
  drawLabel(s,cl,pt).then(img => {
    document.getElementById('label-img').src=img;
    document.getElementById('label-dl').href=img;
    document.getElementById('label-dl').download='etiqueta-'+s.tracking+'.png';
    document.getElementById('label-area').classList.remove('hidden');
  });
}

function genReceipt() {
  const sid = document.getElementById('lbl-tracking').value;
  if(!sid){alert('Selecciona un envío primero.');return;}
  const s=shipments.find(x=>x.id===sid);
  const cl=clients.find(c=>c.id===s.client_id);
  const pt=partners.find(p=>p.id===s.partner_id);
  drawReceipt(s,cl,pt).then(img => {
    document.getElementById('receipt-img').src=img;
    document.getElementById('receipt-dl').href=img;
    document.getElementById('receipt-dl').download='resguardo-'+s.tracking+'.png';
    document.getElementById('receipt-area').classList.remove('hidden');
  });
}

// ── Inline status selector ────────────────────────────────────────────────────
const STATUS_STYLE = {
  'Recogido':    {bg:'#f0f1f5',             color:'#4b5263', dot:'#7c8494'},
  'Empacado':    {bg:'#fff7e6',             color:'#92400e', dot:'#d97706'},
  'En Tránsito': {bg:'#f3effe',             color:'#5b21b6', dot:'#7c3aed'},
  'Entregado':   {bg:'#f0fdf4',             color:'#14532d', dot:'#16a34a'},
};

function statusBtn(shipId, status) {
  const st = STATUS_STYLE[status] || STATUS_STYLE['Recogido'];
  return `<div class="status-cell" id="sc-${shipId}">
    <button class="status-pill-btn" data-s="${status}"
      style="background:${st.bg};color:${st.color};border:1px solid ${st.dot}44;cursor:pointer"
      onclick="toggleDropdown('${shipId}',event)">
      <span class="pill-dot" style="background:${st.dot}"></span>
      ${status}
      <span class="chev"></span>
    </button>
  </div>`;
}

// ── Dropdown portal (fixed position, never clipped by table overflow) ─────────
let openDropdownId = null;

function toggleDropdown(shipId, e) {
  e.stopPropagation();
  if (openDropdownId === shipId) { closeAllDropdowns(); return; }
  closeAllDropdowns();
  openDropdownId = shipId;

  const btn = e.currentTarget;
  const rect = btn.getBoundingClientRect();

  let portal = document.getElementById('status-portal');
  if (!portal) {
    portal = document.createElement('div');
    portal.id = 'status-portal';
    portal.style.cssText = `position:fixed;z-index:9999;display:none`;
    document.body.appendChild(portal);
  }

  const opts = Object.entries(STATUS_STYLE).map(([s, ss]) => `
    <div class="status-opt" onclick="selectStatus('${shipId}','${s}',event)"
      style="display:flex;align-items:center;gap:8px;padding:8px 12px;border-radius:5px;
        font-size:12px;font-weight:500;font-family:var(--mono);cursor:pointer;
        color:${ss.color};transition:background .08s"
      onmouseover="this.style.background='var(--bg3)'" onmouseout="this.style.background=''">
      <span style="width:6px;height:6px;border-radius:50%;background:${ss.dot};flex-shrink:0"></span>${s}
    </div>`).join('');

  portal.innerHTML = `<div style="background:var(--bg2);border:1px solid var(--border2);border-radius:8px;
    padding:4px;min-width:160px;box-shadow:0 8px 32px rgba(0,0,0,.2),0 2px 8px rgba(0,0,0,.12)">${opts}</div>`;

  // Position below the button, flip up if too close to bottom
  const spaceBelow = window.innerHeight - rect.bottom;
  const dropH = 180; // approx height
  const top = spaceBelow > dropH ? rect.bottom + 6 : rect.top - dropH - 6;
  portal.style.left = rect.left + 'px';
  portal.style.top  = top + 'px';
  portal.style.display = 'block';
}

function closeAllDropdowns() {
  const portal = document.getElementById('status-portal');
  if (portal) portal.style.display = 'none';
  openDropdownId = null;
}

function selectStatus(shipId, status, e) {
  e.stopPropagation();
  shipments = shipments.map(s => s.id === shipId ? {...s, status} : s);
  closeAllDropdowns();
  renderShipTable();
  renderKPIs();
  guardarDatos();
}
document.addEventListener('click', closeAllDropdowns);

// ── Receipt print modal ───────────────────────────────────────────────────────
function showReceiptModal(sid) {
  const s  = shipments.find(x=>x.id===sid);
  const cl = clients.find(c=>c.id===s.client_id);
  const pt = partners.find(p=>p.id===s.partner_id);

  // Build modal if not exists
  let m = document.getElementById('modal-print-receipt');
  if(!m){
    m = document.createElement('div');
    m.className = 'overlay'; m.id = 'modal-print-receipt';
    m.innerHTML = `
      <div class="modal print-modal">
        <div class="modal-head">
          <span class="modal-head-title">Resguardo de entrega</span>
          <button class="btn-icon" onclick="closePrintModal()">
            <svg viewBox="0 0 16 16"><path d="M3 3l10 10M13 3L3 13"/></svg>
          </button>
        </div>
        <div class="modal-body">
          <p style="font-size:12px;color:var(--text3);margin-bottom:14px;font-family:var(--mono)">
            Envío registrado correctamente. El resguardo está listo para entregar al cliente.
          </p>
          <div class="ticket-wrap">
            <img id="print-receipt-img" class="print-preview-img" alt="Generando…"/>
          </div>
          <div class="print-actions" style="margin-top:20px;display:flex;gap:12px;flex-wrap:wrap;align-items:center;justify-content:flex-end;padding-top:16px;border-top:1px solid #ebedf1;">
            <button onclick="closePrintModal()" style="display:inline-flex;align-items:center;justify-content:center;padding:8px 16px;border-radius:6px;font-size:13px;font-weight:500;border:1px solid #cbd5e1;background:#fff;color:#475569;cursor:pointer;">
                Cerrar
            </button>
            <a id="print-receipt-dl" download style="display:inline-flex;align-items:center;justify-content:center;padding:8px 16px;border-radius:6px;font-size:13px;font-weight:500;border:1px solid #cbd5e1;background:#f1f5f9;color:#0f172a;cursor:pointer;text-decoration:none;">
              <svg viewBox="0 0 16 16" style="width:15px;height:15px;flex-shrink:0;margin-right:6px;"><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M8 2v8M5 7l3 3 3-3M2 12v2h12v-2"/></svg>
              Descargar
            </a>
            <button onclick="printReceipt()" style="display:inline-flex;align-items:center;justify-content:center;padding:8px 16px;border-radius:6px;font-size:13px;font-weight:500;border:none;background:#2563eb;color:#fff;cursor:pointer;box-shadow:0 1px 2px rgba(37,99,235,.2);">
              <svg viewBox="0 0 16 16" style="width:15px;height:15px;flex-shrink:0;margin-right:6px;"><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M4 5V2h8v3M2 5h12a1 1 0 011 1v5a1 1 0 01-1 1h-2v3H4v-3H2a1 1 0 01-1-1V6a1 1 0 011-1z"/><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M4 11h8"/></svg>
              Imprimir
            </button>
          </div>
        </div>
      </div>`;
    document.body.appendChild(m);
  }

  m.classList.remove('hidden');
  // Show spinner while async render
  const imgEl = document.getElementById('print-receipt-img');
  imgEl.src = '';
  imgEl.style.minHeight = '300px';

  drawReceipt(s, cl, pt).then(img => {
    imgEl.src = img;
    imgEl.style.minHeight = '';
    document.getElementById('print-receipt-dl').href = img;
    document.getElementById('print-receipt-dl').download = 'resguardo-'+s.tracking+'.png';
    m._printSrc = img;
  });
}

// ── Barcode scanner (pistola) ─────────────────────────────────────────────────

function handleScannerKey(e) {
  if (e.key === 'Enter') {
    e.preventDefault();
    const raw = e.target.value.trim();
    e.target.value = '';
    processScan(raw);
  }
}

// Captura global: 4+ chars llegando en < 300 ms seguidos de Enter = pistola.
// Un humano no puede teclear 4 caracteres en menos de 300 ms.
(function () {
  let _buf = '', _t0 = 0, _timer = null;

  document.addEventListener('keydown', function (e) {
    // No interferir si Swal está abierto
    if (document.querySelector('.swal2-container')) return;
    // El #scanner-input ya tiene su propio handler
    if (document.activeElement && document.activeElement.id === 'scanner-input') return;
    // Solo chars imprimibles y Enter
    if (e.key !== 'Enter' && e.key.length !== 1) return;

    if (e.key === 'Enter') {
      clearTimeout(_timer);
      const buf = _buf;
      const elapsed = Date.now() - _t0;
      _buf = ''; _t0 = 0;
      // 4+ chars en menos de 300 ms → pistola seguro
      if (buf.length >= 4 && elapsed < 300) {
        processScan(buf);
      }
      return;
    }

    // Primer char: guardar timestamp de inicio
    if (_buf.length === 0) _t0 = Date.now();
    _buf += e.key;

    // Si pasan 400 ms sin Enter, limpiar (no era un escaneo)
    clearTimeout(_timer);
    _timer = setTimeout(function () { _buf = ''; _t0 = 0; }, 400);

  }, true); // capture:true → intercepta antes que cualquier input
}());


// ════════════════════════════════════════════════════════════════════════════
// MÓDULO ALMACÉN DE PALETS
// ════════════════════════════════════════════════════════════════════════════

let pallets = [];

let currentPalletDetailId = null;
let editPalletId = null;
let currentStorageFilter = 'Todos';

// ── Helpers ───────────────────────────────────────────────────────────────────
function palletCode() { return 'ALM-' + Math.random().toString(36).slice(2,8).toUpperCase(); }

function parseDateES(str) {
  if (!str) return null;
  if (str.includes('T')) return new Date(str); // Handle ISO strings
  const [d,m,y] = str.split(',')[0].trim().split('/').map(Number);
  return new Date(y, m-1, d);
}

function daysBetween(from, to) {
  const a = parseDateES(from);
  const b = to ? parseDateES(to) : new Date();
  if (!a) return 0;
  return Math.max(0, Math.ceil((b - a) / 86400000));
}

function locationText(p, short=false) {
  const zoneNames = {A:'Zona A',B:'Zona B',C:'Zona C',D:'Zona D',FRIO:'Cámara Fría',EXT:'Exterior'};
  if (short) return `${p.zone}-F${p.row}-P${p.pos}`;
  return `${zoneNames[p.zone]||p.zone} · Fila ${p.row} · Pos. ${p.pos}`;
}

function palletCost(p) {
  const days = daysBetween(p.entry, p.exit);
  return (days * p.qty * (p.rate||0)).toFixed(2);
}

// ── Render storage view ───────────────────────────────────────────────────────
function renderStorage() {
  // KPIs
  const active = pallets.filter(p=>p.status==='almacenado');
  const retired = pallets.filter(p=>p.status==='retirado');
  const totalPalets = active.reduce((s,p)=>s+p.qty,0);
  const revenue = pallets.reduce((s,p)=>s+parseFloat(palletCost(p)),0);
  document.getElementById('st-sub').textContent = `${active.length} registros activos`;
  document.getElementById('st-kpi-grid').innerHTML = [
    {label:'Bultos almacenados', val:totalPalets,     icon:'M1 2h14v4H1zM1 8h14v4H1zM4 4h1M4 10h1', color:'#7c3ae3'},
    {label:'Entradas activas',   val:active.length,   icon:'M8 2v12M2 8h12',                        color:'#10b981'},
    {label:'Entradas retiradas', val:retired.length,  icon:'M2 8l4 4 8-8',                          color:'#64748b'}
  ].map((w,i)=>`
    <div class="kpi-card-v3" style="animation-delay:${i*70}ms">
      <span class="kpi-accent-line" style="background:linear-gradient(90deg,${w.color},${w.color}99)"></span>
      <div class="kpi-body" style="display:flex;flex-direction:column;gap:10px;padding:16px 16px 14px">
        <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:8px">
          <p class="kpi-label-v3" style="margin:0;padding-top:2px">${w.label}</p>
          <div style="width:34px;height:34px;border-radius:10px;background:${w.color}18;display:flex;align-items:center;justify-content:center;flex-shrink:0">
            <svg viewBox="0 0 16 16" style="width:16px;height:16px;stroke:${w.color};fill:none;stroke-width:1.8"><path d="${w.icon}"/></svg>
          </div>
        </div>
        <div class="kpi-val" style="font-variant-numeric:tabular-nums;font-size:clamp(1.4rem,3vw,1.85rem)">${w.val}</div>
      </div>
    </div>`).join('');

  // Filter strip
  const filters = ['Todos','almacenado','retirado'];
  document.getElementById('st-filter-strip').innerHTML =
    filters.map(f=>`<button class="filter-chip${f===currentStorageFilter?' active':''}" onclick="setStorageFilter('${f}')">${f==='Todos'?'Todos':f.charAt(0).toUpperCase()+f.slice(1)+'s'}</button>`).join('');

  renderStorageTable();
}

function setStorageFilter(f) { currentStorageFilter = f; renderStorage(); }

function renderStorageTable() {
  const q = (document.getElementById('st-search')||{}).value?.toLowerCase()||'';
  let rows = pallets.filter(p => currentStorageFilter==='Todos' || p.status===currentStorageFilter);
  if(q) rows = rows.filter(p =>
    p.code.toLowerCase().includes(q) ||
    (clients.find(c=>c.id===p.client_id)?.name||'').toLowerCase().includes(q) ||
    (partners.find(c=>c.id===p.partner_id)?.company_name||'').toLowerCase().includes(q) ||
    locationText(p).toLowerCase().includes(q) ||
    p.contents.toLowerCase().includes(q)
  );
  document.getElementById('st-count').textContent = q ? `${rows.length} de ${pallets.length}` : `${pallets.length} registros`;

  const tb = document.getElementById('st-tbody');
  if(!rows.length){
    tb.innerHTML=`<tr><td colspan="8" style="text-align:center;padding:40px;color:var(--text3)">Sin resultados</td></tr>`;
    return;
  }
  tb.innerHTML = rows.map(p => {
    const isPaquete = p.type === 'Paquete';
    const clientName = clients.find(c=>c.id===p.client_id)?.name?.split(' ').slice(0,2).join(' ') || '-';
    const partnerName = p.partner_id ? (partners.find(c=>c.id===p.partner_id)?.company_name || '') : '—';
    
    // Chip de icono: palet vs paquete
    const typeBadge = isPaquete
      ? `<span class="st-type-chip st-type-paquete" title="Paquete"><i class="fa-solid fa-box"></i></span>`
      : `<span class="st-type-chip st-type-palet" title="Palet"><i class="fa-solid fa-pallet"></i></span>`;
      
    // Los paquetes guardan la fecha exacta de entrada, los palets solo el día.
    const entryDate = isPaquete && p.entry && p.entry.includes('T') ? new Date(p.entry).toLocaleString('es-ES') : p.entry;
    
    const days = daysBetween(p.entry, p.exit);
    const cost = palletCost(p);
    const isActive = p.status==='almacenado';
    const badge = isActive
      ? `<span style="display:inline-flex;align-items:center;gap:4px;padding:3px 9px;border-radius:4px;font-size:11px;font-weight:600;background:#f0fdf4;color:#14532d;border:1px solid #86efac;font-family:var(--mono)"><span style="width:5px;height:5px;border-radius:50%;background:#16a34a;display:inline-block"></span>Almacenado</span>`
      : `<span style="display:inline-flex;align-items:center;gap:4px;padding:3px 9px;border-radius:4px;font-size:11px;font-weight:600;background:#f0f1f5;color:#4b5263;border:1px solid #d0d4de;font-family:var(--mono)"><span style="width:5px;height:5px;border-radius:50%;background:#7c8494;display:inline-block"></span>Retirado</span>`;
    const ell = 'overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:0';
    return `
      <tr>
        <td style="${ell}" title="${p.code}">
          <div style="display:flex;align-items:center;gap:8px;min-width:0">
            ${typeBadge}
            <span style="font-family:var(--mono);font-size:11px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${p.code}</span>
          </div>
        </td>
        <td style="${ell}" title="${clientName}"><div style="font-weight:500;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${clientName}</div></td>
        <td style="${ell}" title="${partnerName}"><div style="font-size:11px;color:var(--text2);font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${partnerName}</div></td>
        <td style="font-family:var(--mono);font-size:12px;color:var(--accent);font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:0">${locationText(p, true)}</td>
        <td class="td-mono" style="text-align:center">${p.qty}</td>
        <td style="font-size:12px;color:var(--text2);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:0" title="${p.contents||''}">${p.contents||'—'}</td>
        <td class="td-mono" style="text-align:center;font-weight:600;color:${days>30?'var(--red)':days>14?'var(--amber)':'var(--text)'}">${days}d</td>
        <td>${badge}</td>
        <td style="text-align:center">
          <button class="btn-icon" onclick="openPalletDetail('${p.id}')" title="Ver detalle"><i class="fa-solid fa-eye"></i></button>
        </td>
      </tr>`;
  }).join('');
}

// ── Nueva entrada de palet ────────────────────────────────────────────────────
function openNewPallet(codigo = '', tipo = 'Palet') {
  editPalletId = null;
  document.getElementById('modal-pallet-title').textContent = 'Registrar entrada de almacén';
  
  const typeEl = document.getElementById('plt-type');
  if(typeEl) typeEl.value = tipo;
  
  const codeEl = document.getElementById('plt-code');
  if(codeEl) codeEl.value = codigo;

  // Reset client selection
  clearPltClientSelection();

  // Reset fields
  ['plt-row','plt-pos','plt-contents','plt-ref','plt-notes'].forEach(id=>{
    const el = document.getElementById(id);
    if(el) el.value='';
  });
  const qtyEl = document.getElementById('plt-qty');
  if(qtyEl) qtyEl.value = tipo === 'Paquete' ? '1' : '1';
  
  const partnerEl = document.getElementById('plt-partner');
  if(partnerEl) {
    partnerEl.innerHTML = '<option value="">Ninguna / Cliente Directo</option>' + partners.map(p => `<option value="${p.id}">${p.company_name}</option>`).join('');
    partnerEl.value = '';
  }
  
  const wEl = document.getElementById('plt-weight');
  if(wEl) wEl.value = '';
  
  const rEl = document.getElementById('plt-rate');
  if(rEl) rEl.value = '1.50';
  
  const zEl = document.getElementById('plt-zone');
  if(zEl) zEl.value = '';

  togglePalletFields();
  showView('new-pallet');
}

function togglePalletFields() {
  const typeEl = document.getElementById('plt-type');
  const isPaquete = typeEl && typeEl.value === 'Paquete';
  
  const sQtyCost = document.getElementById('section-plt-qty-cost');
  
  if (isPaquete) {
    const qty = document.getElementById('plt-qty');
    if(qty) qty.value = '1';
  }
}

// Pinta el timeline de almacenaje: Recibido → En almacén → Retirado
function renderPalletTimeline(status) {
  const isRetired = status === 'retirado';
  const states = isRetired ? ['is-done', 'is-done', 'is-active'] : ['is-done', 'is-active', 'is-future'];
  document.querySelectorAll('#plt-timeline .dt-tl-step').forEach((el, i) => {
    el.classList.remove('is-done', 'is-active', 'is-future');
    el.classList.add(states[i]);
  });
}

function openPalletDetail(id) {
  currentPalletDetailId = id;
  const p = pallets.find(x=>x.id===id);
  if(!p) return;
  const cl = clients.find(c=>c.id===p.client_id);
  
  document.getElementById('plt-dt-title').textContent = p.code;
  const badge = document.getElementById('plt-dt-badge');
  badge.textContent = p.status.toUpperCase();
  badge.style.background = p.status==='almacenado' ? 'rgba(56,189,248,.15)' : 'rgba(148,163,184,.15)';
  badge.style.color = p.status==='almacenado' ? '#0284c7' : '#64748b';
  
  document.getElementById('plt-loc-zone').textContent = p.zone || '—';
  document.getElementById('plt-loc-row').textContent  = p.row  || '—';
  document.getElementById('plt-loc-pos').textContent  = p.pos  || '—';
  renderPalletTimeline(p.status);
  
  const d1 = parseDateES(p.entry);
  const d2 = p.exit ? parseDateES(p.exit) : new Date();
  const diffTime = Math.abs((d2||new Date()) - (d1||new Date()));
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) || 1;
  document.getElementById('plt-dt-days').textContent = diffDays;
  
  const cost = diffDays * (p.rate || 1.50);
  document.getElementById('plt-dt-cost').textContent = cost.toFixed(2) + ' €';
  document.getElementById('plt-dt-rate').textContent = (p.rate || 1.50).toFixed(2) + ' €';
  
  // Formateador de fecha legible
  const fmtEntrada = (str) => {
    if (!str) return '—';
    const d = new Date(str);
    if (isNaN(d.getTime())) return str;
    return d.toLocaleDateString('es-ES', { day:'2-digit', month:'long', year:'numeric' }) +
           (str.includes('T') ? ' · ' + d.toLocaleTimeString('es-ES', { hour:'2-digit', minute:'2-digit' }) : '');
  };
  const partnerLabel = p.partner_id ? (partners.find(c=>c.id===p.partner_id)?.company_name || '—') : '—';
  const B = 'font-size:9.5px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:var(--text3);margin-bottom:5px';
  const V = 'font-size:14px;font-weight:700;color:var(--text);line-height:1.3;word-break:break-word';
  const tile = (label, value) => `<div style="background:var(--bg3);border:1px solid var(--border);border-radius:12px;padding:13px 16px"><div style="${B}">${label}</div><div style="${V}">${value}</div></div>`;

  document.getElementById('plt-dt-grid').innerHTML = `
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:13px">
      <svg viewBox="0 0 24 24" style="width:14px;height:14px;stroke:var(--accent);fill:none;stroke-width:2;flex-shrink:0"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
      <span style="font-size:11px;font-weight:700;color:var(--text2);text-transform:uppercase;letter-spacing:.9px">Datos del registro</span>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
      ${tile('Cliente',          cl ? cl.name : 'Desconocido')}
      ${tile('Colaboradora',     partnerLabel)}
      ${tile('Contenido',        p.contents || '—')}
      ${tile('Cantidad',         `${p.qty||1} bulto${(p.qty||1)>1?'s':''}`)}
      ${tile('Fecha de entrada', fmtEntrada(p.entry))}
      ${p.exit ? tile('Fecha de salida', fmtEntrada(p.exit)) : ''}
    </div>
  `;
  
  document.getElementById('plt-dt-retire-btn').style.display = p.status === 'almacenado' ? 'inline-flex' : 'none';
  showView('detail-pallet');

  // Genera el resguardo inline en el panel derecho
  drawPalletReceipt(p, cl).then(dataUrl => {
    const img = document.getElementById('pallet-receipt-img');
    const dl  = document.getElementById('pallet-receipt-download-link');
    if (img) img.src = dataUrl;
    if (dl)  { dl.href = dataUrl; dl.download = `Resguardo_${p.code || 'Almacen'}.png`; }
  });
}

function editPallet() {
  if (!currentPalletDetailId) return;
  const p = pallets.find(x=>x.id===currentPalletDetailId);
  if (!p) return;
  editPalletId = p.id;
  document.getElementById('modal-pallet-title').textContent = 'Editar entrada de bultos';
  
  if (p.client_id) {
    selectPltClient(p.client_id);
  } else {
    clearPltClientSelection();
  }
  
  document.getElementById('plt-zone').value = p.zone || '';
  document.getElementById('plt-row').value = p.row || '';
  document.getElementById('plt-pos').value = p.pos || '';
  document.getElementById('plt-qty').value = p.qty || '1';
  document.getElementById('plt-rate').value = p.rate || '1.50';
  document.getElementById('plt-contents').value = p.contents || '';
  
  const partnerEl = document.getElementById('plt-partner');
  if(partnerEl) {
    partnerEl.innerHTML = '<option value="">Ninguna / Cliente Directo</option>' + partners.map(x => `<option value="${x.id}">${x.company_name}</option>`).join('');
    partnerEl.value = p.partner_id || '';
  }
  
  showView('new-pallet');
}

function deletePallet() {
  if (!currentPalletDetailId) return;
  Swal.fire({
    title: '¿Eliminar entrada?',
    text: 'Esta acción no se puede deshacer.',
    icon: 'warning',
    showCancelButton: true,
    confirmButtonColor: '#ef4444',
    cancelButtonColor: '#64748b',
    confirmButtonText: 'Sí, eliminar',
    cancelButtonText: 'Cancelar'
  }).then((result) => {
    if (result.isConfirmed) {
      pallets = pallets.filter(p => p.id !== currentPalletDetailId);
      showView('storage');
      updateBadges();
      renderStorage();
      guardarDatos();
      showScanToast('Entrada eliminada correctamente', 'ok');
    }
  });
}

function savePallet() {
  const type     = document.getElementById('plt-type').value; // 'Palet' | 'Paquete'
  let code       = document.getElementById('plt-code').value.trim().toUpperCase();
  const clientId = document.getElementById('plt-client').value;
  const partnerId= document.getElementById('plt-partner') ? document.getElementById('plt-partner').value : '';
  const zone     = document.getElementById('plt-zone').value;
  const row      = document.getElementById('plt-row').value.trim().padStart(2,'0');
  const pos      = document.getElementById('plt-pos').value.trim().padStart(2,'0');
  const qty      = parseInt(document.getElementById('plt-qty').value)||1;
  const contents = document.getElementById('plt-contents').value.trim();
  const rate     = parseFloat(document.getElementById('plt-rate').value)||1.50;

  if(!zone||!row||!pos) {
    alert('Completa la ubicación (Zona, Fila, Posición).');
    return;
  }
  
  if (!clientId) {
    alert('Debes seleccionar el responsable (Empresa o Particular).');
    return;
  }

  if (type === 'Paquete') {
    if (!code) { alert('El código de etiqueta es obligatorio para paquetes.'); return; }
  } else {
    if (!contents) { alert('Debes rellenar el contenido/descripción.'); return; }
  }
  
  if (!code) code = palletCode();
  
  let isEditing = !!editPalletId;
  
  if (isEditing) {
    pallets = pallets.map(p => p.id === editPalletId ? {...p, type, code, client_id: clientId, partner_id: partnerId || null, zone, row, pos, qty, contents, rate} : p);
  } else {
    const existing = pallets.find(p => p.code === code);
    if (existing && type === 'Paquete') {
        alert('Ese código ya está registrado en el almacén.');
        return;
    }

    const pallet = {
      id: genId(), code, type, status: 'almacenado',
      client_id: clientId,
      partner_id: partnerId || null,
      zone, row, pos,
      qty,
      contents,
      rate,
      entry: type === 'Paquete' ? new Date().toISOString() : gDate(0), 
      exit: null
    };
    pallets = [pallet, ...pallets];
    currentPalletDetailId = pallet.id;
  }
  
  showView('storage');
  updateBadges();
  renderStorage();
  guardarDatos();
  showScanToast('Entrada guardada', 'ok');
  
  if (!isEditing) {
    setTimeout(() => printPalletReceipt(), 300);
  } else {
    openPalletDetail(editPalletId);
  }
}


function retirePallet() {
  if(!currentPalletDetailId) return;
  Swal.fire({
    title: '¿Retirar bultos?',
    text: 'Se registrará hoy como fecha de salida.',
    icon: 'question',
    showCancelButton: true,
    confirmButtonColor: '#10b981',
    cancelButtonColor: '#64748b',
    confirmButtonText: 'Sí, retirar',
    cancelButtonText: 'Cancelar'
  }).then((result) => {
    if (result.isConfirmed) {
      pallets = pallets.map(p=>p.id===currentPalletDetailId ? {...p, status:'retirado', exit:gDate(0)} : p);
      showView('storage');
      updateBadges();
      renderStorage();
      guardarDatos();
      setTimeout(()=>{ openPalletDetail(currentPalletDetailId); }, 100);
      showScanToast('Bultos retirados', 'ok');
    }
  });
}

function changePalletLocation() {
  const p = pallets.find(x=>x.id===currentPalletDetailId);
  if(!p) return;
  document.getElementById('rel-zone').value = p.zone||'';
  document.getElementById('rel-row').value = p.row||'';
  document.getElementById('rel-pos').value = p.pos||'';
  showView('storage');
  document.getElementById('modal-relocate').classList.remove('hidden');
}

function saveRelocation() {
  const zone = document.getElementById('rel-zone').value;
  const row  = document.getElementById('rel-row').value.trim().padStart(2,'0');
  const pos  = document.getElementById('rel-pos').value.trim().padStart(2,'0');
  if(!zone||!row||!pos){ alert('Completa todos los campos de ubicación.'); return; }
  pallets = pallets.map(p=>p.id===currentPalletDetailId ? {...p, zone, row, pos} : p);
  closeModal('modal-relocate');
  guardarDatos();
  openPalletDetail(currentPalletDetailId);
  renderStorageTable();
  showScanToast('Ubicación actualizada correctamente', 'ok');
}



function printPalletReceipt() {
  if(!currentPalletDetailId) return;
  const p = pallets.find(x=>x.id===currentPalletDetailId);
  if(!p) return;
  const cl = clients.find(c=>c.id===p.client_id);
  drawPalletReceipt(p, cl).then(dataUrl => {
    const img = document.getElementById('pallet-receipt-img');
    const dl  = document.getElementById('pallet-receipt-download-link');
    if(img) img.src = dataUrl;
    if(dl)  { dl.href = dataUrl; dl.download = `Resguardo_${p.code || 'Almacen'}.png`; }
    showView('pallet-receipt');
  });
}

function doPrintPalletReceipt() {
  const img = document.getElementById('pallet-receipt-img');
  if(!img) return;
  const w = window.open('', '_blank');
  w.document.write('<html><head><style>@page { margin: 0; size: 58mm auto; } body { margin: 0; padding: 0; background: #fff; } img { display: block; margin: 0 auto; width: 58mm; height: auto; page-break-inside: avoid; }</style></head><body>');
  w.document.write('<img src="' + img.src + '">');
  w.document.write('</body></html>');
  w.document.close();
  setTimeout(() => { w.focus(); w.print(); w.close(); }, 300);
}

function drawPalletReceipt(p, cl) {
  // Mismo sistema que drawReceipt — thermal 58mm @ DPR=4 para alta resolución
  const W = 384;
  const MARGIN = 16;
  const TW = W - MARGIN * 2;
  const FONT = "Inter, ui-monospace, 'SF Mono', Menlo, monospace";
  const SANS = "Inter, -apple-system, 'Helvetica Neue', sans-serif";

  const BW = TW, BH = 48;
  const bcDataUrl = generateBarcodeDataURL(p.code.replace(/-/g,''), BW, BH);
  const bcImg = new Image(); bcImg.src = bcDataUrl;
  const logoImg = new Image(); logoImg.src = 'logo-myl.png';

  function buildContent(c, finalH) {
    c.fillStyle = '#FFFFFF';
    c.fillRect(0, 0, W, finalH || 9999);
    let y = MARGIN;

    // ── Header: logo
    c.textAlign = 'center';
    if (logoImg.complete && logoImg.width > 0) {
      const lgH = 40;
      const lgW = logoImg.width * (lgH / Math.max(1, logoImg.height));
      c.drawImage(logoImg, (W - lgW)/2, y, lgW, lgH);
      y += lgH + 8;
    } else {
      c.fillStyle = '#000'; c.font = `700 17px ${SANS}`;
      c.fillText('MYL EXPRESS', W/2, y + 14); y += 22;
    }
    c.font = `400 10px ${FONT}`; c.fillStyle = '#555';
    c.fillText('RESGUARDO DE ALMACENAJE', W/2, y + 10); y += 16;
    c.textAlign = 'left';

    function dashedLine() {
      c.fillStyle = '#AAAAAA'; c.font = `400 9px ${FONT}`;
      c.textAlign = 'center';
      c.fillText('· · · · · · · · · · · · · · · · · · · · · · · · · · · ·', W/2, y + 7);
      c.textAlign = 'left'; y += 14;
    }

    function field(label, value) {
      const val = String(value || '—');
      c.font = `600 9px ${SANS}`; c.fillStyle = '#666';
      c.fillText(label.toUpperCase(), MARGIN, y + 9);
      c.font = `500 11px ${FONT}`; c.fillStyle = '#000';
      const words = val.split(' ');
      let line = '', lines = [];
      for (const w of words) {
        const test = line ? line + ' ' + w : w;
        if (c.measureText(test).width > TW) { lines.push(line); line = w; }
        else line = test;
      }
      lines.push(line);
      if (lines.length === 1 && c.measureText(val).width < TW * 0.65) {
        c.textAlign = 'right'; c.fillText(val, W - MARGIN, y + 9); c.textAlign = 'left'; y += 18;
      } else {
        y += 12; lines.forEach(l => { c.fillText(l, MARGIN + 4, y + 9); y += 14; });
      }
      c.strokeStyle = '#E8E8E8'; c.lineWidth = 0.5;
      c.beginPath(); c.moveTo(MARGIN, y + 2); c.lineTo(W - MARGIN, y + 2); c.stroke();
      y += 7;
    }

    dashedLine();

    // Código ALM grande
    c.fillStyle = '#000'; c.font = `700 18px ${FONT}`;
    c.textAlign = 'center';
    c.fillText(p.code, W/2, y + 16); y += 28;
    c.textAlign = 'left';
    dashedLine();

    // Datos del palet
    field('Cliente',       cl ? cl.name : '—');
    field('Entrada',       p.entry);
    field('Ubicación',     `ZONA ${p.zone} · PAS ${p.row} · HUECO ${p.pos}`);
    field('Contenido',     `${p.qty}x ${p.contents}`);
    field('Tarifa Asignada', `${Number(p.rate||1.5).toFixed(2)} €/día`);
    if (p.notes) field('Notas', p.notes);
    dashedLine();

    // Código de barras
    try { c.drawImage(bcImg, MARGIN, y, BW, BH); } catch(e) {
      c.fillStyle = '#EEE'; c.fillRect(MARGIN, y, BW, BH);
    }
    y += BH + 6;
    c.font = `500 10px ${FONT}`; c.fillStyle = '#000';
    c.textAlign = 'center';
    c.fillText(p.code, W/2, y + 9); y += 18;
    c.textAlign = 'left';
    dashedLine();

    // Footer
    c.font = `400 9px ${FONT}`; c.fillStyle = '#888';
    c.textAlign = 'center';
    c.fillText(new Date().toLocaleString('es-ES'), W/2, y + 9); y += 14;
    c.fillText('Myl Express Logística S.L.', W/2, y + 9); y += 14;
    c.fillText('Conserve este resguardo', W/2, y + 9); y += 20;
    c.textAlign = 'left';
    return y;
  }

  // Two-pass: measure → render con hiCanvas (DPR=4)
  return new Promise(resolve => {
    let loaded = 0;
    const check = () => { if(++loaded === 2) render(); };
    bcImg.onload = check; logoImg.onload = check;
    bcImg.onerror = check; logoImg.onerror = check;
    if (bcImg.complete) check();
    if (logoImg.complete) check();

    function render() {
      const tempCv = document.createElement('canvas');
      tempCv.width = W; tempCv.height = 2400;
      const totalH = buildContent(tempCv.getContext('2d'), 2400) + MARGIN;
      const {cv, ctx} = hiCanvas(W, totalH);
      buildContent(ctx, totalH);
      resolve(cv.toDataURL('image/png'));
    }
  });
}


function processScan(raw) {
    if (!raw) return;
    const txt = raw.toUpperCase().trim();
    if (txt.length < 2) return;

    // Feedback visual inmediato para asegurar que se ha detectado el escaneo
    showScanToast('CÓDIGO: ' + txt, 'info');

    // Asegurar que la sección logística está visible antes de abrir cualquier modal
    function _ir(subview) {
        if (typeof navegarLogistica === 'function') navegarLogistica(subview, null);
        else if (typeof showView === 'function') showView(subview);
    }

    // 1. Encontrado en envíos → mostrar detalle
    const shipment = shipments.find(s =>
        s.tracking.replace(/-/g, '').toUpperCase() === txt ||
        s.tracking.toUpperCase() === txt
    );
    if (shipment) {
        _ir('shipments');
        setTimeout(() => openDetail(shipment.id), 300);
        return;
    }

    // 2. Encontrado en palets → mostrar detalle
    const pallet = pallets.find(p =>
        p.code.replace(/-/g, '').toUpperCase() === txt ||
        p.code.toUpperCase() === txt
    );
    if (pallet) {
        _ir('storage');
        setTimeout(() => openPalletDetail(pallet.id), 300);
        return;
    }

    // 3. No encontrado → abrir formulario de entrada de almacén directamente
    _ir('storage');
    setTimeout(() => openNewPallet(txt, 'Paquete'), 300);
}

function showScanToast(msg, type) {
    let title = '¡Añadido!';
    let icon = 'success';
    
    if (msg.toLowerCase().includes('eliminad')) {
        title = '¡Eliminado!';
    } else if (msg.toLowerCase().includes('error')) {
        title = 'Error';
        icon = 'error';
    } else if (type === 'info') {
        title = 'Escáner Detectado';
        icon = 'info';
    }

    Swal.fire({
        title: title,
        text: msg,
        icon: icon,
        timer: 1500,
        showConfirmButton: false,
        confirmButtonColor: '#7c3ae3'
    });
}

function closePrintModal() {
    const el = document.getElementById('modal-print-receipt');
    if(el) el.classList.add('hidden');
}

function printReceipt() {
    printDoc('print-receipt-img', 'receipt');
}

function printLabel() {
    printDoc('label-img', 'label');
}

function printDoc(imgId, format) {
    const img = document.getElementById(imgId);
    if(!img || !img.src) return;
    const w = window.open('', '_blank');
    let pageStyle, imgStyle;
    if (format === 'label') {
      // Portrait label: 8.2cm x 14.5cm (Zebra ZT230 200 DPI)
      pageStyle = `@page { margin: 0; size: 8.2cm 14.5cm; }`;
      imgStyle  = `display:block;margin:0 auto;width:8.2cm;height:14.5cm;object-fit:fill;page-break-inside:avoid;`;
    } else {
      // Receipt / ticket: 58mm thermal-style
      pageStyle = `@page { margin: 0; size: 58mm auto; }`;
      imgStyle  = `display:block;margin:0 auto;width:58mm;height:auto;page-break-inside:avoid;`;
    }
    w.document.write(`<html><head><style>
      ${pageStyle}
      body { margin:0; padding:0; background:#fff; }
      img { ${imgStyle} }
    </style></head><body>`);
    w.document.write('<img src="' + img.src + '">');
    w.document.write('</body></html>');
    w.document.close();
    setTimeout(() => { w.focus(); w.print(); w.close(); closePrintModal(); }, 400);
}

function renderCurrentViewLI() {
    const id = document.getElementById('li-main')?.dataset?.view || 'shipments';
    if(id.includes('shipments')) { if(typeof renderShipments==='function') renderShipments(); }
    else if(id.includes('storage')) { if(typeof renderStorage==='function') renderStorage(); }
    else if(id.includes('clients')) { if(typeof renderClients==='function') renderClients(); }
    else if(id.includes('partners')) { if(typeof renderPartners==='function') renderPartners(); }
    if(typeof updateBadges === 'function') updateBadges();
}

let scanBuffer = '';
let scanTimeout = null;

// True: fase de captura para asegurar que recibimos el evento antes de cualquier stopPropagation
window.addEventListener('keydown', function(e) {
    if(e.key === 'F9') {
        const p = prompt('Simular Escaneo BD:');
        if(p) processScan(p);
        return;
    }

    const isInput = ['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName);
    const isTrap = e.target.id === 'scanner-trap';

    if (e.key === 'Enter') {
        if (scanBuffer.length >= 3) {
            e.preventDefault();
            e.stopPropagation();
            const scannedCode = scanBuffer;
            scanBuffer = '';
            clearTimeout(scanTimeout);
            processScan(scannedCode);
        } else {
            scanBuffer = '';
        }
        return;
    }

    if (e.key.length === 1) {
        if (isInput && !isTrap) {
            scanBuffer = '';
            return;
        }
        scanBuffer += e.key;
        clearTimeout(scanTimeout);
        // Tolerancia altísima de 400ms por si el escáner es muy lento y para forzar el procesado si no hay Enter
        scanTimeout = setTimeout(() => {
            if (scanBuffer.length >= 4) {
                const scannedCode = scanBuffer;
                scanBuffer = '';
                processScan(scannedCode);
            } else {
                scanBuffer = '';
            }
        }, 400);
    }
}, true);

document.addEventListener('click', function(e) {
    const isInputOrBtn = ['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON'].includes(e.target.tagName) || e.target.closest('button') || e.target.closest('a');
    if (!isInputOrBtn) {
        const trap = document.getElementById('scanner-trap');
        if (trap) {
            trap.focus({ preventScroll: true });
        }
    }
});
