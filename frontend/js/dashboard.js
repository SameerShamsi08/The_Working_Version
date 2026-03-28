/**
 * dashboard.js — HEA Dashboard Logic
 * Handles API calls, rendering, patient management
 * Backend: Flask at http://localhost:5000/api
 */

const API = 'http://localhost:5000/api';
let autoRefreshTimer = null;
let allPatients = [];

// ── Auth guard ──────────────────────────────────────────────────
if (!sessionStorage.getItem('hea_auth')) window.location.href = 'index.html';

// ── API health check ────────────────────────────────────────────
async function checkApiHealth() {
  const pill = document.getElementById('api-pill');
  if (!pill) return;
  try {
    const res = await fetch(`${API}/health`, { signal: AbortSignal.timeout(3000) });
    const data = await res.json();
    if (data.status === 'ok') {
      pill.innerHTML = '<div class="live-dot"></div><span>API Live</span>';
      pill.style.borderColor = 'rgba(16,185,129,0.3)';
      pill.style.color = '#34d399';
    } else {
      pill.innerHTML = '<span style="color:#fbbf24;">⚠ API Error</span>';
    }
  } catch {
    pill.innerHTML = '<span style="color:#fb7185;">✕ Offline</span>';
    pill.style.borderColor = 'rgba(225,29,72,0.3)';
    pill.style.color = '#fb7185';
  }
}

// ── Main loader ─────────────────────────────────────────────────
async function loadDashboard() {
  document.getElementById('conn-error').style.display = 'none';

  try {
    // Parallel fetch for speed
    const [dashRes, patientsRes] = await Promise.all([
      fetch(`${API}/dashboard`),
      fetch(`${API}/patients`)
    ]);

    if (!dashRes.ok || !patientsRes.ok) throw new Error('API response error');

    const [dashboard, patients] = await Promise.all([
      dashRes.json(),
      patientsRes.json()
    ]);

    allPatients = patients;

    renderAlerts(dashboard.alerts || []);
    renderStats(dashboard);
    renderWardOccupancy(dashboard.bed_summary || []);
    renderResources(dashboard.resources || []);
    renderPatients(patients);

    document.getElementById('last-updated').textContent =
      'Last updated: ' + new Date().toLocaleTimeString('en-IN', {hour:'2-digit', minute:'2-digit', second:'2-digit'});

    checkApiHealth();
  } catch (e) {
    console.error('Dashboard load error:', e);
    document.getElementById('conn-error').style.display = 'flex';
    document.getElementById('stats-grid').innerHTML = '<div class="stat-card"><div class="loading" style="color:#e11d48;">⚠ Cannot load data</div></div>';
    document.getElementById('api-pill').innerHTML = '<span style="color:#fb7185;">✕ Offline</span>';
    document.getElementById('api-pill').style.color = '#fb7185';
  }
}

// ── Alerts ──────────────────────────────────────────────────────
function renderAlerts(alerts) {
  const el = document.getElementById('alerts-container');

  if (!alerts.length) {
    el.innerHTML = `<div class="alerts-empty"><span>✓</span> All systems normal — no active alerts</div>`;
    return;
  }

  el.innerHTML = alerts.map((a, i) => `
    <div class="alert-item ${a.level}" style="animation-delay:${i * 0.06}s;">
      <span class="alert-icon">${a.level === 'critical' ? '🚨' : '⚠'}</span>
      <span class="alert-msg">${a.message}</span>
      <span class="alert-time">Just now</span>
    </div>
  `).join('');
}

// ── Stats grid ──────────────────────────────────────────────────
function renderStats(data) {
  const bs = data.bed_summary || [];
  const ps = data.patient_stats || {};
  const totalBeds = bs.reduce((a, w) => a + (w.total || 0), 0);
  const occupied  = bs.reduce((a, w) => a + (w.occupied || 0), 0);
  const available = bs.reduce((a, w) => a + (w.available || 0), 0);
  const occ = data.occupancy_rate || 0;
  const occClass = occ >= 90 ? 'red' : occ >= 75 ? 'amber' : 'green';

  document.getElementById('stats-grid').innerHTML = `
    <div class="stat-card anim-fade-up delay-1">
      <div class="stat-card-inner">
        <div>
          <div class="stat-label">Total Beds</div>
          <div class="stat-value">${totalBeds}</div>
          <div class="stat-sub">${available} available · ${occupied} occupied</div>
        </div>
        <div class="stat-icon navy">🛏</div>
      </div>
    </div>
    <div class="stat-card ${occClass} anim-fade-up delay-2">
      <div class="stat-card-inner">
        <div>
          <div class="stat-label">Occupancy Rate</div>
          <div class="stat-value">${occ}<span style="font-size:18px;font-weight:500;">%</span></div>
          <div class="stat-sub">${occupied} of ${totalBeds} beds in use</div>
        </div>
        <div class="stat-icon ${occClass === 'green' ? 'green' : occClass === 'amber' ? 'amber' : 'red'}">
          ${occ >= 90 ? '🔴' : occ >= 75 ? '🟡' : '🟢'}
        </div>
      </div>
    </div>
    <div class="stat-card anim-fade-up delay-3">
      <div class="stat-card-inner">
        <div>
          <div class="stat-label">Active Patients</div>
          <div class="stat-value">${ps.total_active || 0}</div>
          <div class="stat-sub">${ps.urgent || 0} urgent / critical</div>
        </div>
        <div class="stat-icon red">🏥</div>
      </div>
    </div>
    <div class="stat-card anim-fade-up delay-4">
      <div class="stat-card-inner">
        <div>
          <div class="stat-label">Admitted Today</div>
          <div class="stat-value">${ps.admitted_today || 0}</div>
          <div class="stat-sub">new patients today</div>
        </div>
        <div class="stat-icon amber">📋</div>
      </div>
    </div>
  `;
}

