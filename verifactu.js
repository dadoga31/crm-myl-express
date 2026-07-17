'use strict';
/* ============================================================================
   MOTOR VERI*FACTU — MYL Express Logística
   ----------------------------------------------------------------------------
   Genera el registro de facturación, la HUELLA (hash SHA-256 encadenada),
   el código QR oficial y el XML de envío conforme a:
     · RD 1007/2023 (RRSIF)
     · Orden HAC/1177/2024 (especificaciones técnicas: huella, QR, XML)

   Estado: TODO listo EXCEPTO el envío real, que requiere el CERTIFICADO
   ELECTRÓNICO de representante de MYL (ver enviarAAEAT() más abajo).

   El algoritmo de la huella está VALIDADO contra el ejemplo oficial de la AEAT
   (ver verifactu.test.js → debe imprimir "COINCIDE").

   Este módulo NO tiene efectos secundarios: no toca la base de datos ni el
   flujo de facturación actual. Se integra llamando a procesarFacturaNueva().
   ============================================================================ */

const crypto = require('crypto');

// ─────────────────────────────────────────────────────────────────────────────
// 1) CONFIGURACIÓN  (revisar antes de producción)
// ─────────────────────────────────────────────────────────────────────────────

// Datos fiscales del EMISOR (obligado tributario)
const EMISOR = {
  nif:    'B26658302',
  nombre: 'Myl Express Logística S.L.',
};

// Identificación del SISTEMA INFORMÁTICO de facturación (SIF).
// Al ser software propio, MYL es el PRODUCTOR: estos valores los asignáis
// vosotros y deben coincidir con la "declaración responsable" del software.
const SISTEMA_INFORMATICO = {
  NombreRazon:                 'Myl Express Logística S.L.', // productor (vosotros)
  NIF:                         'B26658302',
  NombreSistemaInformatico:    'MYL Facturación',
  IdSistemaInformatico:        '01',   // id que asignáis a este SIF (2 caracteres)
  Version:                     '2.0',
  NumeroInstalacion:           '001',
  TipoUsoPosibleSoloVerifactu: 'S',    // S: el SIF solo opera en modo VeriFactu
  TipoUsoPosibleMultiOT:       'N',    // N: no multi-obligado tributario
  IndicadorMultiplesOT:        'N',
};

// Entorno AEAT. Empezar SIEMPRE en 'preproduccion' (pruebas sin efecto fiscal).
const ENTORNO = {
  actual: 'preproduccion',            // 'preproduccion' | 'produccion'
  qr: {
    preproduccion: 'https://prewww2.aeat.es/wlpl/TIKE-CONT/ValidarQR',
    produccion:    'https://www2.agenciatributaria.gob.es/wlpl/TIKE-CONT/ValidarQR',
  },
  // Endpoints SOAP del servicio web (confirmar con el WSDL oficial al integrar el envío)
  ws: {
    preproduccion: 'https://prewww10.aeat.es/wlpl/TIKE-CONT/ws/SistemaFacturacion/VerifactuSOAP',
    produccion:    'https://www10.agenciatributaria.gob.es/wlpl/TIKE-CONT/ws/SistemaFacturacion/VerifactuSOAP',
  },
};

const IDVERSION              = '1.0'; // versión del esquema
const TIPO_HUELLA            = '01';  // 01 = SHA-256
const TIPO_FACTURA_ORDINARIA = 'F1';  // F1 = factura completa/ordinaria

// ─────────────────────────────────────────────────────────────────────────────
// 2) HELPERS DE FORMATO  (exactos según la AEAT)
// ─────────────────────────────────────────────────────────────────────────────

// La factura guarda la fecha como 'YYYY-MM-DD' → la AEAT la quiere 'dd-mm-yyyy'
function fechaExpedicion(fechaISO) {
  const [y, m, d] = String(fechaISO).split('-');
  return `${d}-${m}-${y}`;
}

// Importe con 2 decimales y punto decimal
function imp(n) {
  return Number(n || 0).toFixed(2);
}

