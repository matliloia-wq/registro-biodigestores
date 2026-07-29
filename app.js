(function(){
  const $ = (id) => document.getElementById(id);
  let reactors = [];
  let currentReactor = null;
  let currentEntries = [];
  let currentConfig = null;
  let configEditing = false;
  let editingFecha = null;

  const FIELD_IDS = ['fecha','hora','temp','alim','alimu','ciclos','voldia','ch4','h2s','co2','o2','n2',
    'ph','masa','vol1','voltotal','cac','hac','obs'];
  const NUM_FIELDS = ['temp','alim','ciclos','voldia','ch4','h2s','co2','o2','n2','ph','masa','vol1','voltotal','cac','hac'];
  const HEADERS = ['Fecha','Dia','Hora','Temp (C)','Alimentacion','Unidad Alim.','Ciclos','mL por ciclo',
    'Vol. Biogas diario (mL)','Vol. Biogas acumulado (mL)','CH4 (%)','H2S (ppm)','CO2 (%)','O2 (%)','N2 (%)',
    'pH digerido','Masa muestra (g)','Vol1 a pH 5.1 (mL)','VolTotal a pH 4.3 (mL)','Vol2 (mL)','Cac (N)',
    'TAC (mg CaCO3/L)','FOS (mg HAc/L)','FOS/TAC','HAc (mg/L)','Observaciones'];

  function fieldEl(name){ return $('f_' + name); }
  function todayStr(){ return new Date().toISOString().slice(0,10); }
  function nowTimeStr(){ return new Date().toTimeString().slice(0,5); }
  function n(v){ return (v === '' || v === null || v === undefined) ? NaN : Number(v); }

  // ---------- IndexedDB ----------
  const DB_NAME = 'registro_biodigestores_db';
  const STORE_NAME = 'kv';
  let dbPromise = null;
  function openDB(){
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) db.createObjectStore(STORE_NAME, { keyPath: 'key' });
      };
      req.onsuccess = (e) => resolve(e.target.result);
      req.onerror = (e) => reject(e.target.error);
    });
    return dbPromise;
  }
  async function idbGet(key){
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const req = tx.objectStore(STORE_NAME).get(key);
      req.onsuccess = () => resolve(req.result ? req.result.value : null);
      req.onerror = () => reject(req.error);
    });
  }
  async function idbSet(key, value){
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const req = tx.objectStore(STORE_NAME).put({ key, value });
      req.onsuccess = () => resolve(true);
      req.onerror = () => reject(req.error);
    });
  }

  async function loadReactors(){
    const raw = await idbGet('reactors');
    reactors = raw ? JSON.parse(raw) : [];
  }
  async function persistReactors(){ await idbSet('reactors', JSON.stringify(reactors)); }
  async function loadRegister(reactorId){
    const raw = await idbGet('register:' + reactorId);
    return raw ? JSON.parse(raw) : [];
  }
  async function persistRegister(reactorId, entries){
    await idbSet('register:' + reactorId, JSON.stringify(entries));
  }
  async function loadConfig(reactorId){
    const raw = await idbGet('config:' + reactorId);
    return raw ? JSON.parse(raw) : null;
  }
  async function persistConfig(reactorId, cfg){
    await idbSet('config:' + reactorId, JSON.stringify(cfg));
  }

  function showStatus(msg){
    const b = $('statusBanner');
    b.textContent = msg;
    b.classList.add('show');
    clearTimeout(showStatus._t);
    showStatus._t = setTimeout(() => b.classList.remove('show'), 6000);
  }

  // ---------- reactores ----------
  function renderTabs(){
    const row = $('reactorRow');
    row.innerHTML = '';
    reactors.forEach(r => {
      const b = document.createElement('button');
      b.className = 'tab' + (r === currentReactor ? ' active' : '');
      b.textContent = r;
      b.onclick = () => selectReactor(r);
      row.appendChild(b);
    });
    const add = document.createElement('button');
    add.className = 'tab-add';
    add.textContent = '+ nuevo reactor';
    add.onclick = addReactor;
    row.appendChild(add);
  }

  async function addReactor(){
    const id = prompt('ID del reactor nuevo (ej. BD3):');
    if (!id) return;
    const clean = id.trim();
    if (!clean) return;
    if (reactors.includes(clean)){ alert('Ese reactor ya existe.'); return; }
    reactors.push(clean);
    await persistReactors();
    renderTabs();
    await selectReactor(clean);
  }

  async function selectReactor(id){
    currentReactor = id;
    configEditing = false;
    renderTabs();
    currentEntries = await loadRegister(id);
    currentConfig = await loadConfig(id);
    $('histReactor').textContent = id;
    $('gaugeReactor').textContent = id;
    renderConfigPanel();
    applyMedidorVisibility();
    clearForm();
    renderTable();
    renderGauge();
  }

  // ---------- configuración fija del ensayo ----------
  function renderConfigPanel(){
    const p = $('configPanel');
    if (!currentConfig && !configEditing){
      p.innerHTML = `
        <div class="panel-head"><h2>Configuración del ensayo</h2></div>
        <p class="config-empty">Todavía no configuraste este reactor (botella, inóculo, medidor, etc.).</p>
        <div class="form-actions"><button id="cfgStartBtn" class="link-btn" style="text-decoration:none;background:var(--accent);color:#211405;border-radius:8px;padding:10px 16px;font-weight:700;">Configurar ensayo</button></div>
      `;
      $('cfgStartBtn').onclick = () => { configEditing = true; renderConfigPanel(); };
      return;
    }
    if (!configEditing){
      const c = currentConfig;
      p.innerHTML = `
        <div class="panel-head">
          <h2>Configuración del ensayo</h2>
          <button class="link-btn" id="cfgEditBtn">Editar</button>
        </div>
        <div class="config-summary">
          <div><b>Botella:</b> ${c.volBotella || '–'} mL &nbsp; <b>Inóculo:</b> ${c.inoculo || '–'} ${c.inoculoUnidad || ''}</div>
          <div><b>pH inicial:</b> ${c.phInicial || '–'} &nbsp; <b>Temp. incubación:</b> ${c.tempIncubacion || '–'} °C</div>
          <div><b>Medidor de gas:</b> ${c.medidor === 'si' ? `Sí (${c.mlPorCiclo || '–'} mL/ciclo)` : 'No'} &nbsp; <b>Cac:</b> ${c.cac || '–'} N</div>
          ${c.notas ? `<div><b>Notas:</b> ${String(c.notas).replace(/</g,'&lt;')}</div>` : ''}
        </div>
      `;
      $('cfgEditBtn').onclick = () => { configEditing = true; renderConfigPanel(); };
      return;
    }
    const c = currentConfig || {};
    p.innerHTML = `
      <div class="panel-head"><h2>Configuración del ensayo</h2></div>
      <p class="hint">Se carga una vez y queda fija para todo el ensayo, hasta que la vuelvas a editar.</p>
      <div class="field-grid">
        <div class="field"><label>Volumen de botella (mL)</label><input type="number" step="1" id="c_volBotella"></div>
        <div class="field">
          <label>Inóculo</label>
          <div class="field-inline">
            <input type="number" step="0.1" id="c_inoculo">
            <select id="c_inoculoUnidad"><option value="mL">mL</option><option value="g">g</option></select>
          </div>
        </div>
        <div class="field"><label>pH inicial</label><input type="number" step="0.01" id="c_phInicial"></div>
        <div class="field"><label>Temp. incubación (°C)</label><input type="number" step="0.1" id="c_tempIncubacion"></div>
        <div class="field"><label>¿Usa medidor de gas?</label>
          <select id="c_medidor"><option value="no">No</option><option value="si">Sí</option></select>
        </div>
        <div class="field"><label>mL por ciclo (si usa medidor)</label><input type="number" step="0.01" id="c_mlPorCiclo"></div>
        <div class="field"><label>Cac — concentración ácido (N)</label><input type="number" step="0.001" id="c_cac"></div>
      </div>
      <div class="field-grid" style="margin-top:10px;">
        <div class="field wide"><label>Notas del ensayo</label><textarea id="c_notas"></textarea></div>
      </div>
      <div class="form-actions">
        <button id="saveConfigBtn">Guardar configuración</button>
        <button id="cancelConfigBtn">Cancelar</button>
      </div>
    `;
    $('c_volBotella').value = c.volBotella || '';
    $('c_inoculo').value = c.inoculo || '';
    $('c_inoculoUnidad').value = c.inoculoUnidad || 'mL';
    $('c_phInicial').value = c.phInicial || '';
    $('c_tempIncubacion').value = c.tempIncubacion || '';
    $('c_medidor').value = c.medidor || 'no';
    $('c_mlPorCiclo').value = c.mlPorCiclo || '';
    $('c_cac').value = c.cac || '';
    $('c_notas').value = c.notas || '';

    $('saveConfigBtn').onclick = saveConfig;
    $('cancelConfigBtn').onclick = () => { configEditing = false; renderConfigPanel(); };
  }

  async function saveConfig(){
    const cfg = {
      volBotella: $('c_volBotella').value,
      inoculo: $('c_inoculo').value,
      inoculoUnidad: $('c_inoculoUnidad').value,
      phInicial: $('c_phInicial').value,
      tempIncubacion: $('c_tempIncubacion').value,
      medidor: $('c_medidor').value,
      mlPorCiclo: $('c_mlPorCiclo').value,
      cac: $('c_cac').value,
      notas: $('c_notas').value,
    };
    currentConfig = cfg;
    await persistConfig(currentReactor, cfg);
    configEditing = false;
    renderConfigPanel();
    applyMedidorVisibility();
    clearForm();
    showStatus('Configuración del ensayo guardada.');
  }

  function applyMedidorVisibility(){
    const usaMedidor = currentConfig && currentConfig.medidor === 'si';
    $('field_ciclos').style.display = usaMedidor ? '' : 'none';
    $('field_voldia').style.display = usaMedidor ? 'none' : '';
    $('ciclosNote').textContent = usaMedidor && currentConfig.mlPorCiclo
      ? `× ${currentConfig.mlPorCiclo} mL/ciclo (según configuración) = volumen del día`
      : '';
  }

  // ---------- cálculos ----------
  function diffDays(startStr, dateStr){
    const a = new Date(startStr + 'T00:00:00');
    const b = new Date(dateStr + 'T00:00:00');
    return Math.round((b - a) / 86400000);
  }

  function computeRows(entries){
    const sorted = [...entries].sort((a,b) => a.fecha.localeCompare(b.fecha));
    const start = sorted.length ? sorted[0].fecha : null;
    let cum = 0;
    return sorted.map(e => {
      if (e.voldia !== '' && e.voldia !== null && e.voldia !== undefined && !isNaN(e.voldia)){
        cum += Number(e.voldia);
      }
      return { ...e, dia: start ? diffDays(start, e.fecha) : '', volacum: cum };
    });
  }

  // Formulas Nordmann (FOS-TAC_Español.pdf)
  function computeStability(masa, vol1, voltotal, cac){
    const mMasa = n(masa), mVol1 = n(vol1), mVolTotal = n(voltotal), mCac = n(cac);
    const out = { vol2: '', tac: '', fos: '', fostac: '' };
    if (!isNaN(mVol1) && !isNaN(mVolTotal)) out.vol2 = mVolTotal - mVol1;
    if (!isNaN(mVol1) && !isNaN(mCac) && !isNaN(mMasa) && mMasa !== 0){
      out.tac = (mVol1 * mCac * 50000) / mMasa;
    }
    if (out.vol2 !== '' && !isNaN(mCac) && !isNaN(mMasa) && mMasa !== 0){
      out.fos = (((out.vol2 * mCac * 332) / mMasa) - 0.15) * 500;
    }
    if (out.fos !== '' && out.tac !== '' && Number(out.tac) !== 0){
      out.fostac = out.fos / out.tac;
    }
    return out;
  }

  function fmt(v, decimals){
    if (v === '' || v === null || v === undefined || (typeof v === 'number' && isNaN(v))) return '';
    if (typeof v === 'number' && decimals !== undefined) return v.toFixed(decimals);
    return v;
  }

  function updateStabilityPreview(){
    const s = computeStability(fieldEl('masa').value, fieldEl('vol1').value, fieldEl('voltotal').value, fieldEl('cac').value);
    $('stabilityPreview').textContent =
      `Vol2 ${fmt(s.vol2,2) || '–'} mL · TAC ${fmt(s.tac,0) || '–'} · FOS ${fmt(s.fos,0) || '–'} · FOS/TAC ${fmt(s.fostac,3) || '–'}`;
  }

  // ---------- tabla / gauge ----------
  function renderTable(){
    const rows = computeRows(currentEntries);
    const body = $('regBody');
    body.innerHTML = '';
    $('emptyState').style.display = rows.length ? 'none' : 'block';
    rows.forEach(r => {
      const tr = document.createElement('tr');
      if (r.fecha === editingFecha) tr.classList.add('editing-row');
      tr.ondblclick = () => loadEntryIntoForm(r.fecha);
      tr.innerHTML = `
        <td>${r.fecha}</td>
        <td>${fmt(r.dia)}</td>
        <td>${fmt(r.hora)}</td>
        <td>${fmt(r.temp)}</td>
        <td>${fmt(r.alim)}${r.alim !== '' && r.alim !== undefined ? ' ' + (r.alimu || 'mL') : ''}</td>
        <td>${fmt(r.ciclos)}</td>
        <td>${fmt(r.voldia)}</td>
        <td>${fmt(r.volacum,1)}</td>
        <td>${fmt(r.ch4)}</td>
        <td>${fmt(r.h2s)}</td>
        <td>${fmt(r.co2)}</td>
        <td>${fmt(r.o2)}</td>
        <td>${fmt(r.n2)}</td>
        <td>${fmt(r.ph)}</td>
        <td>${fmt(r.masa)}</td>
        <td>${fmt(r.vol1)}</td>
        <td>${fmt(r.voltotal)}</td>
        <td>${fmt(r.vol2,2)}</td>
        <td>${fmt(r.cac)}</td>
        <td>${fmt(r.tac,0)}</td>
        <td>${fmt(r.fos,0)}</td>
        <td>${fmt(r.fostac,3)}</td>
        <td>${fmt(r.hac)}</td>
        <td class="obs">${r.obs ? String(r.obs).replace(/</g,'&lt;') : ''}</td>
        <td>
          <button class="edit-btn" title="Editar" data-fecha="${r.fecha}">✎</button>
          <button class="del-btn" title="Borrar" data-fecha="${r.fecha}">✕</button>
        </td>
      `;
      body.appendChild(tr);
    });
    body.querySelectorAll('.edit-btn').forEach(btn => {
      btn.onclick = (ev) => { ev.stopPropagation(); loadEntryIntoForm(btn.dataset.fecha); };
    });
    body.querySelectorAll('.del-btn').forEach(btn => {
      btn.onclick = (ev) => { ev.stopPropagation(); deleteEntry(btn.dataset.fecha); };
    });
    renderCards(rows);
  }

  // Vista de tarjetas: es la que se muestra en celular, donde la tabla no entra.
  // Usa las mismas filas ya calculadas, así nunca se desincroniza de la tabla.
  function renderCards(rows){
    const wrap = $('regCards');
    if (!wrap) return;
    wrap.innerHTML = '';
    rows.forEach(r => {
      const card = document.createElement('div');
      card.className = 'card' + (r.fecha === editingFecha ? ' editing-row' : '');

      const items = [
        ['Vol día', fmt(r.voldia)],
        ['Acum.', fmt(r.volacum, 1)],
        ['CH4 %', fmt(r.ch4)],
        ['pH', fmt(r.ph)],
        ['FOS/TAC', fmt(r.fostac, 3)],
        ['Temp', fmt(r.temp)],
      ].map(([k, v]) => `<div class="card-item"><span class="k">${k}</span><span class="v">${v !== '' ? v : '–'}</span></div>`).join('');

      card.innerHTML = `
        <div class="card-head">
          <span class="card-date">${r.fecha}</span>
          <span class="card-day">${r.dia !== '' ? 'Día ' + r.dia : ''}</span>
        </div>
        <div class="card-grid">${items}</div>
        ${r.obs ? `<div class="card-obs">${String(r.obs).replace(/</g, '&lt;')}</div>` : ''}
        <div class="card-actions">
          <button class="card-edit" data-fecha="${r.fecha}">Editar</button>
          <button class="card-del" data-fecha="${r.fecha}">Borrar</button>
        </div>
      `;
      wrap.appendChild(card);
    });
    wrap.querySelectorAll('.card-edit').forEach(btn => {
      btn.onclick = (ev) => { ev.stopPropagation(); loadEntryIntoForm(btn.dataset.fecha); };
    });
    wrap.querySelectorAll('.card-del').forEach(btn => {
      btn.onclick = (ev) => { ev.stopPropagation(); deleteEntry(btn.dataset.fecha); };
    });
  }

  function renderGauge(){
    const rows = computeRows(currentEntries);
    const last = rows.length ? rows[rows.length - 1] : null;
    const vol = last ? last.volacum : 0;
    $('gaugeVol').textContent = rows.length ? vol.toLocaleString('es-AR', {maximumFractionDigits:0}) : '–';
    $('gaugeSub').textContent = rows.length
      ? (rows.length + ' registro' + (rows.length === 1 ? '' : 's') + ' · último: ' + last.fecha)
      : 'Sin registros todavía';
    const arc = $('gaugeArc');
    const circumference = 226;
    const scale = Math.max(vol, 1);
    const magnitude = Math.pow(10, Math.max(0, Math.floor(Math.log10(scale))));
    const pct = Math.min(1, vol / (magnitude * 10));
    arc.setAttribute('stroke-dashoffset', String(circumference * (1 - pct)));
  }

  async function deleteEntry(fecha){
    if (!confirm('¿Borrar el registro del ' + fecha + '?')) return;
    currentEntries = currentEntries.filter(e => e.fecha !== fecha);
    await persistRegister(currentReactor, currentEntries);
    renderTable();
    renderGauge();
  }

  function loadEntryIntoForm(fecha){
    const e = currentEntries.find(x => x.fecha === fecha);
    if (!e) return;
    editingFecha = fecha;
    FIELD_IDS.forEach(name => { fieldEl(name).value = e[name] !== undefined && e[name] !== null ? e[name] : ''; });
    updateStabilityPreview();
    renderTable();
    $('formMsg').textContent = 'Editando el registro del ' + fecha + '. Guardar va a reemplazarlo, o "Limpiar formulario" para cancelar.';
    window.scrollTo({top: document.querySelector('.gauge-panel').offsetTop - 10, behavior:'smooth'});
  }

  function clearForm(){
    editingFecha = null;
    FIELD_IDS.forEach(name => { fieldEl(name).value = ''; });
    fieldEl('fecha').value = todayStr();
    fieldEl('hora').value = nowTimeStr();
    fieldEl('alimu').value = 'mL';
    if (currentConfig && currentConfig.cac) fieldEl('cac').value = currentConfig.cac;
    updateStabilityPreview();
    $('formMsg').textContent = '';
    if (currentEntries) renderTable();
  }

  function readForm(){
    const entry = {};
    FIELD_IDS.forEach(name => {
      const raw = fieldEl(name).value;
      entry[name] = (NUM_FIELDS.includes(name) && raw !== '') ? Number(raw) : raw;
    });
    return entry;
  }

  async function saveEntry(){
    if (!currentReactor){ alert('Elegí o creá un reactor primero.'); return; }
    const entry = readForm();
    if (!entry.fecha){ alert('La fecha es obligatoria.'); return; }

    const usaMedidor = currentConfig && currentConfig.medidor === 'si';
    if (usaMedidor){
      const mlpc = Number(currentConfig.mlPorCiclo || 0);
      entry.mlporciclo = mlpc;
      entry.voldia = (entry.ciclos !== '' && !isNaN(entry.ciclos)) ? (Number(entry.ciclos) * mlpc) : '';
    } else {
      entry.ciclos = '';
      entry.mlporciclo = '';
      // entry.voldia ya viene del campo de volumen directo
    }

    const s = computeStability(entry.masa, entry.vol1, entry.voltotal, entry.cac);
    entry.vol2 = s.vol2;
    entry.tac = s.tac;
    entry.fos = s.fos;
    entry.fostac = s.fostac;

    const idx = currentEntries.findIndex(e => e.fecha === entry.fecha);
    if (idx >= 0) currentEntries[idx] = entry; else currentEntries.push(entry);
    await persistRegister(currentReactor, currentEntries);
    renderTable();
    renderGauge();
    $('formMsg').textContent = 'Guardado: ' + entry.fecha + (idx >= 0 ? ' (reemplazado)' : '');
    clearForm();
  }

  // ---------- exportar ----------
  // ---------- configuración: mapeo compartido export/import ----------
  const CONFIG_FIELDS = [
    ['Volumen de botella (mL)', 'volBotella'],
    ['Inóculo (cantidad)', 'inoculo'],
    ['Inóculo (unidad)', 'inoculoUnidad'],
    ['pH inicial', 'phInicial'],
    ['Temp. incubación (C)', 'tempIncubacion'],
    ['Medidor de gas (si/no)', 'medidor'],
    ['mL por ciclo', 'mlPorCiclo'],
    ['Cac (N)', 'cac'],
    ['Notas', 'notas'],
  ];

  function configRows(reactorId, cfg){
    const c = cfg || {};
    const rows = [[`Configuración del ensayo — ${reactorId}`]];
    CONFIG_FIELDS.forEach(([label, field]) => {
      rows.push([label, c[field] !== undefined && c[field] !== null ? c[field] : '']);
    });
    rows.push([]);
    return rows;
  }

  function exportToExcel(){
    if (!reactors.length){ alert('No hay reactores cargados todavía.'); return; }
    const build = async () => {
      const wb = XLSX.utils.book_new();
      let anySheet = false;
      for (const r of reactors){
        const entries = await loadRegister(r);
        const cfg = await loadConfig(r);
        const rows = computeRows(entries);
        if (!rows.length && !cfg) continue;
        anySheet = true;
        const aoa = [...configRows(r, cfg), HEADERS];
        rows.forEach(row => {
          aoa.push([row.fecha, row.dia, row.hora, row.temp, row.alim, (row.alimu || ''),
            row.ciclos, row.mlporciclo, row.voldia, row.volacum,
            row.ch4, row.h2s, row.co2, row.o2, row.n2,
            row.ph, row.masa, row.vol1, row.voltotal, row.vol2, row.cac,
            row.tac, row.fos, row.fostac, row.hac, row.obs]);
        });
        const ws = XLSX.utils.aoa_to_sheet(aoa);
        ws['!cols'] = HEADERS.map(() => ({ wch: 14 }));
        XLSX.utils.book_append_sheet(wb, ws, r.slice(0,31));
      }
      if (!anySheet){ alert('Todavía no hay nada cargado en ningún reactor.'); return; }
      XLSX.writeFile(wb, `Registro_Diario_Biodigestores_${todayStr()}.xlsx`);
    };
    build();
  }

  // ---------- importar ----------
  const RAW_COL_INDEX = { fecha:0, hora:2, temp:3, alim:4, alimu:5, ciclos:6, mlporciclo:7, voldia:8,
    ch4:10, h2s:11, co2:12, o2:13, n2:14, ph:15, masa:16, vol1:17, voltotal:18, vol2:19, cac:20,
    tac:21, fos:22, fostac:23, hac:24, obs:25 };

  function cellToEntryValue(name, val){
    if (val === undefined || val === null || val === '') return '';
    if (NUM_FIELDS.includes(name) || ['mlporciclo','vol2','tac','fos','fostac'].includes(name)){
      const num = Number(val);
      return isNaN(num) ? '' : num;
    }
    return String(val);
  }

  async function importFromExcel(file){
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf, { type: 'array' });
    let reactorsFound = 0, rowsFound = 0, configsFound = 0;

    for (const sheetName of wb.SheetNames){
      const sheet = wb.Sheets[sheetName];
      const aoa = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true, defval: '' });
      const headerRowIdx = aoa.findIndex(row => String(row[0] || '').trim().toLowerCase() === 'fecha');
      if (headerRowIdx === -1) continue; // no es una hoja de reactor de este formato

      const reactorId = sheetName;
      if (!reactors.includes(reactorId)) reactors.push(reactorId);

      // configuración del ensayo (filas antes del encabezado "Fecha")
      const cfg = {};
      let foundAnyConfig = false;
      aoa.slice(0, headerRowIdx).forEach(row => {
        const label = String(row[0] || '').trim();
        const match = CONFIG_FIELDS.find(([l]) => l === label);
        if (match){
          cfg[match[1]] = (row[1] !== undefined && row[1] !== '') ? row[1] : '';
          foundAnyConfig = true;
        }
      });
      if (foundAnyConfig){
        await persistConfig(reactorId, cfg);
        configsFound++;
      }

      const existing = await loadRegister(reactorId);
      const byFecha = new Map(existing.map(e => [e.fecha, e]));

      for (let i = headerRowIdx + 1; i < aoa.length; i++){
        const row = aoa[i];
        const fecha = row[RAW_COL_INDEX.fecha];
        if (!fecha) continue;
        const entry = {};
        Object.keys(RAW_COL_INDEX).forEach(name => {
          entry[name] = cellToEntryValue(name, row[RAW_COL_INDEX[name]]);
        });
        byFecha.set(entry.fecha, entry);
        rowsFound++;
      }
      await persistRegister(reactorId, Array.from(byFecha.values()));
      reactorsFound++;
    }

    await persistReactors();
    renderTabs();
    if (currentReactor){ await selectReactor(currentReactor); }
    else if (reactors.length){ await selectReactor(reactors[0]); }

    showStatus(reactorsFound === 0
      ? 'No se encontraron hojas con el formato esperado en ese archivo.'
      : `Importado: ${rowsFound} registros y ${configsFound} configuración(es) de ensayo en ${reactorsFound} reactor(es).`);
  }

  // ---------- PWA: service worker y actualizaciones ----------
  // El service worker cachea la app con una versión fija (ver CACHE_VERSION en sw.js).
  // Cuando se publica una versión nueva, el navegador la descarga en segundo plano y acá
  // se avisa: sin este paso la app seguiría mostrando la versión vieja indefinidamente.
  function setupServiceWorker(){
    if (!('serviceWorker' in navigator)) return;
    if (location.protocol === 'file:') return; // abierto con doble clic: no hay SW posible

    navigator.serviceWorker.register('sw.js').then(reg => {
      function watch(worker){
        if (!worker) return;
        worker.addEventListener('statechange', () => {
          if (worker.state === 'installed' && navigator.serviceWorker.controller){
            showUpdateBanner(worker);
          }
        });
      }
      if (reg.waiting && navigator.serviceWorker.controller) showUpdateBanner(reg.waiting);
      reg.addEventListener('updatefound', () => watch(reg.installing));
      // Chequear si hay versión nueva cada vez que se vuelve a la app
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') reg.update().catch(() => {});
      });
    }).catch(() => {});

    let reloading = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (reloading) return;
      reloading = true;
      location.reload();
    });
  }

  function showUpdateBanner(worker){
    const banner = $('updateBanner');
    if (!banner) return;
    banner.classList.add('show');
    $('updateBtn').onclick = () => {
      banner.classList.remove('show');
      worker.postMessage({ type: 'SKIP_WAITING' });
    };
  }

  // Pide al navegador que no borre la base por falta de espacio. En iOS es lo que
  // frena el borrado automático de Safari a los ~7 días sin uso.
  async function setupStorage(){
    const note = $('storageNote');
    if (!navigator.storage || !navigator.storage.persist) return;
    try {
      let persisted = await navigator.storage.persisted();
      if (!persisted) persisted = await navigator.storage.persist();
      if (note){
        note.textContent = persisted
          ? 'Almacenamiento persistente activo en este dispositivo.'
          : 'El navegador no garantizó almacenamiento persistente acá: exportá a Excel seguido.';
      }
    } catch (e) { /* sin soporte: no cambia nada del funcionamiento */ }
  }

  // ---------- init ----------
  async function init(){
    await loadReactors();
    if (!reactors.length){
      reactors = ['BD1', 'BD2'];
      await persistReactors();
    }
    renderTabs();
    await selectReactor(reactors[0]);

    $('saveBtn').onclick = saveEntry;
    $('clearBtn').onclick = clearForm;
    $('exportBtn').onclick = exportToExcel;
    $('importBtn').onclick = () => $('importFile').click();
    $('importFile').onchange = async (ev) => {
      const file = ev.target.files[0];
      if (file) await importFromExcel(file);
      ev.target.value = '';
    };
    ['masa','vol1','voltotal','cac'].forEach(name => {
      fieldEl(name).addEventListener('input', updateStabilityPreview);
    });

    setupServiceWorker();
    setupStorage();
  }

  init();
})();
