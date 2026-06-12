const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const os = require('os');
const http = require('http');
const { Server } = require('socket.io');
const { abrirEImportar } = require('./db_sqlite');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });
const PORT = 3000;

app.use(express.json({ limit: '50mb' }));
app.use(express.static('public', { etag: false, maxAge: 0, setHeaders: (res) => { res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate'); } })); // Sirve la interfaz gráfica sin caché

// Rutas de almacenamiento
const dataFile = path.join(__dirname, 'base_de_datos.json'); // Espejo JSON (red de seguridad + compatibilidad backups)
const sqliteFile = path.join(__dirname, 'datos.sqlite');      // Base de datos principal (SQLite)
const backupDir = path.join(__dirname, 'copias_seguridad');

// ─── ALMACENAMIENTO SQLITE ───────────────────────────────────────────────────
// La fuente de verdad pasa a ser SQLite (transaccional y duradero). En el primer
// arranque, si SQLite está vacío y existe base_de_datos.json, se migran los datos
// automáticamente. La estructura en memoria `dbData` no cambia, así que ni la API
// ni el frontend se ven afectados.
const { almacen, dbData: dbCargada, migrado } = abrirEImportar(sqliteFile, dataFile);
let dbData = dbCargada;
if (migrado) {
    console.log('[Sistema] Datos migrados a SQLite. El fichero base_de_datos.json se conserva como copia de seguridad.');
}

// Asegurar usuarios por defecto (misma lógica de seguridad que antes)
if (dbData.usuarios.length === 0) {
    dbData.usuarios.push({
        id: crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(),
        username: 'admin',
        password: hashPassword('admin'),
        rol: 'admin',
        creado: new Date().toISOString()
    });
    console.log('[Sistema] Usuario admin por defecto creado.');
}
if (!dbData.usuarios.some(u => u.rol === 'superadmin')) {
    dbData.usuarios.push({
        id: crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(),
        username: 'superadmin',
        password: hashPassword('superadmin123'),
        rol: 'superadmin',
        creado: new Date().toISOString()
    });
    console.log('[Sistema] Usuario superadmin creado automáticamente.');
}

if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir);
}

// Helper: persistir dbData. Escribe en SQLite (principal, transaccional) y mantiene
// un espejo atómico en base_de_datos.json (red de seguridad y compatibilidad con el
// sistema de copias de seguridad existente).
function guardarDB() {
    almacen.guardarTodo(dbData);
    try {
        const tmpFile = dataFile + '.tmp';
        fs.writeFileSync(tmpFile, JSON.stringify(dbData, null, 2));
        fs.renameSync(tmpFile, dataFile); // Operación atómica: reemplaza solo si se escribió bien
    } catch (e) {
        console.error('[Espejo JSON] No se pudo actualizar base_de_datos.json:', e.message);
    }
}

// Asegurar que el estado inicial queda persistido (p. ej. usuarios por defecto recién creados)
guardarDB();

// Memory Tokens
// token -> { username, expiresAt }
// Los tokens expiran a los 12h en el servidor (defensa en profundidad).
// El cliente los invalida antes via /api/logout al cerrar sesión o por inactividad.
const SESSION_TTL_MS = 12 * 60 * 60 * 1000; // 12 horas
const activeTokens = new Map();

// Limpieza periódica de tokens expirados (cada 30 min)
setInterval(() => {
    const now = Date.now();
    for (const [tkn, data] of activeTokens) {
        if (now > data.expiresAt) activeTokens.delete(tkn);
    }
}, 30 * 60 * 1000);

// Versión de los datos (clientes+facturas) para detección de conflictos de guardado.
// Cambia en cada guardado/restauración; permite avisar si alguien guarda sobre datos viejos.
let datosVersion = Date.now();

// ─── HASH DE CONTRASEÑAS (scrypt, integrado en Node, sin dependencias nuevas) ───
// Formato almacenado: "scrypt$<saltHex>$<hashHex>". Las contraseñas antiguas en texto
// plano se detectan por la ausencia de ese prefijo y se migran automáticamente al
// iniciar sesión correctamente (migración perezosa, transparente para el usuario).
function hashPassword(plain) {
    const salt = crypto.randomBytes(16);
    const derived = crypto.scryptSync(String(plain), salt, 64);
    return `scrypt$${salt.toString('hex')}$${derived.toString('hex')}`;
}
function esHash(stored) {
    return typeof stored === 'string' && stored.startsWith('scrypt$');
}
function verifyPassword(plain, stored) {
    if (!esHash(stored)) {
        // Legado en texto plano: comparación directa (se migrará tras un login correcto)
        return String(plain) === String(stored);
    }
    try {
        const [, saltHex, hashHex] = stored.split('$');
        const salt = Buffer.from(saltHex, 'hex');
        const guardado = Buffer.from(hashHex, 'hex');
        const derived = crypto.scryptSync(String(plain), salt, 64);
        return derived.length === guardado.length && crypto.timingSafeEqual(derived, guardado);
    } catch (e) {
        return false;
    }
}

// Middleware Autenticación
function requireAuth(req, res, next) {
    const authHeader = req.headers.authorization;
    let token = null;
    if (authHeader && authHeader.startsWith('Bearer ')) {
        token = authHeader.split(' ')[1];
    } else if (req.query.token) {
        token = req.query.token;
    }

    if (!token || !activeTokens.has(token)) {
        return res.status(401).json({ success: false, error: 'No autorizado. Inicie sesión.' });
    }
    const session = activeTokens.get(token);
    if (Date.now() > session.expiresAt) {
        activeTokens.delete(token);
        return res.status(401).json({ success: false, error: 'Sesión expirada. Inicie sesión de nuevo.' });
    }
    req.usuarioLogueado = session.username;
    next();
}

// Middleware Admin Only (admin y superadmin tienen acceso)
function requireAdmin(req, res, next) {
    // Usar dbData en memoria (siempre actualizada)
    const user = dbData.usuarios.find(u => u.username === req.usuarioLogueado);
    if (!user || (user.rol !== 'admin' && user.rol !== 'superadmin')) {
        return res.status(403).json({ success: false, error: 'Acceso denegado. Se requiere nivel de Administrador.' });
    }
    next();
}

// Middleware Superadmin Only (solo superadmin)
function requireSuperAdmin(req, res, next) {
    const user = dbData.usuarios.find(u => u.username === req.usuarioLogueado);
    if (!user || user.rol !== 'superadmin') {
        return res.status(403).json({ success: false, error: 'Acceso denegado. El módulo de Logística requiere acceso de SuperAdmin.' });
    }
    next();
}

// Logger de Eventos (usa memoria, no relee disco)
function registrarEvento(usuario, accion, info) {
    const fecha = new Date().toISOString();
    const evt = { id: Date.now(), fecha, usuario, accion, info };
    if (!dbData.eventos) dbData.eventos = [];
    dbData.eventos.push(evt);
    if (dbData.eventos.length > 1000) dbData.eventos.shift();
    guardarDB();
    console.log(`[EVENTO] ${usuario} - ${accion}: ${info}`);
}

// --- ENDPOINTS DE AUTENTICACIÓN Y USUARIOS ---

app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    const user = dbData.usuarios.find(u => u.username === username);

    if (user && verifyPassword(password, user.password)) {
        // Migración perezosa: si la contraseña estaba en texto plano, hashearla ahora
        if (!esHash(user.password)) {
            user.password = hashPassword(password);
            guardarDB();
            console.log(`[Seguridad] Contraseña de "${user.username}" migrada a hash scrypt.`);
        }
        const token = crypto.randomBytes(16).toString('hex');
        activeTokens.set(token, { username: user.username, expiresAt: Date.now() + SESSION_TTL_MS });
        registrarEvento(user.username, 'LOGIN', 'Inicio de sesión exitoso');
        res.json({
            success: true, token, rol: user.rol, username: user.username,
            foto: user.foto || null,
            mustChangePassword: user.must_change_password === true
        });
    } else {
        res.status(401).json({ success: false, error: 'Credenciales inválidas' });
    }
});

