'use strict';
const $ = id => document.getElementById(id);
const out = $('out');

// Desktop-App (Go/Wails) oder Browser (Web Serial)?
const isApp = location.protocol === 'wails:' || location.hostname === 'wails.localhost';
const api = () => window.go.main.App;

// ---------- Einstellungen speichern/laden ----------
const SETTINGS = ['baud','dataBits','parity','stopBits','flow','bufSize','maxLines','lineEnd',
                  'autoscroll','timestamp','hexView','wrap','echo','hexSend','clearOnSend','autoConnect','lang','checkUpdates'];
function loadSettings() {
  let s = {};
  try { s = JSON.parse(localStorage.getItem('serialMonitorSettings') || '{}'); } catch {}
  // Zeilenende: frühere Versionen speicherten "\n"-Text -> auf Kürzel umstellen
  const LE_MIGRATE = { '': 'none', '\\n': 'lf', '\n': 'lf', '\\r': 'cr', '\r': 'cr', '\\r\\n': 'crlf', '\r\n': 'crlf' };
  if (!('lineEnd' in s)) s.lineEnd = 'lf';
  else if (s.lineEnd in LE_MIGRATE) s.lineEnd = LE_MIGRATE[s.lineEnd];
  for (const k of SETTINGS) {
    if (!(k in s)) continue;
    const el = $(k);
    if (el.type === 'checkbox') el.checked = !!s[k]; else el.value = s[k];
  }
}
function saveSettings() {
  const s = {};
  for (const k of SETTINGS) { const el = $(k); s[k] = el.type === 'checkbox' ? el.checked : el.value; }
  try { localStorage.setItem('serialMonitorSettings', JSON.stringify(s)); } catch {}
}
loadSettings();
SETTINGS.forEach(k => $(k).addEventListener('change', saveSettings));

// ---------- Baudrate: Standardwerte oder eigener Wert ----------
// Der tatsächliche Wert steht im versteckten Feld #baud (wird gespeichert und löst Neuverbinden aus).
function setBaud(v) {
  if ($('baud').value === String(v)) return;
  $('baud').value = v;
  $('baud').dispatchEvent(new Event('change'));
}
function syncBaudUi() {
  const v = $('baud').value;
  const std = Array.from($('baudSel').options).some(o => o.value === v);
  $('baudSel').value = std ? v : 'custom';
  $('baudCustom').hidden = std;
  if (!std) $('baudCustom').value = v;
}
$('baudSel').addEventListener('change', () => {
  const v = $('baudSel').value;
  if (v === 'custom') {
    $('baudCustom').hidden = false;
    if (!$('baudCustom').value) $('baudCustom').value = $('baud').value;
    $('baudCustom').focus();
    $('baudCustom').select();
  } else {
    $('baudCustom').hidden = true;
    setBaud(v);
  }
});
$('baudCustom').addEventListener('change', () => {
  const n = parseInt($('baudCustom').value);
  if (n >= 50 && n <= 20000000) setBaud(n);
  else { sysMsg(t('invalidBaud', { v: $('baudCustom').value }), true); $('baudCustom').value = $('baud').value; }
});
$('baudCustom').addEventListener('keydown', e => { if (e.key === 'Enter') $('baudCustom').blur(); });
syncBaudUi();

// ---------- Ausgabe ----------
let curText = null;
let lineCount = 0;
let rxBytes = 0, txBytes = 0;

