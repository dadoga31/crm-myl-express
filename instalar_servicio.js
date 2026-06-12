const { Service } = require('node-windows');
const path = require('path');

const svc = new Service({
    name: 'MYL Facturacion',
    description: 'Sistema de Facturación MYL - Servidor Express en red local',
    script: path.join(__dirname, 'servidor.js'),
    nodeOptions: [],
    workingDirectory: __dirname,
    wait: 2,         // Esperar 2 segundos entre reinicios (mínimo necesario)
    grow: 0,         // Sin crecimiento exponencial del tiempo de espera
    maxRestarts: 3   // Máximo 3 reinicios automáticos para evitar bucles
    // Sin allowServiceLogon para usar LocalSystem por defecto
});

svc.on('install', function () {
    svc.start();
    console.log('✅ Servicio instalado y arrancado correctamente.');
    console.log('   El servidor arrancará automáticamente con Windows.');
    console.log('   Los empleados pueden acceder desde su navegador.');
});

svc.on('alreadyinstalled', function () {
    console.log('⚠️  El servicio ya estaba instalado. Intentando arrancar...');
    svc.start();
});

svc.on('error', function (err) {
    console.error('❌ Error:', err);
});

svc.install();
