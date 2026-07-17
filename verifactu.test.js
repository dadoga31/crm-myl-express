'use strict';
/* Test del motor VeriFactu. Ejecutar:  node verifactu.test.js
   No envía nada a la AEAT; solo verifica huella, QR y XML localmente. */

const v = require('./verifactu');

let ok = true;
const line = () => console.log('─'.repeat(70));

// ── 1) VECTOR OFICIAL DE LA AEAT (validación del algoritmo de huella) ─────────
line();
console.log('1) Validación contra el ejemplo OFICIAL de la AEAT');
const ESPERADO = '3C464DAF61ACB827C65FDA19F352A4E3BDC2C640E9E9FC4CC058073F38F12F60';
const calculado = v.calcularHuellaAlta({
  idEmisor: '89890001K', numSerie: '12345678/G33', fechaExp: '01-01-2024',
  tipoFactura: 'F1', cuotaTotal: '12.35', importeTotal: '123.45',
  huellaAnterior: '', fechaHora: '2024-01-01T19:20:30+01:00',
});
console.log('   Esperado :', ESPERADO);
console.log('   Calculado:', calculado);
if (calculado === ESPERADO) { console.log('   ✅ COINCIDE — algoritmo de huella correcto'); }
else { console.log('   ❌ NO COINCIDE'); ok = false; }

// ── 2) EJEMPLO REAL: dos facturas de MYL encadenadas ─────────────────────────
line();
console.log('2) Cadena de facturas de MYL (encadenamiento de huellas)');

const factura1 = {
  id: 13, fecha: '2027-01-02',
  cliente: { nombre: 'DETERGENTES LA FABRICA, S.L.', nif: 'B45896453' },
  conceptos: [{ descripcion: 'Servicio de transporte enero', importe: 100 }],
  subtotal: 100, iva: 21, ivaPorcentaje: 21, total: 121,
};
const factura2 = {
  id: 14, fecha: '2027-01-03',
  cliente: { nombre: 'PUNTO CORREOS', nif: 'B12345678' },
  conceptos: [{ descripcion: 'Almacenaje semana 1', importe: 50 }],
  subtotal: 50, iva: 10.5, ivaPorcentaje: 21, total: 60.5,
};

// Fecha fija para que el ejemplo sea reproducible
const fecha1 = new Date('2027-01-02T10:00:00');
const fecha2 = new Date('2027-01-03T09:30:00');

// La primera factura de la cadena → huellaAnterior vacía (PrimerRegistro)
const r1 = v.procesarFacturaNueva(factura1, '', fecha1);
// La segunda se encadena con la huella de la primera
const r2 = v.procesarFacturaNueva(factura2, r1.huella, fecha2);

console.log('   Factura ' + v.numSerieFactura(factura1) + ' (primer registro de la cadena):');
console.log('     huella anterior :', JSON.stringify(r1.huellaAnterior));
console.log('     huella          :', r1.huella);
console.log('     QR              :', r1.qr);
console.log('   Factura ' + v.numSerieFactura(factura2) + ' (encadenada):');
console.log('     huella anterior :', r2.huellaAnterior);
console.log('     huella          :', r2.huella);
console.log('     QR              :', r2.qr);

// Comprobaciones de integridad de la cadena
if (r2.huellaAnterior === r1.huella) console.log('   ✅ La huella anterior de la 2ª = huella de la 1ª (cadena correcta)');
else { console.log('   ❌ La cadena no enlaza'); ok = false; }

if (/^[0-9A-F]{64}$/.test(r1.huella) && /^[0-9A-F]{64}$/.test(r2.huella))
  console.log('   ✅ Huellas en formato SHA-256 hex mayúsculas (64 chars)');
else { console.log('   ❌ Formato de huella incorrecto'); ok = false; }

// Determinismo: recalcular la factura 1 debe dar la misma huella
const r1bis = v.procesarFacturaNueva(factura1, '', fecha1);
if (r1bis.huella === r1.huella) console.log('   ✅ Determinista (misma entrada → misma huella)');
else { console.log('   ❌ No determinista'); ok = false; }

// ── 3) XML de envío (muestra) ────────────────────────────────────────────────
line();
console.log('3) XML del sobre de envío (RegFactuSistemaFacturacion) — muestra:');
const sobre = v.generarSobreVerifactu([r1.xml, r2.xml]);
console.log(sobre.slice(0, 620) + '\n   … (' + sobre.length + ' caracteres en total)');

// ── 4) Envío: debe estar bloqueado hasta tener certificado ───────────────────
line();
console.log('4) Envío a la AEAT (debe estar pendiente de certificado):');
v.enviarAAEAT(sobre).then(
  () => { console.log('   ❌ No debería enviar sin certificado'); ok = false; done(); },
  (e) => { console.log('   ✅ Bloqueado correctamente →', e.message.split(':')[1].trim().slice(0, 60) + '…'); done(); }
);

function done() {
  line();
  console.log(ok ? '✅ TODO OK — motor VeriFactu listo (falta solo el certificado)' : '❌ Hay fallos, revisar arriba');
  line();
  process.exit(ok ? 0 : 1);
}
