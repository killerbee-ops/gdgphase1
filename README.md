# GuardianLink 🛡️

GuardianLink is a discreet, fully functional personal safety and abuse-response web application designed for vulnerable individuals (children, women, elderly, or anyone at risk). It features a disguised frontend interface (looks like a normal utility calculator) that hides a security dashboard containing safety settings, trusted contacts, fake call scheduling, and incident logs.

## Core Features

- **Disguised Interface**: A fully functioning arithmetic calculator layout.
- **Hidden Triggers**:
  - **Secret Code**: Enter `911` (or your custom SOS PIN) and press `=` to trigger a silent alarm.
  - **Gesture Control**: Triple-tap anywhere on the screen within 1 second.
  - **Button Hold**: Hold the `=` button for 3 seconds.
- **Silent Alert Dispatch**: Immediately captures geolocation (with fallback to last-known cached GPS) and sends real alerts containing a Google Maps link to your trusted contacts list via Twilio SMS and SMTP Email.
- **Discreet Feedback**: In Discreet Mode, triggering the alarm does not show any visual/audio confirmation on-screen, keeping it hidden from nearby abusers.
- **Fake Call / Exit Excuse**: Schedule simulated incoming phone calls (with realistic phone layouts, timer, and ringtone) to give you a socially acceptable reason to leave a dangerous situation.
- **Safe-word Check-In**: Cancel false alarms or mark yourself as safe by entering your PIN or safe-word. This updates the database and notifies contacts that you are safe.
- **Incident Logs**: View a tamper-proof timestamped trail of incidents with map links for evidence.

---

## Tech Stack

- **Backend**: Node.js + Express
- **Frontend**: Responsive HTML5, CSS3, ES6 JavaScript (includes a custom Web Audio API synthesizer for the ringtone)
- **Database**: Supabase (PostgreSQL) with a local JSON DB fallback (`local_db.json`)
- **Alert Dispatch**: Twilio (SMS) and Nodemailer (SMTP Email) with automatic local logging fallback

---

## Quick Start (Local Mock Mode)

GuardianLink runs immediately in **Local Mock Mode** out of the box. SMS and Email alerts are logged to the console, and data is stored locally in `local_db.json`.

1. **Install Dependencies**:
   ```bash
   npm install
   ```

2. **Run Tests**:
   Verify everything is working by running the automated integration tests:
   ```bash
   npm test
   ```

3. **Start the Application**:
   ```bash
   npm start
   ```

4. **Access the Interface**:
   Open [http://localhost:3000](http://localhost:3000) in your web browser.
   - Use the calculator normally.
   - Type **`1234`** and press **`=`** to unlock the settings dashboard.
   - Try scheduling a fake call, adding trusted contacts, or triggering a test alarm!

---

## Production Setup (Real Persistence & Alert Dispatch)

To connect the application to real production services, create a `.env` file (copied from `.env.example`) and supply your API credentials.

### 1. Supabase Persistence Setup
1. Create a free project on [Supabase](https://supabase.com).
2. Open the **SQL Editor** in your Supabase dashboard, copy the contents of [`schema.sql`](file:///d:/promptwargdgmmdu/schema.sql), and run it.
3. Retrieve your **Project URL** and **Service Role Key** (under Settings > API).
4. Update your `.env` file:
   ```env
   SUPABASE_URL=https://your-project-id.supabase.co
   SUPABASE_SERVICE_ROLE_KEY=your-supabase-service-role-key-here
   ```

### 2. Twilio SMS Integration
1. Create a free trial account on [Twilio](https://www.twilio.com).
2. Buy or request a Twilio phone number.
3. Retrieve your **Account SID**, **Auth Token**, and **From Phone Number**.
4. Update your `.env` file:
   ```env
   TWILIO_ACCOUNT_SID=ACXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX
   TWILIO_AUTH_TOKEN=your_twilio_auth_token_here
   TWILIO_FROM_NUMBER=+15551234567
   ```
   *Note: In trial mode, Twilio only allows sending SMS to verified recipient phone numbers.*

### 3. SMTP Email Integration (e.g. Gmail)
To dispatch real email notifications, configure your SMTP server credentials:
```env
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-gmail-app-password
SMTP_FROM_EMAIL=your-email@gmail.com
```
*Tip: If using Gmail, you must generate a 16-character **App Password** from your Google account settings.*

---

## File Structure

- [`server.js`](file:///d:/promptwargdgmmdu/server.js) - Express backend app, API routing, database wrapper, and notification dispatcher.
- [`public/index.html`](file:///d:/promptwargdgmmdu/public/index.html) - Unified calculator and dashboard markup.
- [`public/css/style.css`](file:///d:/promptwargdgmmdu/public/css/style.css) - Responsive calculator keys, slide-out dashboard, and phone layouts.
- [`public/js/app.js`](file:///d:/promptwargdgmmdu/public/js/app.js) - Client-side state, GPS acquisition, hidden gesture handlers, and Web Audio API ringer.
- [`scratch/test_api.js`](file:///d:/promptwargdgmmdu/scratch/test_api.js) - Automated system integration tests script.
- [`schema.sql`](file:///d:/promptwargdgmmdu/schema.sql) - Supabase SQL migration script.
- [`.env`](file:///d:/promptwargdgmmdu/.env) - Local configurations file.