// ── Ward occupancy bars ──────────────────────────────────────────
function renderWardOccupancy(wardData) {
  renderOccupancyChart('ward-occupancy', wardData);
}

// ── Resources list ───────────────────────────────────────────────
function renderResources(resources) {
  const el = document.getElementById('resources-list');
  document.getElementById('resources-updated').textContent =
    new Date().toLocaleTimeString('en-IN', {hour:'2-digit', minute:'2-digit'});

  if (!resources.length) {
    el.innerHTML = '<p style="color:#94a3b8;font-size:13px;text-align:center;padding:20px;">No resources found.</p>';
    return;
  }

  el.innerHTML = resources.map(r => {
    const pct = r.total > 0 ? Math.round((r.available / r.total) * 100) : 0;
    const cls = pct <= 20 ? 'danger' : pct <= 40 ? 'warn' : '';
    const color = pct <= 20 ? 'var(--rose-600)' : pct <= 40 ? 'var(--amber-500)' : 'var(--emerald-500)';
    const icon = { 'Ventilators':'🫁','OT Rooms':'🏥','ICU Monitors':'💓','Wheelchairs':'♿','Oxygen Cylinders':'🫧' }[r.name] || '📦';
    return `
      <div style="margin-bottom:14px;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:5px;">
          <span style="font-size:13px;font-weight:600;display:flex;align-items:center;gap:7px;">
            <span>${icon}</span>${r.name}
          </span>
          <span style="font-size:12px;font-weight:700;color:${color};">${r.available}<span style="color:#94a3b8;font-weight:400;">/${r.total}</span></span>
        </div>
        <div class="progress-bar">
          <div class="progress-fill ${cls}" style="width:${pct}%;"></div>
        </div>
        <div class="progress-label">
          <span style="color:${color};font-weight:600;">${pct}% available</span>
          <span style="color:#94a3b8;font-size:10px;text-transform:uppercase;letter-spacing:0.4px;">${r.category}</span>
        </div>
      </div>
    `;
  }).join('');
}

// ── Patients table ───────────────────────────────────────────────
function renderPatients(patients) {
  const countEl = document.getElementById('patient-count');
  if (countEl) countEl.textContent = `${patients.length} patient${patients.length !== 1 ? 's' : ''}`;

  const tbody = document.getElementById('patients-tbody');

  if (!patients.length) {
    tbody.innerHTML = `
      <tr>
        <td colspan="8">
          <div class="empty-state">
            <div class="empty-state-icon">🛏</div>
            <div style="font-weight:600;color:#334155;">No active patients</div>
            <p>Admit a patient using the button above to get started.</p>
          </div>
        </td>
      </tr>`;
    return;
  }

  const priMeta = {
    critical: { color: '#e11d48', bg: '#fff1f2', label: 'Critical', icon: '🔴' },
    urgent:   { color: '#f59e0b', bg: '#fffbeb', label: 'Urgent',   icon: '🟡' },
    normal:   { color: '#10b981', bg: '#ecfdf5', label: 'Normal',   icon: '🟢' },
  };

  tbody.innerHTML = patients.map(p => {
    const pm = priMeta[p.priority] || priMeta.normal;
    const admitted = new Date(p.admitted_at).toLocaleDateString('en-IN', {day:'2-digit',month:'short',year:'numeric'});
    const wardBed  = p.bed_number ? `${p.ward} · ${p.bed_number}` : p.ward || '—';
    return `
      <tr>
        <td><span class="text-mono text-xs text-muted">#${p.id}</span></td>
        <td style="font-weight:600;color:#0f172a;">${escapeHtml(p.name)}</td>
        <td style="color:#475569;">${p.age} yrs</td>
        <td style="color:#475569;">${escapeHtml(p.condition)}</td>
        <td>
          <span style="font-size:11px;font-weight:700;padding:3px 8px;border-radius:100px;background:${pm.bg};color:${pm.color};">
            ${pm.icon} ${pm.label}
          </span>
        </td>
        <td style="font-size:12px;font-family:'JetBrains Mono',monospace;color:#334155;">${escapeHtml(wardBed)}</td>
        <td style="font-size:11px;color:#94a3b8;">${admitted}</td>
        <td>
          <button class="btn btn-outline btn-xs" onclick="dischargePatient(${p.id}, '${escapeHtml(p.name)}')">
            Discharge
          </button>
        </td>
      </tr>
    `;
  }).join('');
}