app.post('/api/logout', requireAuth, (req, res) => {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
        const tkn = authHeader.split(' ')[1];
        activeTokens.delete(tkn);
    }
    registrarEvento(req.usuarioLogueado, 'LOGOUT', 'Sesión terminada voluntariamente');
    res.json({ success: true });
});

app.put('/api/perfil', requireAuth, (req, res) => {
    const { password, currentPassword, foto } = req.body;
    const userIndex = dbData.usuarios.findIndex(u => u.username === req.usuarioLogueado);

    if (userIndex === -1) return res.status(404).json({ success: false, error: 'Usuario no encontrado' });

    // Si se quiere cambiar contraseña, verificar la actual
    if (password) {
        if (!currentPassword) {
            return res.status(400).json({ success: false, error: 'Debes introducir tu contraseña actual para cambiarla.' });
        }
        if (!verifyPassword(currentPassword, dbData.usuarios[userIndex].password)) {
            return res.status(401).json({ success: false, error: 'La contraseña actual no es correcta.' });
        }
        const p = String(password);
        if (p.length < 10)              return res.status(400).json({ success: false, error: 'La contraseña debe tener al menos 10 caracteres.' });
        if (!/[A-Z]/.test(p))           return res.status(400).json({ success: false, error: 'La contraseña debe incluir al menos una mayúscula (A–Z).' });
        if (!/[a-z]/.test(p))           return res.status(400).json({ success: false, error: 'La contraseña debe incluir al menos una minúscula (a–z).' });
        if (!/[0-9]/.test(p))           return res.status(400).json({ success: false, error: 'La contraseña debe incluir al menos un número (0–9).' });
        if (!/[^a-zA-Z0-9]/.test(p))    return res.status(400).json({ success: false, error: 'La contraseña debe incluir al menos un carácter especial (!@#$%…).' });
        dbData.usuarios[userIndex].password = hashPassword(password);
        dbData.usuarios[userIndex].must_change_password = false; // primer login completado
    }

    if (foto !== undefined) dbData.usuarios[userIndex].foto = foto;

    guardarDB();
    registrarEvento(req.usuarioLogueado, 'PROFILE_UPDATE', 'Actualización de perfil / contraseña');
    res.json({ success: true, foto: dbData.usuarios[userIndex].foto, mustChangePassword: false });
});