// FechaHoraHusoGenRegistro: ISO 8601 con huso, p.ej. 2024-01-01T19:20:30+01:00
function fechaHoraHuso(date = new Date()) {
  const p = n => String(n).padStart(2, '0');
  const offMin = -date.getTimezoneOffset();          // minutos respecto UTC
  const signo = offMin >= 0 ? '+' : '-';
  const oh = p(Math.floor(Math.abs(offMin) / 60));
  const om = p(Math.abs(offMin) % 60);
  return `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}` +
         `T${p(date.getHours())}:${p(date.getMinutes())}:${p(date.getSeconds())}` +
         `${signo}${oh}:${om}`;
}

// Número + serie de la factura. Debe ser correlativo, único, y COINCIDIR con el
// número impreso en la factura y en el QR. (Alinear la plantilla al activar VeriFactu.)
function numSerieFactura(factura) {
  return 'INV-' + String(factura.id).padStart(4, '0');
}

// ─────────────────────────────────────────────────────────────────────────────
// 3) HUELLA (hash)  — VALIDADO contra el ejemplo oficial de la AEAT
// ─────────────────────────────────────────────────────────────────────────────

function sha256Mayus(cadena) {
  return crypto.createHash('sha256').update(cadena, 'utf8').digest('hex').toUpperCase();
}

// Huella de un RegistroAlta.
// Orden EXACTO de campos definido por la AEAT (Orden HAC/1177/2024).
function calcularHuellaAlta({ idEmisor, numSerie, fechaExp, tipoFactura,
                              cuotaTotal, importeTotal, huellaAnterior, fechaHora }) {
  const cadena =
    `IDEmisorFactura=${idEmisor}` +
    `&NumSerieFactura=${numSerie}` +
    `&FechaExpedicionFactura=${fechaExp}` +
    `&TipoFactura=${tipoFactura}` +
    `&CuotaTotal=${cuotaTotal}` +
    `&ImporteTotal=${importeTotal}` +
    `&Huella=${huellaAnterior || ''}` +
    `&FechaHoraHusoGenRegistro=${fechaHora}`;
  return sha256Mayus(cadena);
}

// Huella de un RegistroAnulacion (para anular una factura ya registrada).
function calcularHuellaAnulacion({ idEmisor, numSerie, fechaExp, huellaAnterior, fechaHora }) {
  const cadena =
    `IDEmisorFacturaAnulada=${idEmisor}` +
    `&NumSerieFacturaAnulada=${numSerie}` +
    `&FechaExpedicionFacturaAnulada=${fechaExp}` +
    `&Huella=${huellaAnterior || ''}` +
    `&FechaHoraHusoGenRegistro=${fechaHora}`;
  return sha256Mayus(cadena);
}

// ─────────────────────────────────────────────────────────────────────────────
// 4) DESGLOSE de IVA y descripción
// ─────────────────────────────────────────────────────────────────────────────

// El modelo de MYL usa un único tipo de IVA por factura → un solo detalle.
// NOTA: para casos especiales (exportaciones, exentas, intracomunitarias,
// inversión del sujeto pasivo…) habría que mapear ClaveRegimen/CalificacionOperacion.
function construirDesglose(factura) {
  const tipo = factura.ivaPorcentaje !== undefined ? factura.ivaPorcentaje : 21;
  return [{
    ClaveRegimen:                  '01', // 01 = régimen general
    CalificacionOperacion:         'S1', // S1 = sujeta y no exenta (sin inversión SP)
    TipoImpositivo:                Number(tipo).toFixed(2),
    BaseImponibleOimporteNoSujeto: imp(factura.subtotal),
    CuotaRepercutida:              imp(factura.iva),
  }];
}

function descripcionOperacion(factura) {
  const txt = (factura.conceptos || [])
    .map(c => c.descripcion).filter(Boolean).join('; ');
  return (txt || 'Prestación de servicios de logística').slice(0, 500);
}

