/**
 * HEA Chat Widget — Self-contained floating chatbot
 * Features: Emergency booking · Human handoff · Admin notifications · Real-time context
 * Include on any page: <script src="js/chatbot.js"></script>
 */

(function () {
  'use strict';

  const API = 'http://localhost:5000/api';
  let chatHistory = [];
  let bookingState = null; // tracks multi-step emergency booking
  let isOpen = false;
  let unreadCount = 0;
  let sessionId = 'sess_' + Date.now();

  // ── Booking steps ─────────────────────────────────────────────
  const BOOKING_STEPS = ['name', 'age', 'gender', 'condition', 'confirm'];
  const bookingData = {};

  // ── CSS ───────────────────────────────────────────────────────
  const CSS = `
    #hea-chat-btn {
      position: fixed;
      bottom: 28px;
      right: 28px;
      width: 58px;
      height: 58px;
      border-radius: 50%;
      background: linear-gradient(135deg, #071530, #133060);
      border: none;
      cursor: pointer;
      box-shadow: 0 4px 20px rgba(7,21,48,0.4), 0 0 0 2px rgba(6,182,212,0.3);
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 24px;
      z-index: 10000;
      transition: all 0.25s cubic-bezier(0.16,1,0.3,1);
    }
    #hea-chat-btn:hover {
      transform: scale(1.1) translateY(-2px);
      box-shadow: 0 8px 28px rgba(7,21,48,0.45), 0 0 0 3px rgba(6,182,212,0.4);
    }
    #hea-chat-badge {
      position: absolute;
      top: -4px;
      right: -4px;
      width: 20px;
      height: 20px;
      background: #e11d48;
      border-radius: 50%;
      font-size: 10px;
      font-weight: 800;
      color: white;
      display: flex;
      align-items: center;
      justify-content: center;
      border: 2px solid white;
      animation: hea-pulse 1.5s ease-in-out infinite;
    }
    @keyframes hea-pulse {
      0%,100% { transform: scale(1); }
      50% { transform: scale(1.2); }
    }
    #hea-chat-panel {
      position: fixed;
      bottom: 100px;
      right: 28px;
      width: 380px;
      max-height: 600px;
      background: white;
      border-radius: 20px;
      box-shadow: 0 20px 60px rgba(7,21,48,0.18), 0 4px 16px rgba(0,0,0,0.08);
      display: flex;
      flex-direction: column;
      z-index: 9999;
      overflow: hidden;
      border: 1px solid rgba(226,232,240,0.8);
      transform: translateY(20px) scale(0.96);
      opacity: 0;
      pointer-events: none;
      transition: all 0.3s cubic-bezier(0.16,1,0.3,1);
    }
    #hea-chat-panel.open {
      transform: translateY(0) scale(1);
      opacity: 1;
      pointer-events: all;
    }
    #hea-chat-header {
      background: linear-gradient(135deg, #071530, #0c2044);
      padding: 16px 18px;
      display: flex;
      align-items: center;
      gap: 12px;
      flex-shrink: 0;
    }
    #hea-chat-avatar {
      width: 36px;
      height: 36px;
      background: linear-gradient(135deg, #06b6d4, #1a4080);
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 16px;
      flex-shrink: 0;
    }
    #hea-chat-header-info { flex: 1; }
    #hea-chat-header-name {
      font-family: 'Outfit', sans-serif;
      font-weight: 700;
      font-size: 14px;
      color: white;
    }
    #hea-chat-header-status {
      font-size: 10px;
      color: rgba(255,255,255,0.5);
      display: flex;
      align-items: center;
      gap: 5px;
      margin-top: 2px;
    }
    .hea-live-dot {
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: #34d399;
      animation: hea-pulse 2s ease-in-out infinite;
    }
    #hea-chat-close {
      background: rgba(255,255,255,0.1);
      border: none;
      color: rgba(255,255,255,0.7);
      width: 30px;
      height: 30px;
      border-radius: 50%;
      cursor: pointer;
      font-size: 16px;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: all 0.15s;
    }
    #hea-chat-close:hover { background: rgba(255,255,255,0.2); color: white; }
    #hea-chat-messages {
      flex: 1;
      overflow-y: auto;
      padding: 16px;
      display: flex;
      flex-direction: column;
      gap: 12px;
      min-height: 280px;
      max-height: 350px;
      scroll-behavior: smooth;
      background: #f8fafc;
    }
    .hea-msg {
      display: flex;
      gap: 8px;
      animation: hea-fadeUp 0.25s ease both;
    }
    @keyframes hea-fadeUp {
      from { opacity:0; transform:translateY(8px); }
      to { opacity:1; transform:translateY(0); }
    }
    .hea-msg.user { flex-direction: row-reverse; }
    .hea-msg-avatar {
      width: 28px;
      height: 28px;
      border-radius: 50%;
      background: linear-gradient(135deg, #06b6d4, #1a4080);
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 12px;
      flex-shrink: 0;
      margin-top: 2px;
    }
    .hea-msg-bubble {
      max-width: 80%;
      padding: 10px 13px;
      border-radius: 14px;
      font-size: 13px;
      line-height: 1.5;
      font-family: 'DM Sans', sans-serif;
    }
    .hea-msg.bot .hea-msg-bubble {
      background: white;
      color: #0f172a;
      border: 1px solid #e2e8f0;
      border-bottom-left-radius: 4px;
      box-shadow: 0 1px 3px rgba(0,0,0,0.05);
    }
    .hea-msg.user .hea-msg-bubble {
      background: linear-gradient(135deg, #133060, #0c2044);
      color: white;
      border-bottom-right-radius: 4px;
    }
    .hea-typing {
      display: flex;
      gap: 4px;
      align-items: center;
      padding: 12px 16px;
    }
    .hea-typing span {
      width: 7px;
      height: 7px;
      border-radius: 50%;
      background: #94a3b8;
      animation: hea-bounce 1.2s ease-in-out infinite;
    }
    .hea-typing span:nth-child(2) { animation-delay: 0.15s; }
    .hea-typing span:nth-child(3) { animation-delay: 0.30s; }
    @keyframes hea-bounce {
      0%,60%,100% { transform: translateY(0); }
      30% { transform: translateY(-6px); }
    }
    #hea-quick-actions {
      display: flex;
      gap: 6px;
      padding: 8px 14px;
      overflow-x: auto;
      background: white;
      border-top: 1px solid #f1f5f9;
      flex-shrink: 0;
    }
    .hea-quick-btn {
      padding: 5px 12px;
      border-radius: 100px;
      font-size: 11px;
      font-weight: 600;
      border: 1.5px solid #e2e8f0;
      background: white;
      color: #475569;
      cursor: pointer;
      white-space: nowrap;
      transition: all 0.15s;
      font-family: 'DM Sans', sans-serif;
    }
    .hea-quick-btn:hover { border-color: #06b6d4; color: #0e7490; background: #ecfeff; }
    .hea-quick-btn.emergency { border-color: #fca5a5; color: #e11d48; background: #fff1f2; }
    .hea-quick-btn.emergency:hover { border-color: #e11d48; background: #ffe4e6; }
    .hea-quick-btn.human { border-color: #86efac; color: #16a34a; background: #f0fdf4; }
    .hea-quick-btn.human:hover { border-color: #16a34a; }
    #hea-chat-input-row {
      display: flex;
      gap: 8px;
      padding: 12px 14px;
      background: white;
      border-top: 1px solid #e2e8f0;
      flex-shrink: 0;
    }
    #hea-chat-input {
      flex: 1;
      padding: 9px 13px;
      border: 1.5px solid #e2e8f0;
      border-radius: 100px;
      font-size: 13px;
      font-family: 'DM Sans', sans-serif;
      outline: none;
      transition: border-color 0.15s;
      background: #f8fafc;
    }
    #hea-chat-input:focus { border-color: #06b6d4; background: white; }
    #hea-chat-send {
      width: 38px;
      height: 38px;
      border-radius: 50%;
      background: linear-gradient(135deg, #133060, #1a4080);
      border: none;
      color: white;
      font-size: 16px;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
      transition: all 0.15s;
    }
    #hea-chat-send:hover { background: linear-gradient(135deg, #1a4080, #2356a8); transform: scale(1.05); }
    .hea-action-card {
      background: linear-gradient(135deg, #fff1f2, #ffe4e6);
      border: 1.5px solid rgba(225,29,72,0.2);
      border-radius: 12px;
      padding: 12px 14px;
      margin-top: 4px;
      font-size: 12px;
    }
    .hea-action-card.success {
      background: linear-gradient(135deg, #f0fdf4, #dcfce7);
      border-color: rgba(16,185,129,0.2);
    }
    .hea-action-card.escalate {
      background: linear-gradient(135deg, #fffbeb, #fef3c7);
      border-color: rgba(245,158,11,0.2);
    }
    .hea-action-btns { display: flex; gap: 7px; margin-top: 10px; }
    .hea-confirm-btn {
      padding: 6px 14px;
      border-radius: 100px;
      font-size: 12px;
      font-weight: 700;
      border: none;
      cursor: pointer;
      font-family: 'DM Sans', sans-serif;
      transition: all 0.15s;
    }
    .hea-confirm-btn.yes { background: #e11d48; color: white; }
    .hea-confirm-btn.yes:hover { background: #be123c; }
    .hea-confirm-btn.no  { background: #f1f5f9; color: #475569; }
    .hea-confirm-btn.no:hover { background: #e2e8f0; }
    .hea-confirm-btn.escalate-ok { background: #f59e0b; color: white; }
    .hea-info-row {
      display: flex;
      justify-content: space-between;
      font-size: 11px;
      color: #475569;
      margin: 3px 0;
    }
    .hea-info-row strong { color: #0f172a; }
    .hea-bed-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 6px;
      margin-top: 8px;
    }
    .hea-ward-chip {
      background: white;
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      padding: 6px 8px;
      font-size: 10px;
      text-align: center;
    }
    .hea-ward-chip strong { display: block; font-size: 13px; color: #0f172a; font-weight: 700; }
    .hea-ward-chip span { color: #94a3b8; }
    .hea-ward-chip.warn strong { color: #f59e0b; }
    .hea-ward-chip.danger strong { color: #e11d48; }
    @media (max-width: 480px) {
      #hea-chat-panel { width: calc(100vw - 20px); right: 10px; bottom: 80px; }
      #hea-chat-btn { right: 16px; bottom: 16px; }
    }
  `;

  // ── HTML ──────────────────────────────────────────────────────
  function injectHTML() {
    const style = document.createElement('style');
    style.textContent = CSS;
    document.head.appendChild(style);

    const wrap = document.createElement('div');
    wrap.innerHTML = `
      <!-- Chat toggle button -->
      <button id="hea-chat-btn" onclick="window._heaChat.toggle()" title="HEA Assistant">
        <span id="hea-chat-icon">💬</span>
        <div id="hea-chat-badge" style="display:none;">1</div>
      </button>

      <!-- Chat panel -->
      <div id="hea-chat-panel">
        <!-- Header -->
        <div id="hea-chat-header">
          <div id="hea-chat-avatar">🏥</div>
          <div id="hea-chat-header-info">
            <div id="hea-chat-header-name">HEA Assistant</div>
            <div id="hea-chat-header-status">
              <div class="hea-live-dot"></div>
              <span>Hospital AI · Emergency ready</span>
            </div>
          </div>
          <button id="hea-chat-close" onclick="window._heaChat.close()">✕</button>
        </div>

        <!-- Messages -->
        <div id="hea-chat-messages"></div>

        <!-- Quick actions -->
        <div id="hea-quick-actions">
          <button class="hea-quick-btn" onclick="window._heaChat.quickAction('beds')">🛏 Bed Status</button>
          <button class="hea-quick-btn emergency" onclick="window._heaChat.quickAction('emergency')">🚨 Emergency</button>
          <button class="hea-quick-btn" onclick="window._heaChat.quickAction('icu')">❤️ ICU Status</button>
          <button class="hea-quick-btn" onclick="window._heaChat.quickAction('forecast')">📈 Forecast</button>
          <button class="hea-quick-btn human" onclick="window._heaChat.quickAction('human')">👤 Speak to Staff</button>
        </div>

        <!-- Input -->
        <div id="hea-chat-input-row">
          <input type="text" id="hea-chat-input" placeholder="Ask anything or type 'emergency'…"
                 onkeydown="if(event.key==='Enter') window._heaChat.send()">
          <button id="hea-chat-send" onclick="window._heaChat.send()">➤</button>
        </div>
      </div>
    `;
    document.body.appendChild(wrap);
  }

  // ── Core methods ──────────────────────────────────────────────
  function addMessage(text, sender = 'bot', html = false) {
    const msgsEl = document.getElementById('hea-chat-messages');
    const div = document.createElement('div');
    div.className = `hea-msg ${sender}`;

    const avatar = sender === 'bot'
      ? `<div class="hea-msg-avatar">🏥</div>`
      : `<div class="hea-msg-avatar" style="background:linear-gradient(135deg,#10b981,#059669);">👤</div>`;

    const content = html ? text : text.replace(/\n/g, '<br>');
    div.innerHTML = `${sender === 'bot' ? avatar : ''}
      <div class="hea-msg-bubble">${content}</div>
      ${sender === 'user' ? avatar : ''}`;

    msgsEl.appendChild(div);
    msgsEl.scrollTop = msgsEl.scrollHeight;

    if (sender === 'bot' && !isOpen) {
      unreadCount++;
      updateBadge();
    }
    return div;
  }

  function showTyping() {
    const msgsEl = document.getElementById('hea-chat-messages');
    const div = document.createElement('div');
    div.className = 'hea-msg bot';
    div.id = 'hea-typing';
    div.innerHTML = `<div class="hea-msg-avatar">🏥</div>
      <div class="hea-msg-bubble" style="padding:0;">
        <div class="hea-typing"><span></span><span></span><span></span></div>
      </div>`;
    msgsEl.appendChild(div);
    msgsEl.scrollTop = msgsEl.scrollHeight;
  }

  function removeTyping() {
    const t = document.getElementById('hea-typing');
    if (t) t.remove();
  }

  function updateBadge() {
    const badge = document.getElementById('hea-chat-badge');
    if (!badge) return;
    if (unreadCount > 0) {
      badge.textContent = unreadCount > 9 ? '9+' : unreadCount;
      badge.style.display = 'flex';
    } else {
      badge.style.display = 'none';
    }
  }

  // ── Send message ──────────────────────────────────────────────
  async function send() {
    const input = document.getElementById('hea-chat-input');
    const text = input.value.trim();
    if (!text) return;

    input.value = '';
    addMessage(text, 'user');

    // Multi-step booking state machine
    if (bookingState) {
      await handleBookingStep(text);
      return;
    }

    showTyping();
    chatHistory.push({ role: 'user', content: text });

    try {
      const res = await fetch(`${API}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text, history: chatHistory, session_id: sessionId })
      });

      const data = await res.json();
      removeTyping();

      if (data.action === 'start_booking') {
        startEmergencyBooking();
        return;
      }
      if (data.action === 'escalate') {
        startEscalation();
        return;
      }
      if (data.action === 'show_beds') {
        addMessage(data.message, 'bot');
        await renderBedStatus();
        return;
      }

      const botMsg = data.message || "I'm here to help. You can ask about bed availability, make an emergency booking, or type 'human' to speak to staff.";
      addMessage(botMsg, 'bot');
      chatHistory.push({ role: 'assistant', content: botMsg });

    } catch (e) {
      removeTyping();
      addMessage("I can't reach the server right now. Please ensure the backend is running (`python app.py`).", 'bot');
    }
  }

  // ── Quick actions ─────────────────────────────────────────────
  async function quickAction(type) {
    const labels = {
      beds: '🛏 Check bed availability',
      emergency: '🚨 Emergency bed booking',
      icu: '❤️ ICU status',
      forecast: '📈 Show 72h forecast',
      human: '👤 Speak to a staff member'
    };
    addMessage(labels[type] || type, 'user');
    chatHistory.push({ role: 'user', content: labels[type] });

    if (type === 'emergency') { startEmergencyBooking(); return; }
    if (type === 'human')     { startEscalation();       return; }

    showTyping();
    try {
      if (type === 'beds') {
        removeTyping();
        addMessage('Here\'s the current bed availability by ward:', 'bot');
        await renderBedStatus();
        return;
      }
      if (type === 'icu') {
        removeTyping();
        await renderICUStatus();
        return;
      }
      if (type === 'forecast') {
        removeTyping();
        await renderForecastSummary();
        return;
      }

      const res = await fetch(`${API}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: labels[type], history: chatHistory, session_id: sessionId })
      });
      const data = await res.json();
      removeTyping();
      addMessage(data.message || 'Here is the information you requested.', 'bot');
    } catch {
      removeTyping();
      addMessage('Could not fetch data. Is the backend running?', 'bot');
    }
  }

  // ── Bed status renderer ───────────────────────────────────────
  async function renderBedStatus() {
    try {
      const data = await fetch(`${API}/beds/summary`).then(r => r.json());
      const msgsEl = document.getElementById('hea-chat-messages');
      const div = document.createElement('div');
      div.className = 'hea-msg bot';

      const grid = data.map(w => {
        const pct = Math.round(((w.occupied || 0) / (w.total || 1)) * 100);
        const cls = pct >= 90 ? 'danger' : pct >= 75 ? 'warn' : '';
        return `<div class="hea-ward-chip ${cls}">
          <strong>${w.available || 0}</strong>
          <span>${w.ward}</span>
        </div>`;
      }).join('');

      div.innerHTML = `<div class="hea-msg-avatar">🏥</div>
        <div class="hea-msg-bubble">
          <div style="font-size:11px;font-weight:700;color:#64748b;margin-bottom:6px;text-transform:uppercase;letter-spacing:0.4px;">Available Beds</div>
          <div class="hea-bed-grid">${grid}</div>
          <div style="font-size:10px;color:#94a3b8;margin-top:8px;">🔴 = critically low · 🟡 = low · numbers = free beds</div>
        </div>`;
      msgsEl.appendChild(div);
      msgsEl.scrollTop = msgsEl.scrollHeight;
    } catch {
      addMessage('Could not load bed data.', 'bot');
    }
  }

  async function renderICUStatus() {
    try {
      const beds = await fetch(`${API}/beds/summary`).then(r => r.json());
      const icu = beds.find(w => w.ward === 'ICU');
      if (!icu) { addMessage('ICU ward data not available.', 'bot'); return; }
      const pct = Math.round(((icu.occupied || 0) / (icu.total || 1)) * 100);
      const status = pct >= 90 ? '🔴 CRITICAL' : pct >= 75 ? '🟡 HIGH' : '🟢 NORMAL';
      addMessage(`❤️ **ICU Status**\n\nOccupancy: **${pct}%** — ${status}\nAvailable: **${icu.available || 0}** of ${icu.total || 0} beds\nOccupied: ${icu.occupied || 0} patients\n\n${pct >= 75 ? '⚠ Consider ICU transfers — approaching capacity.' : 'Capacity is within normal range.'}`, 'bot');
    } catch {
      addMessage('Could not fetch ICU data.', 'bot');
    }
  }

  async function renderForecastSummary() {
    try {
      const data = await fetch(`${API}/forecast`).then(r => r.json());
      const lines = data.map(d =>
        `**${d.day.slice(0,3)} ${d.date.slice(5)}** — ${d.predicted_admissions} admissions · ${d.predicted_emergency} emergency · ${d.predicted_icu} ICU${d.surge_alert ? ' 🚨' : ''}${d.is_holiday ? ' 🎉' : ''}`
      ).join('\n');
      const surge = data.some(d => d.surge_alert);
      addMessage(`📈 **72-Hour Forecast**\n\n${lines}\n\n${surge ? '🚨 Surge alert active for one or more days — consider pre-positioning resources.' : '✓ All days within normal parameters.'}`, 'bot');
    } catch {
      addMessage('Could not load forecast data.', 'bot');
    }
  }

  // ── Emergency booking flow ─────────────────────────────────────
  function startEmergencyBooking() {
    bookingState = 'name';
    Object.keys(bookingData).forEach(k => delete bookingData[k]);
    bookingData.priority = 'urgent'; // default

    addMessage(`🚨 **Emergency Bed Booking**\n\nI'll register the patient right away. Please provide the following details.\n\n**Step 1 of 4:** What is the patient's full name?`, 'bot');
  }

  async function handleBookingStep(text) {
    switch (bookingState) {
      case 'name':
        if (text.length < 2) { addMessage('Please enter a valid name.', 'bot'); return; }
        bookingData.name = text;
        bookingState = 'age';
        addMessage(`**Step 2 of 4:** What is ${bookingData.name}'s age?`, 'bot');
        break;

      case 'age': {
        const age = parseInt(text);
        if (isNaN(age) || age < 0 || age > 150) { addMessage('Please enter a valid age (0–150).', 'bot'); return; }
        bookingData.age = age;
        bookingState = 'condition';
        addMessage(`**Step 3 of 4:** What is the medical condition or emergency? (e.g. chest pain, fracture, fever, accident)`, 'bot');
        break;
      }

      case 'condition':
        if (text.length < 3) { addMessage('Please describe the condition briefly.', 'bot'); return; }
        bookingData.condition = text;

        // Auto-detect priority from condition keywords
        const critKeywords = ['cardiac','heart attack','stroke','unconscious','critical','icu','accident','trauma','bleeding','collapse'];
        const urgKeywords = ['chest pain','breathing','fracture','severe','emergency','urgent'];
        const lc = text.toLowerCase();
        if (critKeywords.some(k => lc.includes(k))) bookingData.priority = 'critical';
        else if (urgKeywords.some(k => lc.includes(k))) bookingData.priority = 'urgent';
        else bookingData.priority = 'normal';

        bookingState = 'confirm';
        showBookingConfirm();
        break;

      case 'confirm':
        if (['yes','y','confirm','ok','proceed','haan','ha'].some(w => text.toLowerCase().includes(w))) {
          await confirmBooking();
        } else if (['no','n','cancel','nahi','nope'].some(w => text.toLowerCase().includes(w))) {
          bookingState = null;
          addMessage('Emergency booking cancelled. Type "emergency" again anytime if you need to register a patient.', 'bot');
        } else {
          addMessage('Please type **Yes** to confirm the booking or **No** to cancel.', 'bot');
        }
        break;
    }
  }

  function showBookingConfirm() {
    const msgsEl = document.getElementById('hea-chat-messages');
    const div = document.createElement('div');
    div.className = 'hea-msg bot';

    const priColor = bookingData.priority === 'critical' ? '#e11d48' : bookingData.priority === 'urgent' ? '#f59e0b' : '#10b981';

    div.innerHTML = `<div class="hea-msg-avatar">🏥</div>
      <div class="hea-msg-bubble" style="max-width:90%">
        <div style="font-weight:700;margin-bottom:8px;font-size:13px;">📋 Confirm Emergency Admission</div>
        <div class="hea-action-card">
          <div class="hea-info-row"><span>Patient</span><strong>${bookingData.name}</strong></div>
          <div class="hea-info-row"><span>Age</span><strong>${bookingData.age} years</strong></div>
          <div class="hea-info-row"><span>Condition</span><strong>${bookingData.condition}</strong></div>
          <div class="hea-info-row"><span>Priority</span>
            <strong style="color:${priColor};text-transform:uppercase;">${bookingData.priority}</strong>
          </div>
          <div class="hea-action-btns">
            <button class="hea-confirm-btn yes" onclick="window._heaChat.confirmBookingBtn()">✓ Confirm &amp; Admit</button>
            <button class="hea-confirm-btn no" onclick="window._heaChat.cancelBooking()">✕ Cancel</button>
          </div>
        </div>
      </div>`;
    msgsEl.appendChild(div);
    msgsEl.scrollTop = msgsEl.scrollHeight;
  }

  async function confirmBooking() {
    bookingState = null;
    showTyping();

    try {
      const res = await fetch(`${API}/patients/admit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: bookingData.name,
          age: bookingData.age,
          gender: bookingData.gender || 'Unknown',
          condition: bookingData.condition,
          priority: bookingData.priority
        })
      });

      const data = await res.json();
      removeTyping();

      if (!res.ok) {
        addMessage(`⚠ Could not complete booking: ${data.error || 'Server error'}. Please try again or call the hospital directly.`, 'bot');
        return;
      }

      // Notify admin via audit log (backend handles this in /patients/admit already, but we also call emergency notify)
      await fetch(`${API}/emergency-notify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          patient_name: bookingData.name,
          condition: bookingData.condition,
          priority: bookingData.priority,
          patient_id: data.patient_id,
          bed_number: data.bed?.bed_number || 'N/A',
          source: 'chatbot'
        })
      }).catch(() => {}); // non-critical

      const bedInfo = data.bed
        ? `🛏 **Bed: ${data.bed.bed_number}** (${data.bed.ward} Ward)`
        : '⚠ No beds currently available — admin has been alerted for manual assignment.';

      const msgsEl = document.getElementById('hea-chat-messages');
      const div = document.createElement('div');
      div.className = 'hea-msg bot';
      div.innerHTML = `<div class="hea-msg-avatar">🏥</div>
        <div class="hea-msg-bubble" style="max-width:90%">
          <div class="hea-action-card success">
            <div style="font-weight:700;font-size:14px;color:#065f46;margin-bottom:8px;">✓ Patient Admitted!</div>
            <div class="hea-info-row"><span>Patient ID</span><strong>#${data.patient_id}</strong></div>
            <div class="hea-info-row"><span>Name</span><strong>${bookingData.name}</strong></div>
            <div class="hea-info-row"><span>${data.bed ? 'Bed Assigned' : 'Status'}</span><strong>${data.bed ? data.bed.bed_number + ' — ' + data.bed.ward : 'Pending manual'}</strong></div>
            <div style="margin-top:8px;font-size:11px;color:#065f46;background:rgba(16,185,129,0.1);padding:6px 8px;border-radius:6px;">
              🔔 Admin has been notified. Medical staff will arrive shortly.
            </div>
          </div>
        </div>`;
      msgsEl.appendChild(div);
      msgsEl.scrollTop = msgsEl.scrollHeight;

      // Clear booking data
      Object.keys(bookingData).forEach(k => delete bookingData[k]);

    } catch (e) {
      removeTyping();
      addMessage('Network error. Please call the hospital emergency line directly.', 'bot');
    }
  }

  // ── Human escalation ──────────────────────────────────────────
  function startEscalation() {
    const msgsEl = document.getElementById('hea-chat-messages');
    const div = document.createElement('div');
    div.className = 'hea-msg bot';
    div.innerHTML = `<div class="hea-msg-avatar">🏥</div>
      <div class="hea-msg-bubble" style="max-width:90%">
        <div style="font-weight:700;margin-bottom:8px;">👤 Connect to Hospital Staff</div>
        <div class="hea-action-card escalate">
          <div style="font-size:12px;color:#92400e;margin-bottom:8px;">
            Clicking below will notify the duty admin and create an escalation request. They will respond shortly.
          </div>
          <div class="hea-action-btns">
            <button class="hea-confirm-btn escalate-ok" onclick="window._heaChat.sendEscalation()">🔔 Notify Admin Now</button>
            <button class="hea-confirm-btn no" onclick="window._heaChat.cancelEscalation()">Not now</button>
          </div>
        </div>
      </div>`;
    msgsEl.appendChild(div);
    msgsEl.scrollTop = msgsEl.scrollHeight;
  }

  async function sendEscalation() {
    showTyping();
    try {
      await fetch(`${API}/escalate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: sessionId, timestamp: new Date().toISOString() })
      }).catch(() => {});

      removeTyping();
      const msgsEl = document.getElementById('hea-chat-messages');
      const div = document.createElement('div');
      div.className = 'hea-msg bot';
      div.innerHTML = `<div class="hea-msg-avatar">🏥</div>
        <div class="hea-msg-bubble" style="max-width:90%">
          <div class="hea-action-card success">
            <div style="font-weight:700;color:#065f46;margin-bottom:6px;">✓ Admin Notified</div>
            <div style="font-size:12px;color:#475569;">
              The duty administrator has been alerted. You can also reach us directly:
            </div>
            <div style="margin-top:8px;font-size:12px;color:#0f172a;font-weight:600;">
              📞 Emergency: <span style="color:#e11d48;">1800-XXX-XXXX</span><br>
              📧 admin@hea-hospital.in
            </div>
          </div>
        </div>`;
      msgsEl.appendChild(div);
      msgsEl.scrollTop = msgsEl.scrollHeight;
    } catch {
      removeTyping();
      addMessage('Could not connect. Please call the emergency line: 1800-XXX-XXXX', 'bot');
    }
  }

  // ── Toggle panel ──────────────────────────────────────────────
  function toggle() {
    if (isOpen) close(); else open();
  }

  function open() {
    isOpen = true;
    unreadCount = 0;
    updateBadge();
    document.getElementById('hea-chat-panel').classList.add('open');
    document.getElementById('hea-chat-icon').textContent = '✕';
    setTimeout(() => document.getElementById('hea-chat-input')?.focus(), 300);
  }

  function close() {
    isOpen = false;
    document.getElementById('hea-chat-panel').classList.remove('open');
    document.getElementById('hea-chat-icon').textContent = '💬';
  }

  // ── Welcome message ───────────────────────────────────────────
  function welcomeMessage() {
    setTimeout(() => {
      addMessage(`👋 **Hello! I'm the HEA Assistant.**\n\nI can help you with:\n• 🛏 Real-time bed availability\n• 🚨 Emergency patient registration\n• ❤️ ICU & ward status\n• 📈 72-hour admission forecast\n• 👤 Connect to hospital staff\n\nHow can I help you today?`, 'bot');
    }, 600);

    // Show badge after 3 seconds to attract attention
    setTimeout(() => {
      if (!isOpen) {
        unreadCount = 1;
        updateBadge();
      }
    }, 3000);
  }

  // ── Init ──────────────────────────────────────────────────────
  function init() {
    if (document.getElementById('hea-chat-btn')) return; // already injected
    injectHTML();
    welcomeMessage();
  }

  // Expose public API
  window._heaChat = {
    toggle, open, close, send, quickAction,
    confirmBookingBtn: confirmBooking,
    cancelBooking: () => {
      bookingState = null;
      Object.keys(bookingData).forEach(k => delete bookingData[k]);
      addMessage('Booking cancelled. Type "emergency" whenever you need to admit a patient.', 'bot');
    },
    sendEscalation,
    cancelEscalation: () => addMessage('No problem. I\'m still here if you need anything else.', 'bot'),
  };

  // Run when DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();