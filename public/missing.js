
function retirePallet() {
  if(!currentPalletDetailId) return;
  if(!confirm('¿Confirmar la retirada de estos palets? Se registrará la fecha de hoy como fecha de salida.')) return;
  pallets = pallets.map(p=>p.id===currentPalletDetailId ? {...p, status:'retirado', exit:gDate(0)} : p);
  closeModal('modal-pallet-detail');
  updateBadges();
  renderStorage();
  guardarDatos();
  setTimeout(()=>{ openPalletDetail(currentPalletDetailId); }, 100);
}

function changePalletLocation() {
  const p = pallets.find(x=>x.id===currentPalletDetailId);
  if(!p) return;
  document.getElementById('rel-zone').value = p.zone||'';
  document.getElementById('rel-row').value = p.row||'';
  document.getElementById('rel-pos').value = p.pos||'';
  closeModal('modal-pallet-detail');
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
    const overlay = document.createElement('div');
    overlay.id = 'pallet-receipt-modal';
    const img = document.getElementById('pallet-receipt-img');
    const dl  = document.getElementById('pallet-receipt-download-link');
    if(img) img.src = dataUrl;
    if(dl)  { dl.href = dataUrl; dl.download = `Resguardo_${p.code || 'Almacen'}.png`; }
    showView('pallet-receipt');
  });
}

function closePalletReceiptModal() {
  const m = document.getElementById('pallet-receipt-modal');
  if(m) m.remove();
}

function doPrintPalletReceipt() {
  const img = document.getElementById('pallet-receipt-img');
  if(!img) return;
  const w = window.open('', '_blank');
  w.document.write('<html><head><style>@page { margin: 0; size: auto; } body { margin: 0; display: flex; justify-content: center; align-items:flex-start; padding-top: 10px; background: white; }</style></head><body>');
  w.document.write('<img src="' + img.src + '" style="max-width:384px;width:100%;">');
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
    c.fillStyle = '#000'; c.font = `700 18px ${FONT}`;
    c.textAlign = 'center';
    c.fillText(p.code, W/2, y + 16); y += 28;
    c.textAlign = 'left';
    dashedLine();

    field('Cliente',         cl ? cl.name : '—');
    field('Entrada',         p.entry);
    field('Ubicación',       `ZONA ${p.zone} · PAS ${p.row} · HUECO ${p.pos}`);
    field('Contenido',       `${p.qty}x ${p.contents}`);
    field('Tarifa Asignada', `${Number(p.rate||1.5).toFixed(2)} €/día`);
    if (p.notes) field('Notas', p.notes);
    dashedLine();

    try { c.drawImage(bcImg, MARGIN, y, BW, BH); } catch(e) {
      c.fillStyle = '#EEE'; c.fillRect(MARGIN, y, BW, BH);
    }
    y += BH + 6;
    c.font = `500 10px ${FONT}`; c.fillStyle = '#000';
    c.textAlign = 'center';
    c.fillText(p.code, W/2, y + 9); y += 18;
    c.textAlign = 'left';
    dashedLine();

    c.font = `400 9px ${FONT}`; c.fillStyle = '#888';
    c.textAlign = 'center';
    c.fillText(new Date().toLocaleString('es-ES'), W/2, y + 9); y += 14;
    c.fillText('Myl Express Logística S.L.', W/2, y + 9); y += 14;
    c.fillText('Conserve este resguardo', W/2, y + 9); y += 20;
    c.textAlign = 'left';
    return y;
  }

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
    if(!raw) return;
    const txt = raw.toUpperCase().trim();
    showScanToast('CÓDIGO: ' + txt, 'info');
}

function showScanToast(msg, type) {
    const d = document.createElement('div');
    d.style.cssText = `position:fixed;bottom:20px;right:20px;padding:12px 24px;border-radius:8px;font-family:var(--sans);font-size:13px;font-weight:600;color:#fff;z-index:999999;box-shadow:0 4px 12px rgba(0,0,0,0.15);transition:opacity 0.3s;`;
    if(type==='ok') d.style.background = '#10b981';
    else if(type==='info') d.style.background = '#3b82f6';
    else d.style.background = '#1e293b';
    d.textContent = msg;
    document.body.appendChild(d);
    setTimeout(() => { d.style.opacity = '0'; setTimeout(()=>d.remove(),300); }, 3000);
}

function closePrintModal() {
    const el = document.getElementById('modal-print-docs');
    if(el) el.classList.add('hidden');
}

function printReceipt() {
    printDoc('doc-preview-receipt', 'receipt');
}

function printDoc(imgId, format) {
    const img = document.getElementById(imgId);
    if(!img || !img.src) return;
    const w = window.open('', '_blank');
    w.document.write('<html><head><style>@page { margin: 0; size: auto; } body { margin: 0; display: flex; justify-content: center; align-items:flex-start; padding-top: 10px; background: white; }</style></head><body>');
    w.document.write('<img src="' + img.src + '" style="max-width:100%;">');
    w.document.write('</body></html>');
    w.document.close();
    setTimeout(() => { w.focus(); w.print(); w.close(); closePrintModal(); }, 300);
}

function renderCurrentViewLI() {
    const id = document.getElementById('li-main')?.dataset?.view || 'shipments';
    if(id.includes('shipments')) { if(typeof renderShipments==='function') renderShipments(); }
    else if(id.includes('storage')) { if(typeof renderStorage==='function') renderStorage(); }
    else if(id.includes('clients')) { if(typeof renderClients==='function') renderClients(); }
    else if(id.includes('partners')) { if(typeof renderPartners==='function') renderPartners(); }
    if(typeof updateBadges === 'function') updateBadges();
}

document.addEventListener('keydown', function(e) {
    if(e.key === 'F9') {
        const p = prompt('Simular Escaneo BD:');
        if(p) processScan(p);
    }
});