// ─────────────────────────────────────────────────────────────────────────────
// 5) CONSTRUCCIÓN DEL REGISTRO DE ALTA
// ─────────────────────────────────────────────────────────────────────────────

// factura        → objeto factura de la app { id, fecha, cliente, conceptos, subtotal, iva, ivaPorcentaje, total }
// huellaAnterior → huella del registro inmediatamente anterior de la cadena ('' si es el primero)
// fecha          → Date de generación del registro (por defecto ahora)
function construirRegistroAlta(factura, huellaAnterior = '', fecha = new Date()) {
  const numSerie     = numSerieFactura(factura);
  const fechaExp     = fechaExpedicion(factura.fecha);
  const cuotaTotal   = imp(factura.iva);
  const importeTotal = imp(factura.total);
  const fechaHora    = fechaHoraHuso(fecha);
  const esPrimero    = !huellaAnterior;

  const huella = calcularHuellaAlta({
    idEmisor: EMISOR.nif, numSerie, fechaExp,
    tipoFactura: TIPO_FACTURA_ORDINARIA,
    cuotaTotal, importeTotal,
    huellaAnterior: huellaAnterior || '',
    fechaHora,
  });

  return {
    IDVersion: IDVERSION,
    IDFactura: {
      IDEmisorFactura:        EMISOR.nif,
      NumSerieFactura:        numSerie,
      FechaExpedicionFactura: fechaExp,
    },
    NombreRazonEmisor:    EMISOR.nombre,
    TipoFactura:          TIPO_FACTURA_ORDINARIA,
    DescripcionOperacion: descripcionOperacion(factura),
    Destinatarios: [{
      NombreRazon: factura.cliente?.nombre || '',
      NIF:         factura.cliente?.nif || '',
    }],
    Desglose:     construirDesglose(factura),
    CuotaTotal:   cuotaTotal,
    ImporteTotal: importeTotal,
    Encadenamiento: esPrimero
      ? { PrimerRegistro: 'S' }
      : { RegistroAnterior: { Huella: huellaAnterior } },
    SistemaInformatico:       SISTEMA_INFORMATICO,
    FechaHoraHusoGenRegistro: fechaHora,
    TipoHuella:               TIPO_HUELLA,
    Huella:                   huella,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 6) CÓDIGO QR OFICIAL  (formato exacto AEAT)
// ─────────────────────────────────────────────────────────────────────────────

// Devuelve la URL que debe codificar el QR (ISO/IEC 18004 nivel M, 30–40 mm).
// Debe imprimirse en la factura junto a la leyenda "VERI*FACTU".
function contenidoQR(factura) {
  const base = ENTORNO.qr[ENTORNO.actual];
  const params = new URLSearchParams({
    nif:      EMISOR.nif,
    numserie: numSerieFactura(factura),
    fecha:    fechaExpedicion(factura.fecha),
    importe:  imp(factura.total),
  });
  return `${base}?${params.toString()}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// 7) GENERACIÓN DEL XML  (estructura RRSIF)
//    NOTA: los namespaces deben confirmarse contra los XSD oficiales descargados
//    de la AEAT antes de enviar a preproducción. La estructura sigue el esquema.
// ─────────────────────────────────────────────────────────────────────────────

const NS_SF   = 'https://www2.agenciatributaria.gob.es/static_files/common/internet/dep/aplicaciones/es/aeat/tikeV1.0/cont/ws/SuministroInformacion.xsd';
const NS_SFLR = 'https://www2.agenciatributaria.gob.es/static_files/common/internet/dep/aplicaciones/es/aeat/tikeV1.0/cont/ws/SuministroLR.xsd';

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function generarXMLRegistroAlta(r) {
  const enc = r.Encadenamiento.PrimerRegistro
    ? `<sf:PrimerRegistro>S</sf:PrimerRegistro>`
    : `<sf:RegistroAnterior><sf:Huella>${esc(r.Encadenamiento.RegistroAnterior.Huella)}</sf:Huella></sf:RegistroAnterior>`;

  const dest = r.Destinatarios.map(x =>
    `<sf:IDDestinatario><sf:NombreRazon>${esc(x.NombreRazon)}</sf:NombreRazon><sf:NIF>${esc(x.NIF)}</sf:NIF></sf:IDDestinatario>`
  ).join('');

  const desglose = r.Desglose.map(d =>
    `<sf:DetalleDesglose>` +
      `<sf:ClaveRegimen>${esc(d.ClaveRegimen)}</sf:ClaveRegimen>` +
      `<sf:CalificacionOperacion>${esc(d.CalificacionOperacion)}</sf:CalificacionOperacion>` +
      `<sf:TipoImpositivo>${esc(d.TipoImpositivo)}</sf:TipoImpositivo>` +
      `<sf:BaseImponibleOimporteNoSujeto>${esc(d.BaseImponibleOimporteNoSujeto)}</sf:BaseImponibleOimporteNoSujeto>` +
      `<sf:CuotaRepercutida>${esc(d.CuotaRepercutida)}</sf:CuotaRepercutida>` +
    `</sf:DetalleDesglose>`
  ).join('');

  const si = r.SistemaInformatico;
  return `<sf:RegistroAlta>` +
    `<sf:IDVersion>${esc(r.IDVersion)}</sf:IDVersion>` +
    `<sf:IDFactura>` +
      `<sf:IDEmisorFactura>${esc(r.IDFactura.IDEmisorFactura)}</sf:IDEmisorFactura>` +
      `<sf:NumSerieFactura>${esc(r.IDFactura.NumSerieFactura)}</sf:NumSerieFactura>` +
      `<sf:FechaExpedicionFactura>${esc(r.IDFactura.FechaExpedicionFactura)}</sf:FechaExpedicionFactura>` +
    `</sf:IDFactura>` +
    `<sf:NombreRazonEmisor>${esc(r.NombreRazonEmisor)}</sf:NombreRazonEmisor>` +
    `<sf:TipoFactura>${esc(r.TipoFactura)}</sf:TipoFactura>` +
    `<sf:DescripcionOperacion>${esc(r.DescripcionOperacion)}</sf:DescripcionOperacion>` +
    `<sf:Destinatarios>${dest}</sf:Destinatarios>` +
    `<sf:Desglose>${desglose}</sf:Desglose>` +
    `<sf:CuotaTotal>${esc(r.CuotaTotal)}</sf:CuotaTotal>` +
    `<sf:ImporteTotal>${esc(r.ImporteTotal)}</sf:ImporteTotal>` +
    `<sf:Encadenamiento>${enc}</sf:Encadenamiento>` +
    `<sf:SistemaInformatico>` +
      `<sf:NombreRazon>${esc(si.NombreRazon)}</sf:NombreRazon>` +
      `<sf:NIF>${esc(si.NIF)}</sf:NIF>` +
      `<sf:NombreSistemaInformatico>${esc(si.NombreSistemaInformatico)}</sf:NombreSistemaInformatico>` +
      `<sf:IdSistemaInformatico>${esc(si.IdSistemaInformatico)}</sf:IdSistemaInformatico>` +
      `<sf:Version>${esc(si.Version)}</sf:Version>` +
      `<sf:NumeroInstalacion>${esc(si.NumeroInstalacion)}</sf:NumeroInstalacion>` +
      `<sf:TipoUsoPosibleSoloVerifactu>${esc(si.TipoUsoPosibleSoloVerifactu)}</sf:TipoUsoPosibleSoloVerifactu>` +
      `<sf:TipoUsoPosibleMultiOT>${esc(si.TipoUsoPosibleMultiOT)}</sf:TipoUsoPosibleMultiOT>` +
      `<sf:IndicadorMultiplesOT>${esc(si.IndicadorMultiplesOT)}</sf:IndicadorMultiplesOT>` +
    `</sf:SistemaInformatico>` +
    `<sf:FechaHoraHusoGenRegistro>${esc(r.FechaHoraHusoGenRegistro)}</sf:FechaHoraHusoGenRegistro>` +
    `<sf:TipoHuella>${esc(r.TipoHuella)}</sf:TipoHuella>` +
    `<sf:Huella>${esc(r.Huella)}</sf:Huella>` +
  `</sf:RegistroAlta>`;
}

// Sobre de envío (uno o varios registros). Es lo que se manda por SOAP a la AEAT.
function generarSobreVerifactu(registrosAltaXml) {
  const registros = [].concat(registrosAltaXml)
    .map(x => `<sfLR:RegistroFactura>${x}</sfLR:RegistroFactura>`).join('');
  return `<?xml version="1.0" encoding="UTF-8"?>` +
    `<sfLR:RegFactuSistemaFacturacion xmlns:sfLR="${NS_SFLR}" xmlns:sf="${NS_SF}">` +
      `<sfLR:Cabecera>` +
        `<sf:ObligadoEmision>` +
          `<sf:NombreRazon>${esc(EMISOR.nombre)}</sf:NombreRazon>` +
          `<sf:NIF>${esc(EMISOR.nif)}</sf:NIF>` +
        `</sf:ObligadoEmision>` +
      `</sfLR:Cabecera>` +
      registros +
    `</sfLR:RegFactuSistemaFacturacion>`;
}

// ─────────────────────────────────────────────────────────────────────────────
// 8) API DE CONVENIENCIA  — una sola llamada por factura nueva
// ─────────────────────────────────────────────────────────────────────────────

// Devuelve todo lo necesario para dejar la factura "sellada" localmente,
// listo para enviar cuando exista certificado. NO envía nada.
function procesarFacturaNueva(factura, huellaAnterior = '', fecha = new Date()) {
  const registro = construirRegistroAlta(factura, huellaAnterior, fecha);
  const xml = generarXMLRegistroAlta(registro);
  return {
    huella:         registro.Huella,
    huellaAnterior: huellaAnterior || '',
    qr:             contenidoQR(factura),
    fechaHoraGen:   registro.FechaHoraHusoGenRegistro,
    estado:         'NO_ENVIADO',      // pasará a ENVIADO/ACEPTADO al integrar el envío
    registro,
    xml,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 9) ENVÍO A LA AEAT  —  PENDIENTE DE CERTIFICADO  (stub)
// ─────────────────────────────────────────────────────────────────────────────
/*
   Cuando dispongáis del certificado electrónico de representante de MYL
   (.pfx / .p12), el envío se implementa así:

     const https = require('https');
     const agent = new https.Agent({ pfx: fs.readFileSync('cert.pfx'), passphrase: '...' });
     // POST del sobre XML (generarSobreVerifactu) al endpoint SOAP:
     //   URL:      ENTORNO.ws[ENTORNO.actual]
     //   Headers:  Content-Type: text/xml; charset=utf-8  +  SOAPAction
     //   Body:     <soapenv:Envelope>…<soapenv:Body>{sobre}</soapenv:Body></soapenv:Envelope>
     //   Agent:    el https.Agent con el certificado (TLS mutuo)
     // Parsear la respuesta: EstadoEnvio = Correcto | ParcialmenteCorrecto | Incorrecto
     //   y guardar CSV / estado por registro.

   En modo VeriFactu NO hay que firmar el XML (el certificado del canal basta).
*/
async function enviarAAEAT(sobreXml, opciones = {}) {
  throw new Error(
    '[VeriFactu] Envío no disponible: falta el certificado electrónico de MYL. ' +
    'La huella, el registro, el QR y el XML ya se generan correctamente; ' +
    'solo resta conectar el certificado para transmitir a la AEAT.'
  );
}

// ─────────────────────────────────────────────────────────────────────────────
module.exports = {
  EMISOR, SISTEMA_INFORMATICO, ENTORNO,
  fechaExpedicion, fechaHoraHuso, numSerieFactura,
  calcularHuellaAlta, calcularHuellaAnulacion,
  construirRegistroAlta, contenidoQR,
  generarXMLRegistroAlta, generarSobreVerifactu,
  procesarFacturaNueva, enviarAAEAT,
};
