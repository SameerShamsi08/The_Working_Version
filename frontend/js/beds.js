/**
 * beds.js — Bed Map Page Logic
 * Handles loading, filtering, and status updates for beds
 */

const API = 'http://localhost:5000/api';
let allBeds = [];

// ── API health ──────────────────────────────────────────────────
async function checkApiHealth() {
  const pill = document.getElementById('api-pill');
  if (!pill) return;
  try {
    const res = await fetch(`${API}/health`, { signal: AbortSignal.timeout(3000) });
    const data = await res.json();
    if (data.status === 'ok') {
      pill.innerHTML = '<div class="live-dot"></div><span>API Live</span>';
      pill.style.color = '#34d399';
    }
  } catch {
    pill.innerHTML = '<span style="color:#fb7185;">✕ Offline</span>';
    pill.style.color = '#fb7185';
  }
}

// ── Load beds ───────────────────────────────────────────────────
async function loadBeds() {
  const container = document.getElementById('beds-container');
  container.innerHTML = '<div class="loading"><div class="spinner"></div> Loading bed map…</div>';

  try {
    allBeds = await fetch(`${API}/beds`).then(r => r.json());

    // Summary line
    const total   = allBeds.length;
    const avail   = allBeds.filter(b => b.status === 'available').length;
    const occ     = allBeds.filter(b => b.status === 'occupied').length;
    const maint   = allBeds.filter(b => b.status === 'maintenance').length;
    const occPct  = total > 0 ? Math.round((occ / total) * 100) : 0;

    const summaryEl = document.getElementById('bed-summary-line');
    if (summaryEl) {
      summaryEl.innerHTML =
        `<span style="color:var(--emerald-500);font-weight:600;">${avail} available</span> · ` +
        `<span style="color:var(--rose-600);font-weight:600;">${occ} occupied</span>` +
        (maint ? ` · <span style="color:#94a3b8;">${maint} maintenance</span>` : '') +
        ` — ${total} beds total · <span style="font-weight:600;">${occPct}% occupancy</span>`;
    }

    buildWardTabs();
    renderBeds(allBeds);
    checkApiHealth();
  } catch (e) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">🏥</div>
        <div style="font-weight:600;font-size:15px;color:#334155;">Cannot load bed map</div>
        <p>Make sure <code>python app.py</code> is running in the backend folder.</p>
        <button class="btn btn-outline btn-sm" onclick="loadBeds()" style="margin-top:16px;">Try again</button>
      </div>`;
  }
}

// ── Ward tabs ───────────────────────────────────────────────────
function buildWardTabs() {
  const tabsEl = document.getElementById('ward-tabs');
  tabsEl.querySelectorAll('.ward-tab-dynamic').forEach(b => b.remove());

  const wards = [...new Set(allBeds.map(b => b.ward))].sort();
  const wardIcons = {
    General:'🏥', ICU:'❤️', Emergency:'🚨', Pediatric:'👶', Maternity:'🤰'
  };

  wards.forEach(w => {
    const btn = document.createElement('button');
    btn.className = 'ward-tab ward-tab-dynamic';
    const icon = wardIcons[w] || '🛏';
    const count = allBeds.filter(b => b.ward === w && b.status === 'available').length;
    btn.innerHTML = `${icon} ${w} <span style="font-size:10px;opacity:0.7;">(${count} free)</span>`;
    btn.onclick = function () { filterWard(w, this); };
    tabsEl.appendChild(btn);
  });
}

// ── Filter by ward ──────────────────────────────────────────────
function filterWard(ward, btn) {
  document.querySelectorAll('.ward-tab').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
  renderBeds(ward ? allBeds.filter(b => b.ward === ward) : allBeds);
}

// ── Render bed grid ─────────────────────────────────────────────
function renderBeds(beds) {
  const container = document.getElementById('beds-container');

  if (!beds.length) {
    container.innerHTML = '<div class="empty-state"><div class="empty-state-icon">🛏</div><p>No beds found for this filter.</p></div>';
    return;
  }

  // Group by ward
  const byWard = {};
  beds.forEach(b => {
    if (!byWard[b.ward]) byWard[b.ward] = [];
    byWard[b.ward].push(b);
  });

  const wardOrder = ['ICU', 'Emergency', 'General', 'Pediatric', 'Maternity'];
  const sortedWards = Object.keys(byWard).sort((a, b) => {
    const ai = wardOrder.indexOf(a), bi = wardOrder.indexOf(b);
    if (ai === -1 && bi === -1) return a.localeCompare(b);
    if (ai === -1) return 1;
    if (bi === -1) return -1;
    return ai - bi;
  });

  const wardIcons = {
    General:'🏥', ICU:'❤️', Emergency:'🚨', Pediatric:'👶', Maternity:'🤰'
  };

  container.innerHTML = sortedWards.map((ward, wi) => {
    const wardBeds = byWard[ward];
    const avail = wardBeds.filter(b => b.status === 'available').length;
    const occ   = wardBeds.filter(b => b.status === 'occupied').length;
    const maint = wardBeds.filter(b => b.status === 'maintenance').length;
    const pct   = Math.round((occ / wardBeds.length) * 100);
    const barCls = pct > 90 ? 'danger' : pct > 75 ? 'warn' : '';
    const icon  = wardIcons[ward] || '🛏';

    const bedStatusIcon = { available: '✓', occupied: '●', maintenance: '⚙' };

    return `
      <div class="card anim-fade-up" style="margin-bottom:20px;animation-delay:${wi * 0.07}s;">
        <div class="ward-summary">
          <div class="ward-name" style="display:flex;align-items:center;gap:8px;">
            <span>${icon}</span>
            ${ward} Ward
          </div>
          <div class="ward-stats">
            <span style="color:var(--emerald-500);">${avail} free</span>
            <span style="color:#94a3b8;">·</span>
            <span style="color:var(--rose-600);">${occ} occupied</span>
            ${maint ? `<span style="color:#94a3b8;">·</span><span style="color:#94a3b8;">${maint} maint.</span>` : ''}
            <span style="color:#94a3b8;">·</span>
            <span style="color:#334155;font-weight:700;">${pct}%</span>
          </div>
        </div>

        <div class="progress-bar" style="margin-bottom:14px;">
          <div class="progress-fill ${barCls}" style="width:${pct}%;"></div>
        </div>

        <div class="bed-grid">
          ${wardBeds.map((bed, bi) => {
            const icon2 = bedStatusIcon[bed.status] || '?';
            const tooltip = `${bed.bed_number} — ${bed.status}${bed.patient_id ? ' (Patient #' + bed.patient_id + ')' : ''}`;
            const numPart = bed.bed_number.split('-')[1] || bed.bed_number;
            return `
              <div class="bed-cell ${bed.status}"
                   onclick="showBedMenu(${bed.id}, '${bed.status}', '${bed.bed_number}', ${bed.patient_id || 'null'})"
                   title="${tooltip}"
                   style="animation:fadeUp 0.3s cubic-bezier(0.16,1,0.3,1) ${(bi * 0.015).toFixed(3)}s both;">
                <div class="bed-num">${numPart}</div>
                <div class="bed-icon">${icon2}</div>
              </div>
            `;
          }).join('')}
        </div>
      </div>
    `;
  }).join('');
}

// ── Bed modal ───────────────────────────────────────────────────
function showBedMenu(id, currentStatus, bedNum, patientId) {
  const modal = document.getElementById('bed-modal');
  document.getElementById('bed-modal-title').textContent = `Bed ${bedNum}`;

  const statusEl = document.getElementById('bed-current-status');
  statusEl.textContent = currentStatus.charAt(0).toUpperCase() + currentStatus.slice(1);
  statusEl.className = `badge ${currentStatus === 'available' ? 'badge-green' : currentStatus === 'occupied' ? 'badge-red' : 'badge-gray'}`;

  const iconEl = document.getElementById('bed-modal-icon');
  iconEl.textContent = currentStatus === 'available' ? '✓' : currentStatus === 'occupied' ? '●' : '⚙';

  const patientEl = document.getElementById('bed-patient-info');
  patientEl.textContent = patientId ? `Patient #${patientId}` : '';

  ['available', 'occupied', 'maintenance'].forEach(s => {
    const btn = document.getElementById(`set-${s}`);
    btn.disabled = (s === currentStatus);
    btn.style.opacity = (s === currentStatus) ? '0.4' : '1';
    btn.onclick = () => updateBedStatus(id, s, bedNum);
  });

  modal.classList.add('open');
}

async function updateBedStatus(id, newStatus, bedNum) {
  try {
    const res = await fetch(`${API}/beds/${id}/status`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: newStatus })
    });

    if (!res.ok) {
      const data = await res.json();
      showToast('⚠ ' + (data.error || 'Update failed'), 'error');
      return;
    }

    closeBedModal();
    showToast(`✓ Bed ${bedNum} → ${newStatus}`, 'success');
    loadBeds();
  } catch {
    showToast('⚠ Cannot connect to API', 'error');
  }
}

function closeBedModal() {
  document.getElementById('bed-modal').classList.remove('open');
}

// ── Init ────────────────────────────────────────────────────────
checkApiHealth();
loadBeds();

// Close on backdrop
document.getElementById('bed-modal').addEventListener('click', function(e) {
  if (e.target === this) closeBedModal();
});