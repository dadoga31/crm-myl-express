import re

with open("public/logistica.js", "r", encoding="utf-8") as f:
    text = f.read()

# Restore updateStatus
text = re.sub(
    r"function updateStatus\(id, status\) \{\(\);\s*guardarDatos\(\);\s*\}",
    "function updateStatus(id, status) {\n    shipments = shipments.map(s => s.id===id ? {...s,status} : s);\n    renderShipTable();\n    guardarDatos();\n}",
    text
)

# Restore saveShipment
text = re.sub(
    r"function saveShipment\(\) \{\(newShipment\.id\);\s*guardarDatos\(\);\s*\}",
    """function saveShipment() {
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
  }""",
    text
)

# Restore updateStatusFromDetail
text = re.sub(
    r"function updateStatusFromDetail\(\) \{\(\);\s*guardarDatos\(\);\s*\}",
    "function updateStatusFromDetail() {\n    const status = document.getElementById('dt-status-select').value;\n    shipments = shipments.map(s => s.id===currentDetailId ? {...s,status} : s);\n    renderShipTable();\n    guardarDatos();\n  }",
    text
)

# Restore savePartner
text = re.sub(
    r"function savePartner\(\) \{\(\);\s*guardarDatos\(\);\s*\}",
    """function savePartner() {
    const name=document.getElementById('pt-name').value.trim();
    if(!name){alert('Nombre de empresa obligatorio.');return;}
    const data={company_name:name,contact_email:document.getElementById('pt-email').value,phone:document.getElementById('pt-phone').value,service_zones:document.getElementById('pt-zones').value,base_rate:parseFloat(document.getElementById('pt-rate').value)||0,active:document.getElementById('pt-active').checked};
    if(editPartnerId) partners=partners.map(p=>p.id===editPartnerId?{...data,id:editPartnerId}:p);
    else partners=[...partners,{...data,id:'p'+genId()}];
    closeModal('modal-partner'); renderPartners(); updateBadges();
    guardarDatos();
  }""",
    text
)

# Restore selectStatus
text = re.sub(
    r"function selectStatus\(shipId, status, e\) \{\(\);\s*guardarDatos\(\);\s*\}",
    """function selectStatus(shipId, status, e) {
    e.stopPropagation();
    shipments = shipments.map(s => s.id === shipId ? {...s, status} : s);
    closeAllDropdowns();
    renderShipTable();
    renderKPIs();
    guardarDatos();
  }""",
    text
)

# Restore savePallet
text = re.sub(
    r"function savePallet\(\) \{\(\);\s*guardarDatos\(\);\s*\}",
    """function savePallet() {
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
  }""",
    text
)

with open("public/logistica.js", "w", encoding="utf-8") as f:
    f.write(text)

print("Restoration complete")