app.get('/api/usuarios', requireAuth, requireAdmin, (req, res) => {
    // La contraseña ya NO se expone (ahora está hasheada). Se indica solo si está protegida.
    const cleanUsers = dbData.usuarios.map(u => ({ id: u.id, username: u.username, protegida: esHash(u.password), foto: u.foto, rol: u.rol, creado: u.creado }));
    res.json(cleanUsers);
});

// Restablecer la contraseña de un usuario (solo admin/superadmin). No revela la anterior.
app.put('/api/usuarios/:username/password', requireAuth, requireAdmin, (req, res) => {
    const { password } = req.body;
    if (!password || !String(password).trim()) {
        return res.status(400).json({ success: false, error: 'La nueva contraseña no puede estar vacía' });
    }
    const idx = dbData.usuarios.findIndex(u => u.username.trim() === req.params.username.trim());
    if (idx === -1) {
        return res.status(404).json({ success: false, error: 'Usuario no encontrado' });
    }
    dbData.usuarios[idx].password = hashPassword(password);
    guardarDB();
    registrarEvento(req.usuarioLogueado, 'PASSWORD_RESET', `Contraseña restablecida para ${dbData.usuarios[idx].username.trim()}`);
    res.json({ success: true });
});

app.post('/api/usuarios', requireAuth, requireAdmin, (req, res) => {
    const { username: rawUsername, password, rol } = req.body;
    const username = (rawUsername || '').trim();
    if (!username) {
        return res.status(400).json({ success: false, error: 'El nombre de usuario no puede estar vacío' });
    }
    // Comparar sin espacios para evitar duplicados como "masiel" y "masiel "
    if (dbData.usuarios.find(u => u.username.trim().toLowerCase() === username.toLowerCase())) {
        return res.status(400).json({ success: false, error: 'Ya existe un usuario con ese nombre' });
    }
    dbData.usuarios.push({
        id: Date.now().toString(),
        username,
        password: hashPassword(password),
        rol: rol || 'user',
        creado: new Date().toISOString(),
        must_change_password: true   // fuerza cambio en primer login
    });
    guardarDB();
    registrarEvento(req.usuarioLogueado, 'USER_CREATE', `Usuario creado: ${username} (${rol})`);
    res.json({ success: true });
});

app.delete('/api/usuarios/:username', requireAuth, requireAdmin, (req, res) => {
    const username = req.params.username;
    if (username === 'admin') return res.status(400).json({ success: false, error: 'El admin por defecto no puede borrarse' });
    if (username === req.usuarioLogueado) return res.status(400).json({ success: false, error: 'No puedes borrarte a ti mismo' });
    
    // Buscar ignorando espacios sobrantes (ej: "masiel " == "masiel")
    const idx = dbData.usuarios.findIndex(u => u.username.trim() === username.trim());
    if (idx !== -1) {
        const nombreReal = dbData.usuarios[idx].username;
        dbData.usuarios.splice(idx, 1);
        guardarDB();
        registrarEvento(req.usuarioLogueado, 'USER_DELETE', `Usuario borrado: ${nombreReal.trim()}`);
        res.json({ success: true });
    } else {
        res.status(404).json({ success: false, error: 'Usuario no encontrado' });
    }
});

app.get('/api/eventos', requireAuth, requireAdmin, (req, res) => {
    const reversed = [...(dbData.eventos || [])].reverse();
    res.json(reversed);
});

// Enviar datos a la interfaz (desde memoria, sin leer disco)
app.get('/api/datos', requireAuth, (req, res) => {
    res.json({ clientes: dbData.clientes, facturas: dbData.facturas, version: datosVersion });
});