// ── Search/filter patients ───────────────────────────────────────
function filterPatients(query) {
  const pf = document.getElementById('priority-filter').value;
  let filtered = allPatients;

  if (query && query.trim()) {
    const q = query.toLowerCase();
    filtered = filtered.filter(p =>
      p.name.toLowerCase().includes(q) ||
      p.condition.toLowerCase().includes(q) ||
      (p.ward && p.ward.toLowerCase().includes(q))
    );
  }

  if (pf) {
    filtered = filtered.filter(p => p.priority === pf);
  }

  renderPatients(filtered);
}

// ── Admit modal ──────────────────────────────────────────────────
function openAdmitModal() {
  document.getElementById('admit-modal').classList.add('open');
  document.getElementById('admit-error').style.display = 'none';
  document.getElementById('p-name').focus();
}
function closeAdmitModal() {
  document.getElementById('admit-modal').classList.remove('open');
}

async function admitPatient() {
  const name      = document.getElementById('p-name').value.trim();
  const age       = document.getElementById('p-age').value.trim();
  const gender    = document.getElementById('p-gender').value;
  const priority  = document.getElementById('p-priority').value;
  const condition = document.getElementById('p-condition').value.trim();
  const ward      = document.getElementById('p-ward').value;
  const errEl     = document.getElementById('admit-error');
  const btn       = document.getElementById('admit-btn');

  errEl.style.display = 'none';

  if (!name) { showAdmitError('Patient name is required.'); return; }
  if (!age || isNaN(age) || age < 0) { showAdmitError('Please enter a valid age.'); return; }
  if (!condition) { showAdmitError('Condition / diagnosis is required.'); return; }

  btn.disabled = true;
  btn.innerHTML = '<div class="spinner" style="width:12px;height:12px;border-width:1.5px;border-top-color:white;display:inline-block;margin-right:6px;"></div> Admitting…';

  try {
    const res = await fetch(`${API}/patients/admit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name, age: parseInt(age), gender, condition, priority,
        ward: ward || undefined
      })
    });

    const data = await res.json();

    if (!res.ok) {
      showAdmitError(data.error || 'Could not admit patient. Please try again.');
      return;
    }

    const bedInfo = data.bed ? ` — Bed assigned: ${data.bed.bed_number} (${data.bed.ward})` : ' — No beds available, patient added to queue.';
    showToast('✓ ' + (data.message || 'Patient admitted') + bedInfo, 'success');
    closeAdmitModal();

    // Reset form
    ['p-name','p-age','p-condition'].forEach(id => { document.getElementById(id).value = ''; });
    document.getElementById('p-priority').value = 'normal';
    document.getElementById('p-ward').value = '';

    loadDashboard();
  } catch (e) {
    showAdmitError('Cannot connect to API. Make sure the backend server is running.');
  } finally {
    btn.disabled = false;
    btn.innerHTML = '✓ Admit &amp; Assign Bed';
  }
}

function showAdmitError(msg) {
  const el = document.getElementById('admit-error');
  el.textContent = '⚠ ' + msg;
  el.style.display = 'block';
}

async function dischargePatient(id, name) {
  if (!confirm(`Discharge ${name}?\n\nThis will free their bed and mark the admission as complete.`)) return;

  try {
    const res  = await fetch(`${API}/patients/${id}/discharge`, { method: 'POST' });
    const data = await res.json();
    showToast(
      res.ok ? '✓ ' + (data.message || 'Patient discharged') : '⚠ ' + (data.error || 'Error'),
      res.ok ? 'success' : 'error'
    );
    if (res.ok) loadDashboard();
  } catch {
    showToast('⚠ API not reachable', 'error');
  }
}

// ── Toast ────────────────────────────────────────────────────────
function showToast(msg, type = '') {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className = `toast show ${type}`;
  clearTimeout(t._timer);
  t._timer = setTimeout(() => { t.className = 'toast'; }, 4000);
}

// ── Helpers ──────────────────────────────────────────────────────
function escapeHtml(str) {
  return String(str || '').replace(/[&<>"']/g, s => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[s]));
}

// ── Init ─────────────────────────────────────────────────────────
checkApiHealth();
loadDashboard();

// Auto-refresh every 30 seconds
autoRefreshTimer = setInterval(loadDashboard, 30000);

// Close modal on backdrop click
document.getElementById('admit-modal').addEventListener('click', function(e) {
  if (e.target === this) closeAdmitModal();
});