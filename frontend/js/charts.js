/**
 * charts.js — HEA Chart & Visualization Helpers
 * Shared across dashboard, forecast, and report pages
 */

/**
 * Render horizontal occupancy bars per ward.
 */
function renderOccupancyChart(containerId, wardData) {
  const el = document.getElementById(containerId);
  if (!el) return;

  if (!wardData || !wardData.length) {
    el.innerHTML = '<p style="color:#94a3b8;font-size:13px;text-align:center;padding:20px;">No ward data available.</p>';
    return;
  }

  const wardIcons = {
    General: '🏥', ICU: '❤️', Emergency: '🚨',
    Pediatric: '👶', Maternity: '🤰'
  };

  el.innerHTML = wardData.map((ward, i) => {
    const pct     = Math.round(((ward.occupied || 0) / (ward.total || 1)) * 100);
    const barCls  = pct >= 90 ? 'danger' : pct >= 75 ? 'warn' : '';
    const color   = pct >= 90 ? 'var(--rose-600)' : pct >= 75 ? 'var(--amber-500)' : 'var(--emerald-500)';
    const avail   = (ward.available || 0);
    const occ     = (ward.occupied  || 0);
    const icon    = wardIcons[ward.ward] || '🛏';

    return `
      <div style="margin-bottom:18px;animation:fadeUp 0.4s cubic-bezier(0.16,1,0.3,1) ${i*0.06}s both;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
          <span style="font-size:13px;font-weight:600;display:flex;align-items:center;gap:7px;">
            <span>${icon}</span>${ward.ward}
          </span>
          <div style="display:flex;align-items:center;gap:10px;">
            <span style="font-size:11px;color:var(--emerald-500);font-weight:600;">${avail} free</span>
            <span style="font-size:11px;color:#94a3b8;">·</span>
            <span style="font-size:11px;color:${color};font-weight:700;">${pct}%</span>
          </div>
        </div>
        <div class="progress-bar">
          <div class="progress-fill ${barCls}" style="width:${pct}%;animation-delay:${i*0.08 + 0.1}s;"></div>
        </div>
        <div class="progress-label">
          <span style="color:var(--emerald-500);font-weight:500;">${avail} available</span>
          <span>${occ} / ${ward.total || 0}</span>
        </div>
      </div>
    `;
  }).join('');
}

/**
 * Render vertical bar chart for 72-hour forecast.
 */
function renderForecastBars(containerId, forecastData) {
  const el = document.getElementById(containerId);
  if (!el || !forecastData.length) return;

  const maxVal = Math.max(...forecastData.map(d => d.predicted_admissions), 1);
  const dayEmoji = { Monday:'Mo', Tuesday:'Tu', Wednesday:'We', Thursday:'Th', Friday:'Fr', Saturday:'Sa', Sunday:'Su' };

  el.innerHTML = `
    <div class="forecast-bar-wrap">
      ${forecastData.map((d, i) => {
        const totalH = Math.max(4, Math.round((d.predicted_admissions / maxVal) * 110));
        const emH    = Math.max(2, Math.round((d.predicted_emergency  / maxVal) * 110));
        const icuH   = Math.max(2, Math.round((d.predicted_icu        / maxVal) * 110));
        const surgeBorder = d.surge_alert
          ? 'outline:2px solid rgba(225,29,72,0.25);outline-offset:2px;border-radius:8px;padding:4px 2px;'
          : '';

        return `
          <div class="forecast-bar-group" style="${surgeBorder}">
            ${d.surge_alert ? '<div style="font-size:9px;color:var(--rose-600);font-weight:800;text-align:center;margin-bottom:2px;letter-spacing:0.3px;">SURGE</div>' : '<div style="height:14px;"></div>'}
            <div class="forecast-bar-inner">
              <div class="forecast-bar total"
                   style="height:${totalH}px;animation-delay:${i*0.12}s;"
                   title="Total admissions: ${d.predicted_admissions}"></div>
              <div class="forecast-bar emergency"
                   style="height:${emH}px;animation-delay:${i*0.12+0.06}s;"
                   title="Emergency: ${d.predicted_emergency}"></div>
              <div class="forecast-bar icu"
                   style="height:${icuH}px;animation-delay:${i*0.12+0.12}s;"
                   title="ICU: ${d.predicted_icu}"></div>
            </div>
            <div class="forecast-label">
              <strong>${dayEmoji[d.day] || d.day.slice(0,2)}</strong><br>
              ${d.date ? d.date.slice(5) : ''}
              ${d.is_holiday ? ' 🎉' : ''}
            </div>
          </div>
        `;
      }).join('')}
    </div>
    <div class="forecast-legend">
      <div class="legend-item">
        <div class="legend-dot" style="background:var(--navy-700);"></div>
        Total admissions
      </div>
      <div class="legend-item">
        <div class="legend-dot" style="background:var(--rose-500);"></div>
        Emergency
      </div>
      <div class="legend-item">
        <div class="legend-dot" style="background:var(--amber-400);"></div>
        ICU
      </div>
    </div>
  `;
}

/**
 * Render an SVG donut ring for occupancy.
 */
function renderDonut(containerId, pct, label) {
  const el = document.getElementById(containerId);
  if (!el) return;

  const r = 36, cx = 48, cy = 48;
  const circ   = 2 * Math.PI * r;
  const filled = (pct / 100) * circ;
  const color  = pct >= 90 ? '#e11d48' : pct >= 75 ? '#f59e0b' : '#10b981';
  const trackColor = pct >= 90 ? '#ffe4e6' : pct >= 75 ? '#fef3c7' : '#d1fae5';

  el.innerHTML = `
    <svg width="96" height="96" viewBox="0 0 96 96">
      <circle cx="${cx}" cy="${cy}" r="${r}" fill="none"
              stroke="${trackColor}" stroke-width="9"/>
      <circle cx="${cx}" cy="${cy}" r="${r}" fill="none"
              stroke="${color}" stroke-width="9"
              stroke-dasharray="${filled} ${circ}"
              stroke-linecap="round"
              transform="rotate(-90 ${cx} ${cy})"
              style="transition:stroke-dasharray 0.8s cubic-bezier(0.16,1,0.3,1);"/>
      <text x="${cx}" y="${cy - 3}" text-anchor="middle"
            font-size="15" font-weight="800"
            fill="${color}" font-family="Outfit, sans-serif">${pct}%</text>
      <text x="${cx}" y="${cy + 13}" text-anchor="middle"
            font-size="9" fill="#94a3b8"
            font-family="DM Sans, sans-serif" text-transform="uppercase"
            letter-spacing="0.5">${label}</text>
    </svg>
  `;
}

/**
 * Format a timestamp to Indian locale.
 */
function formatTimestamp(ts) {
  if (!ts) return '—';
  return new Date(ts).toLocaleString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit'
  });
}

/**
 * Toast notification (shared). Requires #toast in page.
 */
function showToast(msg, type = '') {
  const t = document.getElementById('toast');
  if (!t) return;
  t.textContent = msg;
  t.className = `toast show ${type}`;
  clearTimeout(t._timer);
  t._timer = setTimeout(() => { t.className = 'toast'; }, 3500);
}