// Guardar nuevos datos desde la interfaz
app.post('/api/datos', requireAuth, (req, res) => {
    const clientesEntrantes = req.body.clientes;
    const facturasEntrantes = req.body.facturas;

    // ─── PROTECCIÓN CRÍTICA ANTI-BORRADO ACCIDENTAL ───────────────────────────
    // Rechazar si los datos no son arrays válidos
    if (!Array.isArray(clientesEntrantes) || !Array.isArray(facturasEntrantes)) {
        return res.status(400).json({ success: false, error: 'Formato de datos inválido.' });
    }

    // Rechazar si el cliente intenta enviar datos vacíos cuando el servidor ya tiene datos
    // Esto ocurre cuando la página se recarga antes de que se carguen los datos del servidor
    const hayDatosEnServidor = dbData.clientes.length > 0 || dbData.facturas.length > 0;
    const clienteEnviaVacio = clientesEntrantes.length === 0 && facturasEntrantes.length === 0;
    
    if (hayDatosEnServidor && clienteEnviaVacio) {
        console.warn(`[SEGURIDAD] ${req.usuarioLogueado} intentó guardar datos vacíos cuando el servidor tiene ${dbData.clientes.length} clientes y ${dbData.facturas.length} facturas. Operación RECHAZADA.`);
        return res.status(409).json({ 
            success: false, 
            error: 'Operación rechazada: se intentó sobreescribir la base de datos con datos vacíos. Recarga la página para sincronizar.' 
        });
    }

    // Protección adicional: no permitir pérdida masiva de datos sin confirmación explícita
    // Si la petición borraría más del 50% de los datos existentes, registrar advertencia
    const perdidaClientes = dbData.clientes.length > 0 && clientesEntrantes.length < dbData.clientes.length * 0.5;
    const perdidaFacturas = dbData.facturas.length > 1 && facturasEntrantes.length < dbData.facturas.length * 0.5;
    if (perdidaClientes || perdidaFacturas) {
        console.warn(`[ADVERTENCIA] ${req.usuarioLogueado} está guardando una reducción masiva de datos. Clientes: ${dbData.clientes.length}→${clientesEntrantes.length}, Facturas: ${dbData.facturas.length}→${facturasEntrantes.length}`);
        // Crear backup de emergencia antes de ejecutar
        try {
            const fecha = new Date().toISOString().replace(/[:.]/g, '-');
            fs.writeFileSync(path.join(backupDir, `backup_emergencia_${fecha}.json`), JSON.stringify(dbData, null, 2));
            console.log(`[BACKUP EMERGENCIA] Copia de seguridad automática creada.`);
        } catch(e) { console.error('Error creando backup de emergencia:', e.message); }
    }
    // ─────────────────────────────────────────────────────────────────────────

    // Control de concurrencia ligero: si el cliente envía la versión sobre la que
    // cargó los datos y ya no coincide con la del servidor, otro usuario guardó antes.
    // Se rechaza para que el frontend recargue y no pise los cambios del otro.
    const baseVersion = req.body.baseVersion;
    if (baseVersion !== undefined && baseVersion !== null && baseVersion !== datosVersion) {
        console.warn(`[CONCURRENCIA] ${req.usuarioLogueado} intentó guardar sobre datos desactualizados (envió v${baseVersion}, actual v${datosVersion}).`);
        return res.status(409).json({
            success: false,
            conflicto: true,
            version: datosVersion,
            error: 'Otro usuario guardó cambios mientras editabas. Se recargarán los datos para no perder su trabajo; revisa y vuelve a guardar.'
        });
    }

    const prevFacLength = dbData.facturas.length;
    dbData.clientes = clientesEntrantes;

    // ─── HASH CHAINING (Fase 1 — Normativa SIF, Ley 11/2021 / RD 1007/2023) ──
    // Procesar facturas en orden de ID para encadenar hashes correctamente.
    // Solo se asigna hash a facturas nuevas (sin hash previo).
    const porId = [...facturasEntrantes].sort((a, b) => (a.id || 0) - (b.id || 0));
    let ultimoHash = '';
    for (const f of porId) {
        if (f.hash) { ultimoHash = f.hash; continue; } // ya sellada, conservar cadena
        const contenido = JSON.stringify({
            id: f.id,
            fecha: f.fecha,
            nif: f.cliente?.nif || '',
            conceptos: f.conceptos,
            subtotal: f.subtotal,
            iva: f.iva,
            ivaPorcentaje: f.ivaPorcentaje,
            total: f.total,
            hash_anterior: ultimoHash
        });
        f.hash = crypto.createHash('sha256').update(contenido, 'utf8').digest('hex');
        f.hash_anterior = ultimoHash;
        ultimoHash = f.hash;
    }
    // ─────────────────────────────────────────────────────────────────────────

    dbData.facturas = facturasEntrantes;

    guardarDB();
    datosVersion = Date.now(); // Nueva versión tras un guardado correcto

    if (dbData.facturas.length > prevFacLength) {
        registrarEvento(req.usuarioLogueado, 'INVOICE_ADD', `Se añadió/guardó una factura. (Total: ${dbData.facturas.length})`);
    } else if (dbData.facturas.length < prevFacLength) {
        registrarEvento(req.usuarioLogueado, 'INVOICE_DELETE', `Factura(s) eliminadas. (Total: ${dbData.facturas.length})`);
    } else {
        registrarEvento(req.usuarioLogueado, 'DATA_SAVE', 'Base de datos sincronizada/actualizada');
    }

    // Emitir mensaje por WebSockets a todos los clientes que la base de datos cambió
    io.emit('datosActualizados');

    // Devolver facturas con hashes ya asignados para que el frontend los tenga de inmediato
    res.json({ success: true, version: datosVersion, facturas: dbData.facturas });
});