function ts() {
  const d = new Date();
  const p = (n, l = 2) => String(n).padStart(l, '0');
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}.${p(d.getMilliseconds(), 3)}`;
}
function trimLines() {
  const max = Math.max(100, parseInt($('maxLines').value) || 10000);
  while (lineCount > max && out.firstChild) { out.firstChild.remove(); lineCount--; }
}
function scrollIfNeeded() {
  if ($('autoscroll').checked) out.scrollTop = out.scrollHeight;
}
function newLine(cls, arrow) {
  const div = document.createElement('div');
  div.className = 'line' + (cls ? ' ' + cls : '');
  if ($('timestamp').checked) {
    const t = document.createElement('span');
    t.className = 'ts';
    t.textContent = `${ts()} ${arrow} `;
    div.append(t);
  }
  const txt = document.createTextNode('');
  div.append(txt);
  out.append(div);
  lineCount++;
  trimLines();
  return txt;
}
function sysMsg(msg, isErr) {
  curText = null;
  hexRow = null;
  newLine(isErr ? 'err' : 'sys', '--').appendData(msg);
  curText = null;
  scrollIfNeeded();
}
function updateCounters() {
  const f = n => n < 1024 ? n + ' B' : n < 1048576 ? (n / 1024).toFixed(1) + ' KB' : (n / 1048576).toFixed(2) + ' MB';
  $('counters').textContent = `RX ${f(rxBytes)} · TX ${f(txBytes)}`;
}
function hexLines(bytes) {
  const lines = [];
  for (let i = 0; i < bytes.length; i += 16) {
    const chunk = bytes.subarray(i, i + 16);
    const hex = Array.from(chunk, b => b.toString(16).padStart(2, '0').toUpperCase()).join(' ');
    const asc = Array.from(chunk, b => (b >= 32 && b < 127) ? String.fromCharCode(b) : '.').join('');
    lines.push(hex.padEnd(16 * 3 - 1, ' ') + '  |' + asc + '|');
  }
  return lines;
}

// Hex-Ansicht: Zeilen auf 16 Bytes auffüllen; neue Zeile nach 100 ms Pause
let hexRow = null; // { txt, bytes, t }
function handleHexRx(bytes) {
  const now = performance.now();
  if (hexRow && now - hexRow.t > 100) hexRow = null;
  for (const b of bytes) {
    if (!hexRow || hexRow.bytes.length >= 16) {
      if (hexRow) hexRow.txt.data = hexLines(Uint8Array.from(hexRow.bytes))[0];
      hexRow = { txt: newLine('', '←'), bytes: [], t: now };
    }
    hexRow.bytes.push(b);
  }
  hexRow.txt.data = hexLines(Uint8Array.from(hexRow.bytes))[0];
  hexRow.t = now;
  scrollIfNeeded();
}

let decoder = new TextDecoder('utf-8');
function handleRx(bytes) {
  rxBytes += bytes.length;
  updateCounters();
  if ($('hexView').checked) {
    curText = null;
    handleHexRx(bytes);
    return;
  }
  hexRow = null;
  const text = decoder.decode(bytes, { stream: true });
  const parts = text.split('\n');
  parts.forEach((p, i) => {
    if (i > 0) curText = null;
    p = p.replace(/\r/g, '');
    const lineEndsHere = i < parts.length - 1;
    if (p.length || (lineEndsHere && !curText)) {
      if (!curText) curText = newLine('', '←');
      curText.appendData(p);
    }
  });
  scrollIfNeeded();
}

// ---------- base64 (für die Go-Brücke) ----------
function toB64(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(s);
}
function fromB64(b64) {
  const s = atob(b64);
  const arr = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) arr[i] = s.charCodeAt(i);
  return arr;
}

// ---------- Verbindung: gemeinsamer Teil ----------
let connected = false, connecting = false, portName = '';
let lastPortName = '';
try { lastPortName = localStorage.getItem('serialMonitorLastPort') || ''; } catch {}

// Auto-Verbinden pausiert nach manuellem Trennen oder fehlgeschlagenem Öffnen
// (z. B. Port belegt, weil gerade geflasht wird) – bis der Port einmal weg war
// oder manuell verbunden wird.
let suppressAuto = false;
function autoAllowed() {
  return $('autoConnect').checked && !suppressAuto && !connected && !connecting;
}
function reportConnectError(msg, auto) {
  if (auto) {
    suppressAuto = true;
    msg += t('autoPaused');
  }
  sysMsg(msg, true);
}

function setUi(state, text) {
  connected = state === 'connected';
  $('dot').classList.toggle('on', connected);
  $('btnConnect').textContent = t(connected ? 'disconnect' : 'connect');
  $('status').textContent = text;
  $('portSel').disabled = connected;
  $('btnAddPort').disabled = connected;
  $('btnReset').classList.toggle('off', !connected);
  $('btnReset').setAttribute('aria-disabled', String(!connected));
  $('btnRefresh').disabled = connected;
}
function serialOptions() {
  return {
    baudRate: parseInt($('baud').value) || 115200,
    dataBits: parseInt($('dataBits').value),
    stopBits: parseInt($('stopBits').value),
    parity: $('parity').value,
    flowControl: $('flow').value,
    bufferSize: parseInt($('bufSize').value) || 4096,
  };
}
function onConnected(opts, auto) {
  decoder = new TextDecoder('utf-8');
  setUi('connected', `${portName ? portName + ' · ' : ''}${opts.baudRate} Baud`);
  sysMsg(t(auto ? 'connectedAuto' : 'connected', { port: portName ? t('withPort', { name: portName }) : '', cfg: `${opts.baudRate} Baud, ${opts.dataBits}${opts.parity[0].toUpperCase()}${opts.stopBits}` }));
}
function onDisconnected(silent) {
  curText = null;
  setUi('disconnected', t('statusDisconnected'));
  if (!silent) sysMsg(t('disconnected'));
}

async function connect(auto = false) {
  if (connecting || connected) return;
  connecting = true;
  try { isApp ? await App.connect(auto) : await Web.connect(auto); }
  finally { connecting = false; }
}
async function disconnect(silent) {
  isApp ? await App.disconnect() : await Web.disconnect();
  onDisconnected(silent);
}
async function reconnect() {
  if (!connected) return;
  if (isApp) { await disconnect(true); await connect(); }
  else { const p = await Web.disconnect(); onDisconnected(true); Web.port = p; await connect(); }
}
async function writeBytes(bytes) {
  return isApp ? App.write(bytes) : Web.write(bytes);
}
async function setSignals(dtr, rts) {
  if (isApp) return api().SetSignals(dtr, rts); // Go schaltet in reset-sicherer Reihenfolge
  // Zustand DTR aus / RTS an vermeiden (= Reset bei ESP32-Boards)
  const p = Web.port;
  if (rts) { await p.setSignals({ dataTerminalReady: dtr }); await p.setSignals({ requestToSend: true }); }
  else { await p.setSignals({ requestToSend: false }); await p.setSignals({ dataTerminalReady: dtr }); }
}
async function resetBoard() {
  const dtr = $('dtr').checked, rts = $('rts').checked;
  if (isApp) return api().ResetBoard(dtr, rts);
  const p = Web.port, wait = ms => new Promise(r => setTimeout(r, ms));
  await p.setSignals({ dataTerminalReady: false });
  await p.setSignals({ requestToSend: true });   // ESP32/ESP8266: EN low
  await wait(100);
  await p.setSignals({ requestToSend: false });
  await wait(20);
  await p.setSignals({ dataTerminalReady: true }); // Arduino: Reset-Impuls
  await wait(50);
  await p.setSignals({ dataTerminalReady: false });
  await setSignals(dtr, rts);
}
function refreshPorts(select) {
  return (isApp ? App.refresh() : Web.refresh(select)).catch(e => console.error(e));
}

// ---------- Backend: Desktop-App (Go) ----------
const App = {
  async refresh() {
    if (connected || connecting) return;
    const list = (await api().ListPorts()) || [];
    const sel = $('portSel');
    const sig = list.map(p => p.label).join(';');
    if (sel.dataset.sig !== sig) {
      sel.dataset.sig = sig;
      const current = sel.value || lastPortName;
      sel.innerHTML = '';
      if (!list.length) {
        const o = document.createElement('option'); o.value = ''; o.textContent = t('noPortFound');
        sel.append(o);
      }
      for (const p of list) {
        const o = document.createElement('option'); o.value = p.name; o.textContent = p.label;
        sel.append(o);
      }
      if (list.some(p => p.name === current)) sel.value = current;
    }

    // Auto-Verbinden mit dem zuletzt genutzten Port
    const present = !!lastPortName && list.some(p => p.name === lastPortName);
    if (!present) { suppressAuto = false; return; }
    if (autoAllowed()) {
      sel.value = lastPortName;
      connect(true);
    }
  },
  async connect(auto) {
    const name = auto ? lastPortName : $('portSel').value;
    if (!name) { sysMsg(t('noPortSelected'), true); return; }
    const o = serialOptions();
    try {
      await api().Open(name, o.baudRate, o.dataBits, o.parity, o.stopBits); // DTR/RTS aus -> kein Reset
    } catch (e) {
      reportConnectError(t('openFailedPort', { name, err: (e && e.message || e) }), auto);
      return;
    }
    portName = lastPortName = name;
    try { localStorage.setItem('serialMonitorLastPort', name); } catch {}
    onConnected(o, auto);
    if ($('dtr').checked || $('rts').checked) {
      try { await setSignals($('dtr').checked, $('rts').checked); } catch {}
    }
  },
  async disconnect() { try { await api().Close(); } catch {} },
  async write(bytes) { await api().Write(toB64(bytes)); },
  init() {
    window.runtime.EventsOn('serial:rx', b64 => handleRx(fromB64(b64)));
    window.runtime.EventsOn('serial:closed', msg => {
      sysMsg(msg || t('deviceRemoved'), true);
      onDisconnected(true);
      $('portSel').dataset.sig = '';
      refreshPorts();
    });
    // Über: Version aus Go, Link im Standardbrowser öffnen
    api().Version().then(v => { $('appVersion').textContent = v === 'dev' ? 'dev' : 'v' + v; }).catch(() => {});
    $('repoLink').addEventListener('click', e => { e.preventDefault(); api().OpenURL($('repoLink').href); });
    setTimeout(checkForUpdate, 3000);                  // kurz nach dem Start
    setInterval(checkForUpdate, 24 * 60 * 60 * 1000);  // und einmal täglich
    // Nur im Browser verfügbar
    $('btnAddPort').style.display = 'none';
    $('flow').closest('label').style.display = 'none';
    $('bufSize').closest('label').style.display = 'none';
    $('btnRefresh').addEventListener('click', () => { $('portSel').dataset.sig = ''; refreshPorts(); });
    $('portSel').addEventListener('mousedown', () => refreshPorts());
    setInterval(() => refreshPorts(), 2000);
    refreshPorts();
  },
};

// ---------- Backend: Browser (Web Serial) ----------
const Web = {
  port: null, lastPort: null, reader: null, readDone: null, keepReading: false, known: [],
  label(p, i) {
    const info = p.getInfo();
    if (info.usbVendorId !== undefined) {
      const h = n => n.toString(16).padStart(4, '0').toUpperCase();
      return `Port ${i + 1} – USB ${h(info.usbVendorId)}:${h(info.usbProductId)}`;
    }
    return `Port ${i + 1}`;
  },
  async refresh(select) {
    this.known = await navigator.serial.getPorts();
    const sel = $('portSel');
    sel.innerHTML = '';
    if (!this.known.length) {
      const o = document.createElement('option'); o.textContent = t('noPortGranted'); o.value = '';
      sel.append(o);
    }
    this.known.forEach((p, i) => {
      const o = document.createElement('option'); o.value = i; o.textContent = this.label(p, i);
      sel.append(o);
    });
    if (select) { const i = this.known.indexOf(select); if (i >= 0) sel.value = i; }
  },
  async connect(auto) {
    if (!this.port) {
      const idx = $('portSel').value;
      if (idx !== '' && this.known[idx]) this.port = this.known[idx];
      else {
        try { this.port = await navigator.serial.requestPort(); } catch { return; }
        await this.refresh(this.port);
      }
    }
    const opts = serialOptions();
    try { await this.port.open(opts); }
    catch (e) { reportConnectError(t('openFailed', { err: e.message }), auto); this.port = null; return; }
    // Chrome setzt beim Öffnen DTR+RTS gleichzeitig (neutral für ESP32); beide gemeinsam zurücknehmen
    try { await this.port.setSignals({ dataTerminalReady: $('dtr').checked, requestToSend: $('rts').checked }); } catch {}
    portName = '';
    this.lastPort = this.port;
    onConnected(opts, auto);
    this.keepReading = true;
    this.readDone = this.readLoop();
  },
  async readLoop() {
    while (this.port && this.port.readable && this.keepReading) {
      this.reader = this.port.readable.getReader();
      try {
        while (true) {
          const { value, done } = await this.reader.read();
          if (done) break;
          if (value && value.length) handleRx(value);
        }
      } catch (e) {
        if (this.keepReading) sysMsg(t('readError', { err: e.message }), true);
      } finally {
        this.reader.releaseLock();
        this.reader = null;
      }
    }
  },
  async disconnect() {
    this.keepReading = false;
    if (this.reader) { try { await this.reader.cancel(); } catch {} }
    if (this.readDone) { try { await this.readDone; } catch {} this.readDone = null; }
    if (this.port) { try { await this.port.close(); } catch {} }
    const p = this.port;
    this.port = null;
    return p;
  },
  async write(bytes) {
    const writer = this.port.writable.getWriter();
    try { await writer.write(bytes); } finally { writer.releaseLock(); }
  },
  init() {
    $('btnRefresh').style.display = 'none';
    $('checkUpdatesRow').style.display = 'none'; // Browser-Version hat keine Updates
    $('appVersion').dataset.i18n = 'browserVersion';
    $('appVersion').textContent = t('browserVersion');
    $('btnAddPort').addEventListener('click', async () => {
      try { const p = await navigator.serial.requestPort(); await this.refresh(p); } catch {}
    });
    navigator.serial.addEventListener('connect', async e => {
      await refreshPorts(this.port);
      if (e.target === this.lastPort && autoAllowed()) { this.port = e.target; connect(true); }
    });
    navigator.serial.addEventListener('disconnect', async e => {
      if (e.target === this.lastPort) suppressAuto = false;
      if (this.port && e.target === this.port) { sysMsg(t('deviceRemoved'), true); await disconnect(true); }
      refreshPorts();
    });
    refreshPorts();
  },
};

// ---------- Senden ----------
const history = [];
let histPos = -1;

function parseHex(s) {
  const clean = s.replace(/0x/gi, '').replace(/[^0-9a-f]/gi, '');
  if (clean.length % 2) throw new Error(t('oddHex'));
  const arr = new Uint8Array(clean.length / 2);
  for (let i = 0; i < arr.length; i++) arr[i] = parseInt(clean.substr(i * 2, 2), 16);
  return arr;
}

async function send() {
  const inp = $('input');
  const raw = inp.value;
  if (!connected) { sysMsg(t('notConnected'), true); return; }
  const le = { none: '', lf: '\n', cr: '\r', crlf: '\r\n' }[$('lineEnd').value] ?? '\n';
  let bytes;
  try {
    if ($('hexSend').checked) {
      const body = parseHex(raw), tail = new TextEncoder().encode(le);
      bytes = new Uint8Array(body.length + tail.length); bytes.set(body); bytes.set(tail, body.length);
    } else {
      bytes = new TextEncoder().encode(raw + le);
    }
  } catch (e) { sysMsg(t('inputError', { err: e.message }), true); return; }

  try { await writeBytes(bytes); }
  catch (e) { sysMsg(t('sendError', { err: (e && e.message || e) }), true); return; }

  txBytes += bytes.length;
  updateCounters();
  if ($('echo').checked) {
    curText = null;
    hexRow = null;
    if ($('hexView').checked || $('hexSend').checked) {
      for (const l of hexLines(bytes)) newLine('tx', '→').appendData(l);
    } else {
      newLine('tx', '→').appendData(raw);
    }
    curText = null;
    scrollIfNeeded();
  }
  if (raw && history[history.length - 1] !== raw) history.push(raw);
  histPos = -1;
  if ($('clearOnSend').checked) inp.value = '';
}

// ---------- Events ----------
$('btnConnect').addEventListener('click', () => {
  if (connected) { suppressAuto = true; disconnect(); }
  else { suppressAuto = false; connect(); }
});
$('autoConnect').addEventListener('change', () => {
  suppressAuto = false;
  if ($('autoConnect').checked) refreshPorts();
});
$('btnSend').addEventListener('click', send);
$('input').addEventListener('keydown', e => {
  if (e.key === 'Enter') { e.preventDefault(); send(); }
  else if (e.key === 'ArrowUp' && history.length) {
    e.preventDefault();
    histPos = histPos < 0 ? history.length - 1 : Math.max(0, histPos - 1);
    $('input').value = history[histPos];
  } else if (e.key === 'ArrowDown' && histPos >= 0) {
    e.preventDefault();
    histPos++;
    if (histPos >= history.length) { histPos = -1; $('input').value = ''; }
    else $('input').value = history[histPos];
  }
});
['baud','dataBits','parity','stopBits','flow','bufSize'].forEach(k =>
  $(k).addEventListener('change', () => { if (connected) reconnect(); }));
['dtr','rts'].forEach(k => $(k).addEventListener('change', async () => {
  if (connected) try { await setSignals($('dtr').checked, $('rts').checked); } catch {}
}));
$('btnReset').addEventListener('click', async () => {
  if (!connected) return;
  sysMsg(t('resetting'));
  try {
    await resetBoard();
  } catch (e) { sysMsg(t('resetFailed', { err: (e && e.message || e) }), true); }
});
$('wrap').addEventListener('change', () => out.classList.toggle('nowrap', !$('wrap').checked));
out.classList.toggle('nowrap', !$('wrap').checked);

$('hexView').addEventListener('change', () => { curText = null; hexRow = null; });
function clearOut() { out.innerHTML = ''; lineCount = 0; curText = null; hexRow = null; rxBytes = txBytes = 0; updateCounters(); }
$('btnClear').addEventListener('click', clearOut);
document.addEventListener('keydown', e => {
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); clearOut(); }
});

function logFileName() {
  const d = new Date(), p = n => String(n).padStart(2, '0');
  return `serial-log_${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}.txt`;
}
$('btnSave').addEventListener('click', async () => {
  const text = Array.from(out.children, d => d.textContent).join('\n');
  if (isApp) {
    try {
      const path = await api().SaveLog(logFileName(), text);
      if (path) sysMsg(t('saved', { path }));
    } catch (e) { sysMsg(t('saveFailed', { err: (e && e.message || e) }), true); }
    return;
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type: 'text/plain' }));
  a.download = logFileName();
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
});

// ---------- Tooltips ----------
// Eigene Tooltips für alle Elemente mit data-tip (gesetzt von applyI18n)
const tip = document.createElement('div');
tip.id = 'tip';
document.body.append(tip);
let tipTarget = null, tipTimer = null;
function hideTip() {
  clearTimeout(tipTimer);
  tipTarget = null;
  tip.style.display = 'none';
}
function showTip(el) {
  if (!el.dataset.tip) return;
  tip.textContent = el.dataset.tip;
  tip.style.display = 'block';
  const r = el.getBoundingClientRect(), tr = tip.getBoundingClientRect();
  const left = Math.max(6, Math.min(r.left + r.width / 2 - tr.width / 2, innerWidth - tr.width - 6));
  let top = r.bottom + 6;
  if (top + tr.height > innerHeight - 6) top = Math.max(6, r.top - tr.height - 6);
  tip.style.left = left + 'px';
  tip.style.top = top + 'px';
}
document.addEventListener('mouseover', e => {
  const el = e.target.closest ? e.target.closest('[data-tip]') : null;
  if (el === tipTarget) return;
  hideTip();
  if (!el) return;
  tipTarget = el;
  tipTimer = setTimeout(() => showTip(el), 450);
});
document.addEventListener('mousedown', hideTip);
document.addEventListener('keydown', hideTip);
window.addEventListener('blur', hideTip);
document.addEventListener('mouseleave', hideTip);

// ---------- Einstellungen-Fenster ----------
function toggleSettings(open) {
  const panel = $('settingsPanel');
  open = open ?? panel.hidden;
  panel.hidden = !open;
  $('btnSettings').setAttribute('aria-expanded', String(open));
}
$('btnSettings').addEventListener('click', () => toggleSettings());
document.addEventListener('mousedown', e => {
  if (!$('settingsPanel').hidden && !$('settingsPanel').contains(e.target) && !$('btnSettings').contains(e.target)) toggleSettings(false);
});
document.addEventListener('keydown', e => { if (e.key === 'Escape') toggleSettings(false); });

// ---------- Updates (nur Desktop-App) ----------
// Fragt GitHub nach einem neueren Release; der Download läuft über den Browser.
let availableUpdate = null; // { version, pageUrl, downloadUrl }
function renderUpdate() {
  const link = $('updateLink');
  const show = !!(availableUpdate && $('checkUpdates').checked);
  link.hidden = !show;
  if (!show) return;
  link.textContent = t('updateAvailable', { v: availableUpdate.version });
  link.dataset.tip = t('updateTip');
}
async function checkForUpdate() {
  if (!isApp || !$('checkUpdates').checked) return;
  try {
    const u = await api().CheckUpdate();
    availableUpdate = u && u.version ? u : null;
  } catch (e) {
    console.warn('Update-Prüfung fehlgeschlagen:', e); // offline o. Ä. – still ignorieren
  }
  renderUpdate();
}
$('updateLink').addEventListener('click', e => {
  e.preventDefault();
  if (availableUpdate) api().OpenURL(availableUpdate.downloadUrl || availableUpdate.pageUrl);
});
$('checkUpdates').addEventListener('change', () => { renderUpdate(); checkForUpdate(); });

// ---------- Sprache ----------
function applyLanguage() {
  applyI18n(resolveLang($('lang').value === 'auto' ? null : $('lang').value));
  $('btnConnect').textContent = t(connected ? 'disconnect' : 'connect');
  if (!connected) $('status').textContent = t('statusDisconnected');
  $('portSel').dataset.sig = ''; // Portliste neu beschriften
  renderUpdate();
  if (isApp && window.go) api().SetLanguage(LANG).catch(() => {});
}
$('lang').addEventListener('change', () => { applyLanguage(); refreshPorts(); });
applyLanguage();

// ---------- Start ----------
function start() {
  if (isApp) {
    // Wails-Laufzeit ist evtl. noch nicht bereit
    if (!(window.go && window.go.main && window.runtime)) { setTimeout(start, 30); return; }
    api().SetLanguage(LANG).catch(() => {});
    App.init();
  } else if (!('serial' in navigator)) {
    $('unsupported').style.display = 'block';
    document.querySelectorAll('button, input, select').forEach(el => el.disabled = true);
    return;
  } else {
    Web.init();
  }
  $('input').focus();
}
start();
