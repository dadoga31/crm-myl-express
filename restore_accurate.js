const fs = require('fs');
let text = fs.readFileSync('public/logistica.js', 'utf8');

const broken_updateStatus = "function updateStatus(id, status) {();\n  guardarDatos();\n}";
const fixed_updateStatus = `function updateStatus(id, status) {
  shipments = shipments.map(s => s.id===id ? {...s,status} : s);
  renderShipTable();
  guardarDatos();
}`;
text = text.replace(broken_updateStatus, fixed_updateStatus);
text = text.replace("function updateStatus(id, status) {();\n    guardarDatos();\n  }", fixed_updateStatus);

const broken_saveShipment = "function saveShipment() {(newShipment.id);\n  guardarDatos();\n}";
const fixed_saveShipment = `function saveShipment() {
  const cid=document.getElementById('sh-client').value;
  const pid=document.getElementById('sh-partner').value;
  const w=document.getElementById('sh-weight').value;
  if(!cid||!pid||!w){alert('Cliente, subcontrata y peso son obligatorios.');return;}
  const newShipment = {
    id:'s'+genId(), tracking:'LOG-'+genId(),
    client_id:cid, partner_id:pid, status:'Recogido',
    weight:parseFloat(w),
    dims:document.getElementById('sh-dims').value||'—',
    units:parseInt(document.getElementById('sh-units').value)||1,
    contents:document.getElementById('sh-contents').value||'—',
    origin:document.getElementById('sh-origin').value||'—',
    dest:document.getElementById('sh-dest').value||'—',
    created:gDate(0)
  };
  shipments = [...shipments, newShipment];
  closeModal('modal-shipment');
  updateBadges();
  renderShipments();
  showReceiptModal(newShipment.id);
  guardarDatos();
}`;
text = text.replace(broken_saveShipment, fixed_saveShipment);
text = text.replace("function saveShipment() {(newShipment.id);\n    guardarDatos();\n  }", fixed_saveShipment);

const broken_updateStatusFromDetail = "function updateStatusFromDetail() {();\n  guardarDatos();\n}";
const fixed_updateStatusFromDetail = `function updateStatusFromDetail() {
  const status = document.getElementById('dt-status-select').value;
  shipments = shipments.map(s => s.id===currentDetailId ? {...s,status} : s);
  renderShipTable();
  guardarDatos();
}`;
text = text.replace(broken_updateStatusFromDetail, fixed_updateStatusFromDetail);
text = text.replace("function updateStatusFromDetail() {();\n    guardarDatos();\n  }", fixed_updateStatusFromDetail);

const broken_savePartner = "function savePartner() {();\n  guardarDatos();\n}";
const fixed_savePartner = `function savePartner() {
  const name=document.getElementById('pt-name').value.trim();
  if(!name){alert('Nombre de empresa obligatorio.');return;}
  const data={company_name:name,contact_email:document.getElementById('pt-email').value,phone:document.getElementById('pt-phone').value,service_zones:document.getElementById('pt-zones').value,base_rate:parseFloat(document.getElementById('pt-rate').value)||0,active:document.getElementById('pt-active').checked};
  if(editPartnerId) partners=partners.map(p=>p.id===editPartnerId?{...data,id:editPartnerId}:p);
  else partners=[...partners,{...data,id:'p'+genId()}];
  closeModal('modal-partner'); renderPartners(); updateBadges();
  guardarDatos();
}`;
text = text.replace(broken_savePartner, fixed_savePartner);
text = text.replace("function savePartner() {();\n    guardarDatos();\n  }", fixed_savePartner);

const broken_selectStatus = "function selectStatus(shipId, status, e) {();\n  guardarDatos();\n}";
const fixed_selectStatus = `function selectStatus(shipId, status, e) {
  e.stopPropagation();
  shipments = shipments.map(s => s.id === shipId ? {...s, status} : s);
  closeAllDropdowns();
  renderShipTable();
  renderKPIs();
  guardarDatos();
}`;
text = text.replace(broken_selectStatus, fixed_selectStatus);
text = text.replace("function selectStatus(shipId, status, e) {();\n    guardarDatos();\n  }", fixed_selectStatus);

const broken_savePallet = "function savePallet() {();\n  guardarDatos();\n}";
const fixed_savePallet = `function savePallet() {
  const clientId = document.getElementById('plt-client').value;
  const zone     = document.getElementById('plt-zone').value;
  const row      = document.getElementById('plt-row').value.trim().padStart(2,'0');
  const pos      = document.getElementById('plt-pos').value.trim().padStart(2,'0');
  const qty      = parseInt(document.getElementById('plt-qty').value)||1;
  const contents = document.getElementById('plt-contents').value.trim();
  const rate     = parseFloat(document.getElementById('plt-rate').value)||1.50;

  if(!clientId||!zone||!row||!pos||!contents) {
    alert('Completa los campos obligatorios: cliente, ubicación y contenido.');
    return;
  }
  const pallet = {
    id: genId(), code: palletCode(), status: 'almacenado',
    client_id: clientId, zone, row, pos, qty, contents, rate, entry: gDate(0), exit: null
  };
  pallets = [pallet, ...pallets];
  closeModal('modal-new-pallet');
  updateBadges();
  renderStorage();
  guardarDatos();
}`;
text = text.replace(broken_savePallet, fixed_savePallet);
text = text.replace("function savePallet() {();\n    guardarDatos();\n  }", fixed_savePallet);

fs.writeFileSync('public/logistica.js', text, 'utf8');
console.log('Restoration complete');
