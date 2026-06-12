const { Service } = require('node-windows');
const path = require('path');

const svc = new Service({
    name: 'MYL Facturacion',
    description: 'Sistema de Facturación MYL - Servidor Express en red local',
    script: path.join(__dirname, 'servidor.js'),
    workingDirectory: __dirname
});

svc.on('uninstall', function () {
    console.log('✅ Servicio desinstalado. El servidor ya no arrancará automáticamente.');
});

svc.on('error', function (err) {
    console.error('❌ Error al desinstalar:', err);
});

svc.uninstall();