// --- ENDPOINTS DE PRESUPUESTOS ---

app.get('/api/presupuestos', requireAuth, (req, res) => {
    res.json(dbData.presupuestos || []);
});

app.post('/api/presupuestos', requireAuth, (req, res) => {
    try {
        const presupuestos = req.body;
        if (!Array.isArray(presupuestos)) {
            return res.status(400).json({ success: false, error: 'Formato inv\u00e1lido: se esperaba un array.' });
        }
        dbData.presupuestos = presupuestos;
        guardarDB();
        res.json({ success: true });
    } catch(err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// --- SISTEMA DE COPIAS DE SEGURIDAD ---

app.post('/api/backup/crear', requireAuth, requireAdmin, (req, res) => {
    try {
        const data = fs.readFileSync(dataFile);
        const ahora = new Date();
        const fecha = ahora.toISOString().replace(/[:.]/g, '-');
        const tipo = req.body.tipo || 'manual';
        const backupFile = path.join(backupDir, `backup_${tipo}_${fecha}.json`);
        fs.writeFileSync(backupFile, data);
        console.log(`[Backup] Copia ${tipo} creada: ${backupFile}`);
        registrarEvento(req.usuarioLogueado, 'BACKUP_CREATE', `Copia manual guardada: backup_${tipo}_${fecha}.json`);
        res.json({ success: true, archivo: path.basename(backupFile) });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.get('/api/backup/listar', requireAuth, requireAdmin, (req, res) => {
    try {
        const archivos = fs.readdirSync(backupDir)
            .filter(f => f.endsWith('.json') && !f.startsWith('._'))
            .map(f => {
                try {
                    const filePath = path.join(backupDir, f);
                    const stats = fs.statSync(filePath);
                    let clientes = 0, facturas = 0;
                    // Solo parsear si el archivo es razonablemente pequeño (<5MB) para evitar bloqueo
                    if (stats.size < 5 * 1024 * 1024) {
                        try {
                            const contenido = JSON.parse(fs.readFileSync(filePath, 'utf8'));
                            clientes = (contenido.clientes || []).length;
                            facturas = (contenido.facturas || []).length;
                        } catch(e) { /* archivo corrupto: ignorar conteo */ }
                    }
                    return { nombre: f, fecha: stats.mtime, tamano: stats.size, clientes, facturas };
                } catch (e) {
                    return null; // archivo inaccesible: ignorar
                }
            })
            .filter(Boolean) // eliminar nulos
            .sort((a, b) => new Date(b.fecha) - new Date(a.fecha))
            .slice(0, 100); // máximo 100 backups en el listado
        res.json(archivos);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/backup/restaurar', requireAuth, requireAdmin, (req, res) => {
    try {
        const { nombre } = req.body;
        const backupFile = path.join(backupDir, nombre);
        
        if (!fs.existsSync(backupFile)) {
            return res.status(404).json({ success: false, error: 'Backup no encontrado' });
        }
        
        const dataActual = fs.readFileSync(dataFile);
        const fechaSeguridad = new Date().toISOString().replace(/[:.]/g, '-');
        fs.writeFileSync(path.join(backupDir, `backup_pre-restauracion_${fechaSeguridad}.json`), dataActual);
        
        const backupDataHTML = fs.readFileSync(backupFile);
        let bkData = JSON.parse(backupDataHTML);
        const actualParsed = JSON.parse(dataActual);
        
        // Conservar usuarios y eventos del actual
        if (!bkData.usuarios) bkData.usuarios = actualParsed.usuarios;
        if (!bkData.eventos) bkData.eventos = actualParsed.eventos;

        // Cargar en memoria y persistir (SQLite + espejo JSON) para que el cambio surta efecto sin reiniciar
        dbData.clientes = bkData.clientes || [];
        dbData.facturas = bkData.facturas || [];
        dbData.presupuestos = bkData.presupuestos || [];
        dbData.usuarios = bkData.usuarios || [];
        dbData.eventos = bkData.eventos || [];
        dbData.logistica = bkData.logistica || { envios: [], palets: [], colaboradoras: [] };
        guardarDB();
        datosVersion = Date.now(); // Los clientes deben resincronizar tras la restauración

        console.log(`[Restauración] Datos restaurados desde: ${nombre}`);
        registrarEvento(req.usuarioLogueado, 'BACKUP_RESTORE', `Datos restaurados desde ${nombre}`);
        
        io.emit('datosActualizados');
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.post('/api/backup/subir', requireAuth, requireAdmin, (req, res) => {
    try {
        const datosSubidos = req.body;
        if (!datosSubidos.clientes || !datosSubidos.facturas) {
            return res.status(400).json({ success: false, error: 'Formato de archivo inválido' });
        }
        
        const ahora = new Date();
        const fecha = ahora.toISOString().replace(/[:.]/g, '-');
        
        const backupFile = path.join(backupDir, `backup_externo_${fecha}.json`);
        fs.writeFileSync(backupFile, JSON.stringify(datosSubidos, null, 2));
        
        const dataActual = fs.readFileSync(dataFile);
        fs.writeFileSync(path.join(backupDir, `backup_pre-restauracion_${fecha}.json`), dataActual);
        
        const actualParsed = JSON.parse(dataActual);
        if (!datosSubidos.usuarios) datosSubidos.usuarios = actualParsed.usuarios;
        if (!datosSubidos.eventos) datosSubidos.eventos = actualParsed.eventos;

        // Cargar en memoria y persistir (SQLite + espejo JSON) para que surta efecto sin reiniciar
        dbData.clientes = datosSubidos.clientes || [];
        dbData.facturas = datosSubidos.facturas || [];
        dbData.presupuestos = datosSubidos.presupuestos || [];
        dbData.usuarios = datosSubidos.usuarios || [];
        dbData.eventos = datosSubidos.eventos || [];
        dbData.logistica = datosSubidos.logistica || { envios: [], palets: [], colaboradoras: [] };
        guardarDB();
        datosVersion = Date.now(); // Los clientes deben resincronizar tras la restauración

        console.log(`[Restauración] Datos cargados desde archivo externo`);
        registrarEvento(req.usuarioLogueado, 'BACKUP_UPLOAD', `Restaurado de archivo externo`);
        
        io.emit('datosActualizados');
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.get('/api/backup/descargar/:nombre', requireAuth, requireAdmin, (req, res) => {
    const backupFile = path.join(backupDir, req.params.nombre);
    if (!fs.existsSync(backupFile)) {
        return res.status(404).json({ error: 'Archivo no encontrado' });
    }
    registrarEvento(req.usuarioLogueado, 'BACKUP_DOWNLOAD', `Descarga de backup ${req.params.nombre}`);
    res.download(backupFile);
});

app.delete('/api/backup/eliminar/:nombre', requireAuth, requireAdmin, (req, res) => {
    try {
        const backupFile = path.join(backupDir, req.params.nombre);
        if (fs.existsSync(backupFile)) {
            fs.unlinkSync(backupFile);
            registrarEvento(req.usuarioLogueado, 'BACKUP_DELETE', `Copia borrada: ${req.params.nombre}`);
            res.json({ success: true });
        } else {
            res.status(404).json({ success: false, error: 'No encontrado' });
        }
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// --- BACKUP AUTOMÁTICO CADA 1 SEMANA ---
const intervaloBackup = 604800000;

setInterval(() => {
    try {
        const data = fs.readFileSync(dataFile);
        const fecha = new Date().toISOString().replace(/[:.]/g, '-');
        const backupFile = path.join(backupDir, `backup_auto_${fecha}.json`);
        fs.writeFileSync(backupFile, data);
        
        const autos = fs.readdirSync(backupDir)
            .filter(f => f.startsWith('backup_auto_'))
            .sort()
            .reverse();
        if (autos.length > 52) {
            autos.slice(52).forEach(f => { fs.unlinkSync(path.join(backupDir, f)); });
        }
    } catch (error) {
        console.error("Error en backup automático:", error);
    }
}, intervaloBackup);

// (Backup de inicio eliminado — no es necesario y ralentizaba el arranque)

// --- MÓDULO DE LOGÍSTICA ---
// Lectura: cualquier usuario autenticado puede ver los datos de logística.
// Escritura: cualquier usuario autenticado puede modificar los datos operativos.

app.get('/api/logistica/datos', requireAuth, (req, res) => {
    try {
        if (!dbData.logistica) dbData.logistica = { envios: [], palets: [], colaboradoras: [] };
        res.json(dbData.logistica);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/logistica/datos', requireAuth, (req, res) => {
    try {
        const { envios, palets, colaboradoras } = req.body;
        if (!Array.isArray(envios) || !Array.isArray(palets) || !Array.isArray(colaboradoras)) {
            return res.status(400).json({ success: false, error: 'Formato de datos inválido' });
        }
        if (!dbData.logistica) dbData.logistica = {};
        dbData.logistica.envios = envios;
        dbData.logistica.palets = palets;
        dbData.logistica.colaboradoras = colaboradoras;
        guardarDB();
        io.emit('logisticaActualizada');
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

function getLocalIP() {
    const interfaces = os.networkInterfaces();
    for (const name of Object.keys(interfaces)) {
        for (const iface of interfaces[name]) {
            if (iface.family === 'IPv4' && !iface.internal) {
                return iface.address;
            }
        }
    }
    return '127.0.0.1';
}

server.listen(PORT, '0.0.0.0', () => {
    const localIP = getLocalIP();
    console.log(`🚀 MYL Express Facturación iniciado automáticamente en puerto ${PORT}.`);
    console.log(`📡 URL Local: http://localhost:${PORT}`);
    console.log(`📡 URL Remota: http://${localIP}:${PORT}`);
});


// Manejador de error de puerto ya en uso (evita bucle de reinicios del servicio)
server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
        console.error(`[ERROR CRÍTICO] El puerto ${PORT} ya está en uso.`);
        console.error('Esto ocurre cuando hay otra instancia del servidor ya ejecutándose.');
        console.error('Comprueba que el script VBS del inicio de sesión está eliminado y solo el servicio Windows está activo.');
        // Salir con código de error para que el wrapper NO reintente
        process.exit(1);
    } else {
        console.error('[ERROR] Error del servidor:', err.message);
        throw err;
    }
});

// Apagado limpio al recibir señal de cierre (SIGINT/SIGTERM)
function cerrarServidor(signal) {
    console.log(`\n[Sistema] Señal ${signal} recibida. Cerrando servidor correctamente...`);
    server.close(() => {
        try { almacen.cerrar(); } catch (e) { /* noop */ }
        console.log('[Sistema] Servidor cerrado. Hasta pronto.');
        process.exit(0);
    });
    // Si no cierra en 5s, forzar salida
    setTimeout(() => process.exit(0), 5000);
}
// ══════════════════════════════════════════════════════════════════════════════
//  ACTUALIZACIONES OTA — Solo SuperAdmin
// ══════════════════════════════════════════════════════════════════════════════

const actualizacionDir = path.join(__dirname, 'actualizaciones');
const historialActFile  = path.join(actualizacionDir, 'historial.json');

// Archivos que pueden ser reemplazados por una actualización
const ARCHIVOS_PERMITIDOS_UPDATE = new Set([
    'public/index.html',
    'public/index.css',
    'public/app.js',
    'public/logistica.css',
    'servidor.js',
    'db_sqlite.js',
]);

// Crear directorio de actualizaciones si no existe
if (!fs.existsSync(actualizacionDir)) {
    fs.mkdirSync(actualizacionDir, { recursive: true });
}

function leerHistorialAct() {
    try {
        if (fs.existsSync(historialActFile)) {
            return JSON.parse(fs.readFileSync(historialActFile, 'utf8'));
        }
    } catch(e) {}
    return [];
}

function guardarHistorialAct(historial) {
    fs.writeFileSync(historialActFile, JSON.stringify(historial, null, 2), 'utf8');
}

// GET /api/actualizacion/historial
app.get('/api/actualizacion/historial', requireAuth, requireSuperAdmin, (req, res) => {
    try {
        const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, 'package.json'), 'utf8'));
        res.json({ versionActual: pkg.version, historial: leerHistorialAct() });
    } catch(e) {
        res.json({ versionActual: '1.0.0', historial: [] });
    }
});

// POST /api/actualizacion/preview — valida el paquete .myl sin aplicarlo
app.post('/api/actualizacion/preview', requireAuth, requireSuperAdmin, (req, res) => {
    try {
        const paquete = req.body;
        if (!paquete || paquete.app !== 'MYL-FACTURACION') {
            return res.status(400).json({ success: false, error: 'Archivo inválido: no es un paquete de actualización MYL Express.' });
        }
        if (!paquete.version || !Array.isArray(paquete.archivos) || paquete.archivos.length === 0) {
            return res.status(400).json({ success: false, error: 'Paquete malformado: faltan campos requeridos.' });
        }
        for (const archivo of paquete.archivos) {
            if (!archivo.ruta || !ARCHIVOS_PERMITIDOS_UPDATE.has(archivo.ruta)) {
                return res.status(400).json({ success: false, error: `Archivo no permitido: ${archivo.ruta || '(sin ruta)'}` });
            }
            if (archivo.ruta.includes('..')) {
                return res.status(400).json({ success: false, error: 'Ruta de archivo inválida.' });
            }
        }
        // Verificar checksum
        const checksumCalc = crypto.createHash('sha256')
            .update(JSON.stringify(paquete.archivos))
            .digest('hex').slice(0, 16);
        if (paquete.checksum && checksumCalc !== paquete.checksum) {
            return res.status(400).json({ success: false, error: 'Checksum inválido: el paquete puede estar corrupto o modificado.' });
        }
        const info = paquete.archivos.map(a => ({
            ruta:   a.ruta,
            tamano: Buffer.byteLength(a.contenido || '', 'utf8'),
            existe: fs.existsSync(path.join(__dirname, a.ruta)),
        }));
        res.json({
            success:     true,
            version:     paquete.version,
            versionBase: paquete.versionBase,
            fecha:       paquete.fecha,
            autor:       paquete.autor,
            changelog:   paquete.changelog || [],
            archivos:    info,
            checksum:    paquete.checksum,
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// POST /api/actualizacion/aplicar — aplica el paquete (con backup previo)
app.post('/api/actualizacion/aplicar', requireAuth, requireSuperAdmin, (req, res) => {
    try {
        const paquete = req.body;
        // Re-validar (no confiar solo en el preview)
        if (!paquete || paquete.app !== 'MYL-FACTURACION') {
            return res.status(400).json({ success: false, error: 'Paquete inválido.' });
        }
        if (!paquete.version || !Array.isArray(paquete.archivos) || paquete.archivos.length === 0) {
            return res.status(400).json({ success: false, error: 'Paquete malformado.' });
        }
        for (const archivo of paquete.archivos) {
            if (!archivo.ruta || !ARCHIVOS_PERMITIDOS_UPDATE.has(archivo.ruta) || archivo.ruta.includes('..')) {
                return res.status(400).json({ success: false, error: `Archivo no permitido: ${archivo.ruta}` });
            }
        }

        // 1. Crear backup de los archivos actuales que van a ser reemplazados
        const fechaBackup = new Date().toISOString().replace(/[:.]/g, '-');
        const rollbackDirName = `rollback-v${paquete.version}-${fechaBackup}`;
        const rollbackDir = path.join(actualizacionDir, rollbackDirName);
        fs.mkdirSync(rollbackDir, { recursive: true });

        for (const archivo of paquete.archivos) {
            const rutaActual = path.join(__dirname, archivo.ruta);
            if (fs.existsSync(rutaActual)) {
                const destDir = path.join(rollbackDir, path.dirname(archivo.ruta));
                fs.mkdirSync(destDir, { recursive: true });
                fs.copyFileSync(rutaActual, path.join(rollbackDir, archivo.ruta));
            }
        }

        // 2. Escribir los archivos nuevos
        for (const archivo of paquete.archivos) {
            const rutaDest = path.join(__dirname, archivo.ruta);
            fs.mkdirSync(path.dirname(rutaDest), { recursive: true });
            fs.writeFileSync(rutaDest, archivo.contenido, 'utf8');
        }

        // 3. Actualizar versión en package.json
        try {
            const pkgPath = path.join(__dirname, 'package.json');
            const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
            pkg.version = paquete.version;
            fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2), 'utf8');
        } catch(e) { /* no crítico */ }

        // 4. Registrar en historial
        const historial = leerHistorialAct();
        historial.unshift({
            id:          Date.now(),
            version:     paquete.version,
            versionBase: paquete.versionBase,
            fecha:       new Date().toISOString(),
            autor:       paquete.autor || 'dev',
            changelog:   paquete.changelog || [],
            archivos:    paquete.archivos.map(a => a.ruta),
            aplicadoPor: req.usuarioLogueado,
            rollbackDir: rollbackDirName,
        });
        // Mantener máximo 50 entradas en historial
        if (historial.length > 50) historial.splice(50);
        guardarHistorialAct(historial);

        registrarEvento(req.usuarioLogueado, 'ACTUALIZACION_APLICADA',
            `Actualización v${paquete.version} aplicada. ${paquete.archivos.length} archivos actualizados.`);

        res.json({ success: true, version: paquete.version, archivos: paquete.archivos.length });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// POST /api/actualizacion/reiniciar — reinicia el proceso Node (el servicio Windows lo relanza)
app.post('/api/actualizacion/reiniciar', requireAuth, requireSuperAdmin, (req, res) => {
    registrarEvento(req.usuarioLogueado, 'REINICIO_MANUAL', 'Reinicio manual del servidor desde panel de actualizaciones.');
    res.json({ success: true, mensaje: 'Reiniciando servidor en 1 segundo...' });
    setTimeout(() => process.exit(0), 1000);
});

process.on('SIGINT', () => cerrarServidor('SIGINT'));
process.on('SIGTERM', () => cerrarServidor('SIGTERM'));