# GuardianLink 🛡️

**Live Deployed Application**: [https://gdgphase1-git-main-tanishs-projects-29e7549d.vercel.app/](https://gdgphase1-git-main-tanishs-projects-29e7549d.vercel.app/)

GuardianLink is a discreet, production-grade personal safety and abuse-response web platform designed for vulnerable individuals (children, women, the elderly, or anyone at risk). The frontend presents a disguised utilities calculator that hides a secure, Material Design 3 dashboard. In danger, entering your secret PIN unlocks a safety network equipped with AI-powered voice monitoring, commute deviation tracking, and auto-escalation capabilities.

---

## 🚀 Advanced Production Capabilities

### 1. Material Design 3 Interface
- Styled with Google's official **Material Design 3 Palette**:
  - **Google Blue (`#1a73e8`)**: Used for branding highlights, active tab states, and primary actions.
  - **Google Green (`#34a853`)**: Represents safety verifications and successful system check-ins.
  - **Google Yellow (`#fbbc04`)**: Identifies moderate-risk warnings on logs.
  - **Google Red (`#ea4335`)**: Reserved strictly for distress emergencies and high-priority alarms.
- Loaded **Google Sans** typography globally for a native Google-style visual experience.
- Uses official **Material Symbols Outlined** (`local_police`, `emergency`, `mic`, `commute`, `shield`, `group`, `history`, `settings`) in place of generic emojis and SVGs.
- Outlined form inputs, flat cards (`16px` rounding), and pill buttons for tap targets.

### 2. Pattern-Aware Voice Distress Analyzer (Phase 2)
- Maintains a rolling queue of the last 5 speech transcript segments recorded locally via standard browser Web Speech APIs.
- Submits the rolling queue to generative models (Gemini/OpenAI) to analyze tone, urgency, or repeated calls for assistance.
- Computes risk states (`none` | `low` | `medium` | `high`) and appends chronological risk reasons directly to the timeline logs.

### 3. Commute/Travel Mode Anomaly Detection (Phase 2)
- Actively tracks the user's travel location trail and ETA timers.
- Triggers a check-in overlay if the system detects simulated route deviations or extended stop anomalies.
- Incorporates a default `ESCALATION_TIMEOUT_SECONDS = 15` countdown timer to safely confirm user well-being.

### 4. Unresponsive Auto-Escalation Loop (Phase 3)
- If the user fails to confirm their safety when prompted by a commute check-in, the system automatically upgrades the risk state to `high` and activates the full-screen SOS overlay.
- A secondary 15-second countdown starts on the active SOS overlay. 
- Continued unresponsiveness automatically triggers the `/api/sos/escalate` API, upgrading the incident to `escalated` status.
- Once escalated, the **Official Government Helplines** section pulses in red at the top of the interface for immediate access.

### 5. Dual-Tier Trusted Circle Contacts (Phase 3)
- **Tier 1 (Primary Circle)**: Alerted immediately via SMS & Email during normal alarms (supports up to 3 contacts).
- **Tier 2 (Secondary/Wider Circle)**: Notified exclusively during escalated, unresponsive states to expand the safety circle when seconds count (supports up to 2 contacts).

---

## 🛠️ Production Architecture & API Setup

To run GuardianLink with real production dispatch and database persistence, supply the following keys in your environment configurations:

### 1. Database Persistence (Supabase SQL)
Initialize the PostgreSQL tables by running the contents of [`schema.sql`](file:///d:/promptwargdgmmdu/schema.sql) in your Supabase SQL editor, then supply:
```env
SUPABASE_URL=https://your-project-id.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-supabase-service-role-key
```

### 2. Twilio SMS Integration
Allows dispatching real-time SMS alerts to contacts containing masked GPS coordinates and live share links:
```env
TWILIO_ACCOUNT_SID=ACXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX
TWILIO_AUTH_TOKEN=your-twilio-auth-token
TWILIO_FROM_NUMBER=+15551234567
```

### 3. SMTP Email Dispatch (e.g. Gmail)
Sends rich security notifications during distress alerts:
```env
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-gmail-app-password
SMTP_FROM_EMAIL=your-email@gmail.com
```

### 4. Generative AI Classification
Supply either key to run the live pattern distress analyzer:
```env
GEMINI_API_KEY=your-gemini-api-key
OPENAI_API_KEY=your-openai-api-key
```

---

## 🧪 Automated Verification Suite

GuardianLink comes equipped with a comprehensive integration test suite. Verify routing logic, safe-zones, public sharing, and unresponsive auto-escalation by running:

```bash
# Install dependencies
npm install

# Run integration tests
npm test
```
