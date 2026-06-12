// ─────────────────────────────────────────────────────────────────────────────
//  Capa de almacenamiento SQLite (Fase 1 de la migración)
//
//  Objetivo: sustituir el fichero único base_de_datos.json por una base de datos
//  SQLite real (transaccional y duradera) SIN cambiar el contrato de la API ni el
//  frontend. La estructura en memoria `dbData` sigue siendo idéntica.
//
//  Usa node:sqlite (integrado en Node >= 22.5), así que NO compila módulos nativos.
//
//  Diseño:
//   - Cada colección (clientes, facturas, presupuestos, usuarios, eventos y las 3
//     de logística) se guarda en su propia tabla.
//   - Cada registro se almacena como documento JSON completo en la columna `doc`,
//     preservando exactamente su forma (incluidos objetos anidados como
//     factura.cliente o factura.conceptos). Una columna `orden` conserva el orden
//     del array tal y como lo maneja el frontend (operaciones por índice).
//   - Guardar = reemplazar el contenido de la tabla dentro de una transacción.
//     A esta escala (cientos de registros) es instantáneo y 100% atómico.
// ─────────────────────────────────────────────────────────────────────────────

const { DatabaseSync } = require('node:sqlite');
const path = require('path');
const fs = require('fs');

// Colecciones que son arrays de nivel superior en dbData
const COLECCIONES = ['clientes', 'facturas', 'presupuestos', 'usuarios', 'eventos'];
// Colecciones dentro de dbData.logistica -> tabla log_<nombre>
const COLECCIONES_LOGISTICA = ['envios', 'palets', 'colaboradoras'];

function nombreTabla(coleccion) {
    return coleccion; // tablas: clientes, facturas, ...
}
function nombreTablaLogistica(sub) {
    return 'log_' + sub; // log_envios, log_palets, log_colaboradoras
}

class AlmacenSQLite {
    constructor(rutaArchivo) {
        this.ruta = rutaArchivo;
        this.db = new DatabaseSync(rutaArchivo);
        // WAL: mejor durabilidad y concurrencia de lectura sin bloquear escrituras.
        this.db.exec('PRAGMA journal_mode = WAL;');
        this.db.exec('PRAGMA synchronous = NORMAL;');
        this._crearTablas();
    }

    _crearTablas() {
        const tablas = [
            ...COLECCIONES.map(nombreTabla),
            ...COLECCIONES_LOGISTICA.map(nombreTablaLogistica),
        ];
        for (const t of tablas) {
            this.db.exec(`CREATE TABLE IF NOT EXISTS "${t}" (
                orden INTEGER PRIMARY KEY AUTOINCREMENT,
                doc   TEXT NOT NULL
            );`);
        }
    }

    // ¿Está la base de datos completamente vacía? (para decidir la importación inicial)
    estaVacia() {
        const tablas = [
            ...COLECCIONES.map(nombreTabla),
            ...COLECCIONES_LOGISTICA.map(nombreTablaLogistica),
        ];
        for (const t of tablas) {
            const fila = this.db.prepare(`SELECT COUNT(*) AS n FROM "${t}"`).get();
            if (fila && fila.n > 0) return false;
        }
        return true;
    }

    _leerTabla(tabla) {
        const filas = this.db.prepare(`SELECT doc FROM "${tabla}" ORDER BY orden ASC`).all();
        return filas.map(f => JSON.parse(f.doc));
    }

    _reemplazarTabla(tabla, registros) {
        this.db.exec(`DELETE FROM "${tabla}"`);
        if (!registros || registros.length === 0) return;
        const insertar = this.db.prepare(`INSERT INTO "${tabla}" (doc) VALUES (?)`);
        for (const r of registros) {
            insertar.run(JSON.stringify(r));
        }
    }

    // Cargar todo el estado en la forma exacta de dbData que usa el servidor.
    cargarTodo() {
        return {
            clientes: this._leerTabla('clientes'),
            facturas: this._leerTabla('facturas'),
            presupuestos: this._leerTabla('presupuestos'),
            usuarios: this._leerTabla('usuarios'),
            eventos: this._leerTabla('eventos'),
            logistica: {
                envios: this._leerTabla(nombreTablaLogistica('envios')),
                palets: this._leerTabla(nombreTablaLogistica('palets')),
                colaboradoras: this._leerTabla(nombreTablaLogistica('colaboradoras')),
            },
        };
    }

    // Persistir todo el estado de forma atómica (reemplazo completo en una transacción).
    guardarTodo(dbData) {
        this.db.exec('BEGIN');
        try {
            this._reemplazarTabla('clientes', dbData.clientes || []);
            this._reemplazarTabla('facturas', dbData.facturas || []);
            this._reemplazarTabla('presupuestos', dbData.presupuestos || []);
            this._reemplazarTabla('usuarios', dbData.usuarios || []);
            this._reemplazarTabla('eventos', dbData.eventos || []);
            const log = dbData.logistica || {};
            this._reemplazarTabla(nombreTablaLogistica('envios'), log.envios || []);
            this._reemplazarTabla(nombreTablaLogistica('palets'), log.palets || []);
            this._reemplazarTabla(nombreTablaLogistica('colaboradoras'), log.colaboradoras || []);
            this.db.exec('COMMIT');
        } catch (e) {
            this.db.exec('ROLLBACK');
            throw e;
        }
    }

    cerrar() {
        try { this.db.close(); } catch (e) { /* ya cerrada */ }
    }
}

// Abre (o crea) la base de datos SQLite y, si está vacía y existe un base_de_datos.json
// previo, importa esos datos una sola vez. Devuelve { almacen, dbData, migrado }.
function abrirEImportar(rutaSqlite, rutaJsonLegado) {
    const almacen = new AlmacenSQLite(rutaSqlite);
    let migrado = false;

    if (almacen.estaVacia() && rutaJsonLegado && fs.existsSync(rutaJsonLegado)) {
        try {
            const legado = JSON.parse(fs.readFileSync(rutaJsonLegado, 'utf8'));
            const dbData = {
                clientes: legado.clientes || [],
                facturas: legado.facturas || [],
                presupuestos: legado.presupuestos || [],
                usuarios: legado.usuarios || [],
                eventos: legado.eventos || [],
                logistica: legado.logistica || { envios: [], palets: [], colaboradoras: [] },
            };
            almacen.guardarTodo(dbData);
            migrado = true;
            console.log(`[SQLite] Migración inicial completada desde ${path.basename(rutaJsonLegado)}: ` +
                `${dbData.clientes.length} clientes, ${dbData.facturas.length} facturas, ` +
                `${dbData.usuarios.length} usuarios, ${dbData.eventos.length} eventos.`);
        } catch (e) {
            console.error('[SQLite] No se pudo migrar base_de_datos.json:', e.message);
        }
    }

    const dbData = almacen.cargarTodo();
    return { almacen, dbData, migrado };
}

module.exports = { AlmacenSQLite, abrirEImportar };
