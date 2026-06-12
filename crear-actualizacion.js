#!/usr/bin/env node
/**
 * MYL Express — Generador de Paquetes de Actualización
 * ─────────────────────────────────────────────────────
 * Uso básico (incluye todos los archivos por defecto):
 *   node crear-actualizacion.js
 *
 * Incluir archivos específicos:
 *   node crear-actualizacion.js public/index.html public/index.css
 *
 * Con versión y changelog:
 *   node crear-actualizacion.js --version 1.2.0 --changelog "Mejora del login" --changelog "Fix tabla presupuestos"
 *
 * Genera: actualizacion-v1.2.0-2026-06-07.myl
 * Súbelo en el panel → Administración → Actualizaciones
 */

'use strict';

const fs     = require('fs');
const path   = require('path');
const crypto = require('crypto');

// ── Archivos que pueden incluirse en una actualización ─────────────────
const ARCHIVOS_DISPONIBLES = [
    'public/index.html',
    'public/index.css',
    'public/app.js',
    'public/logistica.css',
    'servidor.js',
    'db_sqlite.js',
];

// ── Parsear argumentos CLI ─────────────────────────────────────────────
const args = process.argv.slice(2);
let version   = null;
let changelog = [];
let archivosEspecificados = [];

for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--version' || arg === '-v') {
        version = args[++i];
    } else if (arg === '--changelog' || arg === '-c') {
        changelog.push(args[++i]);
    } else if (arg === '--help' || arg === '-h') {
        console.log(`
  MYL Express — Generador de Paquetes de Actualización

  Uso: node crear-actualizacion.js [archivos...] [opciones]

  Archivos disponibles:
${ARCHIVOS_DISPONIBLES.map(f => `    ${f}`).join('\n')}

  Opciones:
    --version, -v <ver>      Versión del paquete (ej: 1.2.0)
    --changelog, -c <texto>  Añadir entrada al changelog (repetible)
    --help, -h               Mostrar esta ayuda
`);
        process.exit(0);
    } else if (!arg.startsWith('--')) {
        archivosEspecificados.push(arg);
    }
}

// ── Leer package.json para versión actual ──────────────────────────────
let pkg = { version: '1.0.0' };
try {
    pkg = JSON.parse(fs.readFileSync(path.join(__dirname, 'package.json'), 'utf8'));
} catch(e) { /* usar defecto */ }

// ── Auto-incrementar versión patch si no se especificó ─────────────────
if (!version) {
    const parts = pkg.version.split('.').map(Number);
    parts[2] = (parts[2] || 0) + 1;
    version = parts.join('.');
}

// ── Determinar archivos a empaquetar ───────────────────────────────────
const archivosAEmpaquetar = archivosEspecificados.length > 0
    ? archivosEspecificados.filter(f => {
        if (!ARCHIVOS_DISPONIBLES.includes(f)) {
            console.warn(`  [!] Archivo no permitido omitido: ${f}`);
            return false;
        }
        return true;
    })
    : ARCHIVOS_DISPONIBLES;

if (archivosAEmpaquetar.length === 0) {
    console.error('Error: no hay archivos válidos para empaquetar.');
    process.exit(1);
}

// ── Leer contenidos ────────────────────────────────────────────────────
console.log('');
console.log('  Empaquetando archivos:');
const archivos = [];
let tamanoTotal = 0;

for (const ruta of archivosAEmpaquetar) {
    const rutaCompleta = path.join(__dirname, ruta);
    if (!fs.existsSync(rutaCompleta)) {
        console.warn(`  [!] No encontrado, omitido: ${ruta}`);
        continue;
    }
    const contenido = fs.readFileSync(rutaCompleta, 'utf8');
    const bytes = Buffer.byteLength(contenido, 'utf8');
    tamanoTotal += bytes;
    archivos.push({ ruta, contenido });
    console.log(`  + ${ruta.padEnd(30)} ${(bytes / 1024).toFixed(1)} KB`);
}

if (archivos.length === 0) {
    console.error('Error: ningún archivo encontrado.');
    process.exit(1);
}

// ── Construir el paquete ───────────────────────────────────────────────
const paquete = {
    app:         'MYL-FACTURACION',
    version,
    versionBase: pkg.version,
    fecha:       new Date().toISOString(),
    autor:       process.env.USERNAME || process.env.USER || 'dev',
    changelog:   changelog.length > 0
        ? changelog
        : ['Sin descripción — añade --changelog "descripción" al ejecutar el script'],
    archivos,
};

// Checksum de integridad
paquete.checksum = crypto.createHash('sha256')
    .update(JSON.stringify(paquete.archivos))
    .digest('hex')
    .slice(0, 16);

// ── Guardar el archivo .myl ────────────────────────────────────────────
const fechaStr   = new Date().toISOString().slice(0, 10);
const nombreFile = `actualizacion-v${version}-${fechaStr}.myl`;
const rutaSalida = path.join(__dirname, nombreFile);

fs.writeFileSync(rutaSalida, JSON.stringify(paquete, null, 2), 'utf8');

const tamanoKB = (fs.statSync(rutaSalida).size / 1024).toFixed(1);

console.log('');
console.log('  ─────────────────────────────────────────');
console.log(`  Paquete generado: ${nombreFile}`);
console.log(`  Versión:          ${pkg.version}  →  ${version}`);
console.log(`  Archivos:         ${archivos.length}`);
console.log(`  Tamaño total:     ${tamanoKB} KB`);
console.log(`  Checksum:         ${paquete.checksum}`);
console.log('');
console.log('  Sube este archivo en:');
console.log('  Panel → Administración → Actualizaciones');
console.log('');
