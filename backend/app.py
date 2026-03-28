"""
HEA — Hospital Emergency Allocation  v2.1
Main Flask Application — includes Chat API, Notifications, Escalations

Run: python app.py
API: http://localhost:5000
"""
import sys, os, json, re
sys.path.insert(0, os.path.dirname(__file__))
sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'models'))

from flask import Flask, jsonify, request, send_file
from flask_cors import CORS

from db import init_db, get_db
from models.bed import get_all_beds, get_bed_summary, allocate_bed, release_bed, get_occupancy_rate
from models.patient import admit_patient, discharge_patient, get_active_patients, get_patient_stats
from ml.predict import predict_next_72h
from alerts import check_alerts

app = Flask(__name__)
CORS(app, resources={r"/api/*": {"origins": "*"}})

# ─── HEALTH CHECK ────────────────────────────────────────────────
@app.route('/api/health')
def health():
    return jsonify({"status": "ok", "message": "HEA API running", "version": "2.1"})

# ─── DASHBOARD SUMMARY ───────────────────────────────────────────
@app.route('/api/dashboard')
def dashboard():
    try:
        bed_summary   = get_bed_summary()
        patient_stats = get_patient_stats()
        alerts        = check_alerts()
        occupancy     = get_occupancy_rate()
        conn = get_db()
        resources = [dict(r) for r in conn.execute("SELECT * FROM resources").fetchall()]
        # Unread notification count
        notif_count = conn.execute(
            "SELECT COUNT(*) FROM notifications WHERE is_read=0"
        ).fetchone()[0]
        conn.close()
        return jsonify({
            "bed_summary":       bed_summary,
            "patient_stats":     patient_stats,
            "alerts":            alerts,
            "occupancy_rate":    occupancy,
            "resources":         resources,
            "notification_count": notif_count,
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 500

# ─── BEDS ─────────────────────────────────────────────────────────
@app.route('/api/beds')
def beds():
    try:
        ward = request.args.get('ward')
        all_beds = get_all_beds()
        if ward:
            all_beds = [b for b in all_beds if b['ward'].lower() == ward.lower()]
        return jsonify(all_beds)
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/beds/summary')
def beds_summary():
    try:
        return jsonify(get_bed_summary())
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/beds/allocate', methods=['POST'])
def allocate():
    try:
        data = request.get_json() or {}
        patient_id = data.get('patient_id')
        ward = data.get('ward')
        if not patient_id:
            return jsonify({"error": "patient_id is required"}), 400
        bed, err = allocate_bed(patient_id, ward)
        if err:
            return jsonify({"error": err}), 400
        return jsonify({"bed": bed, "message": "Bed allocated"})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/beds/release', methods=['POST'])
def release():
    try:
        data = request.get_json() or {}
        bed_id = data.get('bed_id')
        if not bed_id:
            return jsonify({"error": "bed_id is required"}), 400
        release_bed(bed_id)
        return jsonify({"message": "Bed released"})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/beds/<int:bed_id>/status', methods=['PUT'])
def update_bed_status(bed_id):
    try:
        data = request.get_json() or {}
        status = data.get('status')
        if status not in ['available', 'occupied', 'maintenance']:
            return jsonify({"error": "Invalid status"}), 400
        conn = get_db()
        conn.execute("UPDATE beds SET status=?, updated_at=CURRENT_TIMESTAMP WHERE id=?", (status, bed_id))
        conn.execute("INSERT INTO audit_log (action, details) VALUES (?, ?)",
                     ("BED_STATUS_CHANGE", f"Bed {bed_id} set to {status}"))
        conn.commit()
        conn.close()
        return jsonify({"message": f"Bed {bed_id} status → {status}"})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

# ─── PATIENTS ─────────────────────────────────────────────────────
@app.route('/api/patients')
def patients():
    try:
        return jsonify(get_active_patients())
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/patients/admit', methods=['POST'])
def admit():
    try:
        data = request.get_json() or {}
        for f in ['name', 'age', 'gender', 'condition']:
            if not data.get(f) and data.get(f) != 0:
                return jsonify({"error": f"'{f}' is required"}), 400
        patient_id = admit_patient(
            name=data['name'], age=data['age'],
            gender=data['gender'], condition=data['condition'],
            priority=data.get('priority', 'normal'), ward=data.get('ward')
        )
        bed, bed_err = allocate_bed(patient_id, data.get('ward'))
        return jsonify({"patient_id": patient_id, "bed": bed, "bed_error": bed_err,
                        "message": "Patient admitted" + (" and bed allocated" if bed else " (no beds available)")})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/patients/<int:patient_id>/discharge', methods=['POST'])
def discharge(patient_id):
    try:
        ok, msg = discharge_patient(patient_id)
        if not ok:
            return jsonify({"error": msg}), 404
        return jsonify({"message": msg})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

# ─── FORECAST ─────────────────────────────────────────────────────
@app.route('/api/forecast')
def forecast():
    try:
        return jsonify(predict_next_72h())
    except Exception as e:
        return jsonify({"error": str(e)}), 500

# ─── ALERTS ───────────────────────────────────────────────────────
@app.route('/api/alerts')
def alerts():
    try:
        return jsonify(check_alerts())
    except Exception as e:
        return jsonify({"error": str(e)}), 500

# ─── RESOURCES ────────────────────────────────────────────────────
@app.route('/api/resources')
def resources():
    try:
        conn = get_db()
        rows = conn.execute("SELECT * FROM resources").fetchall()
        conn.close()
        return jsonify([dict(r) for r in rows])
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/resources/<int:res_id>', methods=['PUT'])
def update_resource(res_id):
    try:
        data = request.get_json() or {}
        available = data.get('available')
        if available is None:
            return jsonify({"error": "'available' required"}), 400
        conn = get_db()
        conn.execute("UPDATE resources SET available=?, updated_at=CURRENT_TIMESTAMP WHERE id=?", (available, res_id))
        conn.execute("INSERT INTO audit_log (action, details) VALUES (?, ?)",
                     ("RESOURCE_UPDATE", f"Resource {res_id} available={available}"))
        conn.commit()
        conn.close()
        return jsonify({"message": "Updated"})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

# ─── REPORTS ──────────────────────────────────────────────────────
@app.route('/api/reports/audit')
def audit_log():
    try:
        limit = request.args.get('limit', 100, type=int)
        conn = get_db()
        rows = conn.execute("SELECT * FROM audit_log ORDER BY timestamp DESC LIMIT ?", (limit,)).fetchall()
        conn.close()
        return jsonify([dict(r) for r in rows])
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/reports/pdf')
def download_pdf():
    try:
        from reports.generate_pdf import generate_report
        path = generate_report()
        return send_file(path, as_attachment=True, download_name="HEA_Report.pdf")
    except ImportError:
        return jsonify({"error": "reportlab not installed. Run: pip install reportlab"}), 500
    except Exception as e:
        return jsonify({"error": str(e)}), 500

# ─── STAFF ────────────────────────────────────────────────────────
@app.route('/api/staff')
def staff():
    try:
        conn = get_db()
        rows = conn.execute("SELECT * FROM staff").fetchall()
        conn.close()
        return jsonify([dict(r) for r in rows])
    except Exception as e:
        return jsonify({"error": str(e)}), 500

# ═══════════════════════════════════════════════════════════════════
# ─── CHATBOT ──────────────────────────────────────────────────────
# ═══════════════════════════════════════════════════════════════════

def _get_chat_context():
    """Build a real-time hospital summary for the chatbot system prompt."""
    try:
        conn = get_db()
        bed_summary = get_bed_summary()
        resources   = [dict(r) for r in conn.execute("SELECT * FROM resources").fetchall()]
        alerts      = check_alerts()
        occ         = get_occupancy_rate()
        ps          = get_patient_stats()
        forecast    = predict_next_72h()
        conn.close()

        beds_text = "\n".join([
            f"  {w['ward']}: {w['available']} available / {w['total']} total ({round((w['occupied']/w['total'])*100)}% occupied)"
            for w in bed_summary if w['total'] > 0
        ])

        res_text = "\n".join([
            f"  {r['name']}: {r['available']}/{r['total']} available"
            for r in resources
        ])

        alert_text = "\n".join([f"  [{a['level'].upper()}] {a['message']}" for a in alerts]) or "  None"

        fore_text = "\n".join([
            f"  {f['day']} {f['date']}: ~{f['predicted_admissions']} admissions, {f['predicted_icu']} ICU, {f['predicted_emergency']} Emergency{'  ⚠ SURGE' if f['surge_alert'] else ''}"
            for f in forecast
        ])

        return f"""
=== LIVE HOSPITAL STATUS ===
Overall Occupancy: {occ}%
Active Patients: {ps.get('total_active',0)} (Urgent/Critical: {ps.get('urgent',0)})
Admitted Today: {ps.get('admitted_today',0)}

Bed Availability by Ward:
{beds_text}

Resources:
{res_text}

Active Alerts:
{alert_text}

72-Hour Admission Forecast:
{fore_text}
==========================
"""
    except Exception as e:
        return f"[Could not fetch live data: {e}]"


def _rule_based_chat(message, context):
    """
    Fallback rule-based chatbot when Anthropic API is not configured.
    Returns (response_text, action)
    """
    lc = message.lower()

    # Emergency booking trigger
    if any(w in lc for w in ['emergency', 'admit', 'book a bed', 'need bed', 'patient registration', 'register patient', 'book bed']):
        return ("I'll help you register an emergency patient right away.", "start_booking")

    # Human escalation trigger
    if any(w in lc for w in ['human', 'staff', 'doctor', 'speak to', 'connect', 'nurse', 'talk to someone', 'real person']):
        return ("Let me connect you with hospital staff.", "escalate")

    # Bed status
    if any(w in lc for w in ['bed', 'beds', 'available', 'occupancy', 'ward', 'room']):
        return ("Here is the current bed availability:", "show_beds")

    # ICU
    if 'icu' in lc or 'intensive' in lc:
        lines = [l for l in context.split('\n') if 'icu' in l.lower()]
        info = lines[0].strip() if lines else 'ICU data not available'
        return (f"ICU Status from the dashboard:\n{info}\n\nType 'emergency' to register an ICU patient.", None)

    # Forecast
    if any(w in lc for w in ['forecast', 'predict', 'tomorrow', '72', 'inflow', 'admissions']):
        return ("Let me pull the 72-hour forecast for you.", "show_forecast")

    # Resource
    if any(w in lc for w in ['ventilator', 'oxygen', 'resource', 'equipment', 'ot', 'wheelchair']):
        lines = [l for l in context.split('\n') if any(k in l.lower() for k in ['ventilator','oxygen','ot room','wheelchair','icu monitor'])]
        info = '\n'.join(lines[:5]) if lines else 'Resource data not available.'
        return (f"Resource availability:\n{info}", None)

    # Greetings
    if any(w in lc for w in ['hi', 'hello', 'hey', 'namaste', 'hii', 'good morning', 'good evening']):
        return ("Hello! I'm the HEA Assistant. I can help you with:\n• Bed availability\n• Emergency patient registration\n• ICU & resource status\n• 72-hour forecast\n• Connecting to staff\n\nWhat do you need?", None)

    # Help
    if any(w in lc for w in ['help', 'what can you', 'options', 'capabilities']):
        return ("I can help you with:\n\n🛏 **Bed Status** — check availability by ward\n🚨 **Emergency Booking** — register patients instantly\n❤️ **ICU Status** — current ICU occupancy\n📈 **Forecast** — 72-hour admission prediction\n👤 **Staff Connect** — escalate to human staff\n\nJust type what you need or use the quick buttons below!", None)

    # Default
    return (
        "I'm here to help with hospital operations. Try asking about:\n"
        "• 'bed availability'\n• 'emergency booking'\n• 'ICU status'\n• 'forecast'\n"
        "Or type 'human' to speak to staff.",
        None
    )


@app.route('/api/chat', methods=['POST'])
def chat_endpoint():
    """
    AI chatbot endpoint.
    Uses Anthropic Claude API if ANTHROPIC_API_KEY is set, otherwise rule-based fallback.
    """
    try:
        data       = request.get_json() or {}
        message    = data.get('message', '').strip()
        history    = data.get('history', [])   # list of {role, content}
        session_id = data.get('session_id', 'unknown')

        if not message:
            return jsonify({"message": "Please say something!", "action": None}), 200

        # Get live hospital context
        context = _get_chat_context()

        # Try Anthropic API
        api_key = os.environ.get('ANTHROPIC_API_KEY', '')
        response_text = None
        action = None

        if api_key:
            try:
                import anthropic

                system_prompt = f"""You are HEA Assistant — the AI chatbot for a Hospital Emergency Allocation system in India.
You are helpful, concise, and professional. You respond in English.

{context}

CAPABILITIES:
1. Answer questions about bed availability, resources, ICU, wards, staff
2. Help register emergency patients (collect details step by step)
3. Provide the 72-hour demand forecast
4. Escalate to human staff when needed

ACTIONS — when the user's intent is clear, return a JSON action block ONLY if needed:
- To start emergency booking: respond naturally AND include: {{"action":"start_booking"}}
- To escalate to human: include: {{"action":"escalate"}}
- To show bed status widget: include: {{"action":"show_beds"}}
- To show forecast widget: include: {{"action":"show_forecast"}}

RULES:
- Be concise (max 3-4 sentences for normal replies)
- For emergency/life-threatening situations, always prioritize booking or escalation
- Never make up patient data or invent bed counts — use only the data provided above
- If data is unavailable, say so and offer to connect with staff
- Do NOT output the JSON action block as visible text — it will be stripped by the client
"""

                messages_to_send = history[-6:] + [{"role": "user", "content": message}]

                client = anthropic.Anthropic(api_key=api_key)
                claude_response = client.messages.create(
                    model="claude-sonnet-4-20250514",
                    max_tokens=400,
                    system=system_prompt,
                    messages=messages_to_send
                )
                raw = claude_response.content[0].text

                # Extract action from JSON block in response
                match = re.search(r'\{[^{}]*"action"[^{}]*\}', raw, re.DOTALL)
                if match:
                    try:
                        action_obj = json.loads(match.group())
                        action = action_obj.get('action')
                        raw = re.sub(r'\{[^{}]*"action"[^{}]*\}', '', raw, flags=re.DOTALL).strip()
                    except Exception:
                        pass

                response_text = raw.strip()

            except ImportError:
                pass  # anthropic not installed
            except Exception as e:
                print(f"[Anthropic API error]: {e}")

        # Fall back to rule-based if API not available or failed
        if not response_text:
            response_text, action = _rule_based_chat(message, context)

        return jsonify({
            "message": response_text,
            "action": action,
            "session_id": session_id
        })

    except Exception as e:
        return jsonify({"message": "Internal error. Please try again.", "action": None, "error": str(e)}), 500


# ─── EMERGENCY NOTIFY (chatbot → admin) ───────────────────────────
@app.route('/api/emergency-notify', methods=['POST'])
def emergency_notify():
    """
    Called after chatbot successfully books an emergency patient.
    Creates an admin notification and logs to audit.
    """
    try:
        data = request.get_json() or {}
        patient_name = data.get('patient_name', 'Unknown')
        condition    = data.get('condition', '')
        priority     = data.get('priority', 'urgent')
        patient_id   = data.get('patient_id')
        bed_number   = data.get('bed_number', 'N/A')
        source       = data.get('source', 'chatbot')

        conn = get_db()
        conn.execute(
            "INSERT INTO audit_log (action, details) VALUES (?, ?)",
            ("EMERGENCY_CHAT_BOOKING",
             f"[{priority.upper()}] {patient_name} — {condition} — Bed: {bed_number} — via {source}")
        )
        # Create admin notification
        conn.execute(
            "INSERT INTO notifications (type, title, message, priority, is_read) VALUES (?, ?, ?, ?, 0)",
            ("emergency",
             f"🚨 Emergency Booking via Chat",
             f"Patient: {patient_name} | {condition} | Priority: {priority} | Bed: {bed_number}",
             priority)
        )
        conn.commit()
        conn.close()
        return jsonify({"message": "Admin notified"})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


# ─── ESCALATION (chat → human handoff) ───────────────────────────
@app.route('/api/escalate', methods=['POST'])
def escalate():
    """
    Create a human escalation request from the chatbot.
    Admin can see these in the notifications panel.
    """
    try:
        data       = request.get_json() or {}
        session_id = data.get('session_id', 'unknown')

        conn = get_db()
        conn.execute(
            "INSERT INTO audit_log (action, details) VALUES (?, ?)",
            ("CHAT_ESCALATION", f"User requested human handoff — session {session_id}")
        )
        conn.execute(
            "INSERT INTO notifications (type, title, message, priority, is_read) VALUES (?, ?, ?, ?, 0)",
            ("escalation",
             "👤 Human Handoff Requested",
             f"A user has requested to speak to staff — session {session_id}",
             "urgent")
        )
        conn.commit()
        conn.close()
        return jsonify({"message": "Escalation created"})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


# ─── NOTIFICATIONS ────────────────────────────────────────────────
@app.route('/api/notifications')
def notifications():
    """Get all admin notifications (unread first)."""
    try:
        conn = get_db()
        rows = conn.execute(
            "SELECT * FROM notifications ORDER BY is_read ASC, created_at DESC LIMIT 50"
        ).fetchall()
        conn.close()
        return jsonify([dict(r) for r in rows])
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/notifications/read', methods=['POST'])
def mark_notifications_read():
    """Mark all notifications as read."""
    try:
        conn = get_db()
        conn.execute("UPDATE notifications SET is_read=1")
        conn.commit()
        conn.close()
        return jsonify({"message": "All notifications marked read"})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


# ─── STARTUP ──────────────────────────────────────────────────────
if __name__ == '__main__':
    print("=" * 56)
    print("  HEA — Hospital Emergency Allocation v2.1")
    print("=" * 56)
    print("  Initialising database…")
    init_db()
    print("  ✓ Database ready")

    api_key = os.environ.get('ANTHROPIC_API_KEY', '')
    if api_key:
        print("  ✓ Anthropic API key found — Claude-powered chatbot active")
    else:
        print("  ⚠  No ANTHROPIC_API_KEY — using rule-based chatbot fallback")
        print("     Set it with: export ANTHROPIC_API_KEY=sk-ant-...")

    print("  ✓ API running at http://localhost:5000")
    print("  Frontend: open frontend/index.html in browser")
    print("  Health:   http://localhost:5000/api/health")
    print("=" * 56)
    app.run(debug=True, host='0.0.0.0', port=5000)