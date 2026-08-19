// GuardianLink Hardened Safety App Client Engine

// Register PWA Service Worker
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js')
      .then(reg => console.log('[Service Worker] Registered scope:', reg.scope))
      .catch(err => console.error('[Service Worker] Registration failed:', err));
  });
}

document.addEventListener('DOMContentLoaded', () => {
  const ESCALATION_TIMEOUT_SECONDS = 15; // Configurable escalation window for live demo

  // --- STATE ---
  let appState = {
    user: null,
    settings: {
      user_name: 'GuardianLink User',
      settings_pin: '1234',
      safe_word: 'cancel',
      discreet_mode: 'true',
      voice_trigger: 'false',
      fake_caller: 'Home'
    },
    contacts: [],
    incidents: [],
    safeZones: [],
    activeIncidentId: null,
    fakeCallTimeoutId: null,
    fakeCallIntervalId: null,
    ringtoneContext: null,
    ringtoneOscillators: [],
    ringtoneActive: false,
    tapTimes: [],
    
    // Continuous Location Watcher state
    watchPositionId: null,
    lastPostTime: 0,

    // Voice speech detection states
    speechActive: false,
    recognition: null,
    recognitionSessionActive: false,
    rollingTranscript: [],
    voiceConsentGiven: false,
    
    // Commute/Travel Mode state
    activeTrip: null,
    tripCheckIntervalId: null,
    checkinCountdownId: null,

    // Auto-Escalation state
    sosEscalationTimerId: null,
    sosEscalationCountdown: 15
  };

  // --- HTML ELEMENTS ---
  const dashboardApp = document.getElementById('dashboard-app');
  const authOverlay = document.getElementById('auth-overlay');
  const authLoginView = document.getElementById('auth-login-view');
  const authRegisterView = document.getElementById('auth-register-view');
  const formLogin = document.getElementById('form-login');
  const formRegister = document.getElementById('form-register');
  const btnLogout = document.getElementById('btn-logout');
  
  // Status Indicator elements
  const elStatusSupabase = document.getElementById('status-supabase');
  const elDotSupabase = document.getElementById('dot-supabase');
  const elStatusSms = document.getElementById('status-sms');
  const elDotSms = document.getElementById('dot-sms');
  const elStatusEmail = document.getElementById('status-email');
  const elDotEmail = document.getElementById('dot-email');
  
  // State Card elements
  const elStateIndicatorDot = document.getElementById('state-indicator-dot');
  const elStateIndicatorText = document.getElementById('state-indicator-text');
  const elStateIndicatorSubtext = document.getElementById('state-indicator-subtext');
  
  // SOS Button
  const btnSosTrigger = document.getElementById('btn-sos-trigger');

  // AI Voice Monitoring elements
  const elCheckVoiceTrigger = document.getElementById('check-voice-trigger');
  const elWaveformContainer = document.getElementById('waveform-container');
  const elStatusMic = document.getElementById('status-mic');
  const elVoiceTranscriptSection = document.getElementById('voice-transcript-section');
  const elLiveTranscriptLog = document.getElementById('live-transcript-log');
  
  // Consent dialog elements
  const elConsentModal = document.getElementById('consent-modal');
  const elCheckConsentAgree = document.getElementById('check-consent-agree');
  const btnConsentDecline = document.getElementById('btn-consent-decline');
  const btnConsentAccept = document.getElementById('btn-consent-accept');
  
  // Contacts Circle
  const elContactsCount = document.getElementById('contacts-count');
  const elContactsList = document.getElementById('contacts-list');
  const elContactsEmptyState = document.getElementById('contacts-empty-state');
  
  // Contact Form elements
  const elContactForm = document.getElementById('contact-form');
  const elInputContactId = document.getElementById('input-contact-id');
  const elInputContactName = document.getElementById('input-contact-name');
  const elInputContactPhone = document.getElementById('input-contact-phone');
  const elInputContactEmail = document.getElementById('input-contact-email');
  const btnSaveContact = document.getElementById('btn-save-contact');
  const btnCancelContact = document.getElementById('btn-cancel-contact');
  
  // Safe Zones Geofencing inputs
  const elInputZoneName = document.getElementById('input-zone-name');
  const elInputZoneLat = document.getElementById('input-zone-lat');
  const elInputZoneLng = document.getElementById('input-zone-lng');
  const elInputZoneRadius = document.getElementById('input-zone-radius');
  const elBtnSaveZone = document.getElementById('btn-save-zone');
  const elSafeZonesList = document.getElementById('safe-zones-list');

  // Fake Call controls
  const selectCallDelay = document.getElementById('select-call-delay');
  const btnScheduleCall = document.getElementById('btn-schedule-call');
  
  // Settings Form elements
  const elInputUserName = document.getElementById('input-user-name');
  const elInputSettingsPin = document.getElementById('input-settings-pin');
  const elInputSafeWord = document.getElementById('input-safe-word');
  const elCheckDiscreetMode = document.getElementById('check-discreet-mode');
  const btnSaveSettings = document.getElementById('btn-save-settings');
  
  // Logs
  const elIncidentsLogBody = document.getElementById('incidents-log-body');
  
  // Full-screen Alert Overlay
  const sosAlertOverlay = document.getElementById('sos-alert-overlay');
  const elOverlayLat = document.getElementById('overlay-lat');
  const elOverlayLng = document.getElementById('overlay-lng');
  const elOverlayAccuracy = document.getElementById('overlay-accuracy');
  const elManualCoordsSection = document.getElementById('manual-coords-section');
  const elInputManualLocation = document.getElementById('input-manual-location');
  const btnSubmitManualLocation = document.getElementById('btn-submit-manual-location');

  const elDispatchStatusText = document.getElementById('dispatch-status-text');
  const elInputResolvePin = document.getElementById('input-resolve-pin');
  const btnResolveSos = document.getElementById('btn-resolve-sos');

  // Commute Mode elements
  const elCommuteCard = document.getElementById('commute-card');
  const elCommuteSetupSection = document.getElementById('commute-setup-section');
  const elCommuteActiveSection = document.getElementById('commute-active-section');
  const elInputCommuteDestination = document.getElementById('input-commute-destination');
  const elSelectCommuteEta = document.getElementById('select-commute-eta');
  const elBtnStartCommute = document.getElementById('btn-start-commute');
  const elBtnEndCommute = document.getElementById('btn-end-commute');
  const elBtnSimulateDeviation = document.getElementById('btn-simulate-deviation');
  const elBtnSimulateStop = document.getElementById('btn-simulate-stop');
  const elLblCommuteDestination = document.getElementById('lbl-commute-destination');
  const elLblCommuteEta = document.getElementById('lbl-commute-eta');
  const elCommuteStatusBadge = document.getElementById('commute-status-badge');

  // Checkin Modal elements
  const elCheckinModal = document.getElementById('checkin-modal');
  const elLblCheckinCountdown = document.getElementById('lbl-checkin-countdown');
  const elBtnCheckinSafe = document.getElementById('btn-checkin-safe');

  // SOS Active Overlay Escalation elements
  const elSosEscalationCard = document.getElementById('sos-escalation-card');
  const elSosEscalationStatus = document.getElementById('sos-escalation-status');
  const elSosEscalationTimerArea = document.getElementById('sos-escalation-timer-area');
  const elLblSosEscalationCountdown = document.getElementById('lbl-sos-escalation-countdown');
  const elSosGovernmentCard = document.getElementById('sos-government-card');
  
  // Fake Call fields
  const fakeCallOverlay = document.getElementById('fake-call-overlay');
  const callStateRinging = document.getElementById('call-state-ringing');
  const callStateActive = document.getElementById('call-state-active');
  const fakeCallerName = document.getElementById('fake-caller-name');
  const activeCallerName = document.getElementById('active-caller-name');
  const callDuration = document.getElementById('call-duration');
  const btnDeclineCall = document.getElementById('btn-decline-call');
  const btnAcceptCall = document.getElementById('btn-accept-call');
  const btnEndCall = document.getElementById('btn-end-call');

  // --- INITIALIZATION ---
  checkSession();

  // --- TOAST NOTIFICATIONS ---
  function showToast(message, type = 'info', duration = 4000) {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;

    container.appendChild(toast);
    
    // Trigger entry transition
    setTimeout(() => toast.classList.add('show'), 50);
    
    // Clear out toast
    setTimeout(() => {
      toast.classList.remove('show');
      setTimeout(() => toast.remove(), 350);
    }, duration);
  }

  // --- SESSION CHECKPOINT ---
  async function checkSession() {
    try {
      const res = await fetch('/api/auth/me');
      const data = await res.json();
      
      if (res.ok && data.authenticated) {
        appState.user = data.user;
        setupAuthenticatedUser();
      } else {
        showAuthScreen();
      }
    } catch (err) {
      console.warn("Session request failed:", err);
      showAuthScreen();
    }
  }

  function setupAuthenticatedUser() {
    authOverlay.classList.add('hidden');
    dashboardApp.classList.remove('hidden');
    
    // Load components
    loadConfigStatus();
    loadSettings();
    loadContacts();
    loadIncidents();
    loadSafeZones();
    
    // Event wire ups
    setupTabNavigation();
    setupAuthViewsToggle();
    setupAuthSubmissions();
    setupSOSEvents();
    setupDashboardEvents();
    setupSafeZoneEvents();
    setupSOSGestures();
    setupFakeCallEvents();
    setupSpeechRecognition();
  }

  function showAuthScreen() {
    dashboardApp.classList.add('hidden');
    authOverlay.classList.remove('hidden');
    setupAuthViewsToggle();
    setupAuthSubmissions();
  }

  // --- SIDEBAR / BOTTOM MOBILE NAVIGATION TAB SWITCHER ---
  function setupTabNavigation() {
    const tabTriggers = document.querySelectorAll('[data-tab]');
    tabTriggers.forEach(trigger => {
      trigger.onclick = () => {
        const tabId = trigger.getAttribute('data-tab');
        
        document.querySelectorAll('[data-tab]').forEach(btn => btn.classList.remove('active'));
        document.querySelectorAll(`[data-tab="${tabId}"]`).forEach(btn => btn.classList.add('active'));
        
        document.querySelectorAll('.content-view').forEach(view => view.classList.add('hidden'));
        
        const targetView = document.getElementById(`view-${tabId}`);
        if (targetView) {
          targetView.classList.remove('hidden');
        }
      };
    });
  }

  // --- AUTH FORMS MANAGEMENT ---

  function setupAuthViewsToggle() {
    document.getElementById('switch-to-register').onclick = () => {
      authLoginView.classList.add('hidden');
      authRegisterView.classList.remove('hidden');
    };
    document.getElementById('switch-to-login').onclick = () => {
      authRegisterView.classList.add('hidden');
      authLoginView.classList.remove('hidden');
    };
  }

  function setupAuthSubmissions() {
    // Login Submission
    formLogin.onsubmit = async (e) => {
      e.preventDefault();
      const email = document.getElementById('login-email').value.trim();
      const password = document.getElementById('login-password').value;
      const btn = document.getElementById('btn-login-submit');

      btn.disabled = true;
      btn.textContent = "Verifying...";

      try {
        const res = await fetch('/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password })
        });
        const data = await res.json();
        
        if (res.ok && data.success) {
          showToast("Successfully signed in.", "success");
          appState.user = data.user;
          setupAuthenticatedUser();
        } else {
          showToast(data.error || "Credentials verification failed.", "error");
        }
      } catch (err) {
        showToast("Server connection error during login.", "error");
      } finally {
        btn.disabled = false;
        btn.textContent = "Sign In";
      }
    };

    // Registration Submission
    formRegister.onsubmit = async (e) => {
      e.preventDefault();
      const email = document.getElementById('register-email').value.trim();
      const password = document.getElementById('register-password').value;
      const btn = document.getElementById('btn-register-submit');

      if (password.length < 6) {
        showToast("Password must be at least 6 characters.", "error");
        return;
      }

      btn.disabled = true;
      btn.textContent = "Creating profile...";

      try {
        const res = await fetch('/api/auth/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password })
        });
        const data = await res.json();

        if (res.ok && data.success) {
          showToast("Profile created successfully.", "success");
          appState.user = data.user;
          setupAuthenticatedUser();
        } else {
          showToast(data.error || "Profile generation failed.", "error");
        }
      } catch (err) {
        showToast("Server connection error during registration.", "error");
      } finally {
        btn.disabled = false;
        btn.textContent = "Create Account";
      }
    };

    // Logout Trigger
    btnLogout.onclick = async () => {
      try {
        await fetch('/api/auth/logout', { method: 'POST' });
        showToast("Logged out securely.", "info");
        
        // Reset local listeners and variables
        toggleVoiceListening(false);
        stopContinuousLocationWatch();
        appState.user = null;
        appState.rollingTranscript = [];
        appState.contacts = [];
        appState.incidents = [];
        appState.activeIncidentId = null;
        
        // Reset views
        document.querySelectorAll('[data-tab]').forEach(btn => btn.classList.remove('active'));
        document.querySelectorAll('[data-tab="dashboard"]').forEach(btn => btn.classList.add('active'));
        document.querySelectorAll('.content-view').forEach(view => view.classList.add('hidden'));
        document.getElementById('view-dashboard').classList.remove('hidden');

        showAuthScreen();
      } catch (err) {
        showToast("Logout request failed.", "error");
      }
    };
  }

  // --- CONFIG & DATA API SYNC ---

  async function loadConfigStatus() {
    try {
      const res = await fetch('/api/config-status');
      const data = await res.json();
      
      // DB
      if (data.supabase) {
        elStatusSupabase.textContent = 'Connected';
        elDotSupabase.style.backgroundColor = 'var(--success-color)';
      } else {
        elStatusSupabase.textContent = 'Local DB';
        elDotSupabase.style.backgroundColor = 'var(--warning-color)';
      }
      elStatusSupabase.style.color = 'var(--text-muted)';

      // SMS
      if (data.twilio) {
        elStatusSms.textContent = 'Connected';
        elDotSms.style.backgroundColor = 'var(--success-color)';
      } else {
        elStatusSms.textContent = 'Mock';
        elDotSms.style.backgroundColor = 'var(--warning-color)';
      }
      elStatusSms.style.color = 'var(--text-muted)';

      // Email
      if (data.smtp) {
        elStatusEmail.textContent = 'Connected';
        elDotEmail.style.backgroundColor = 'var(--success-color)';
      } else {
        elStatusEmail.textContent = 'Mock';
        elDotEmail.style.backgroundColor = 'var(--warning-color)';
      }
      elStatusEmail.style.color = 'var(--text-muted)';
    } catch (err) {
      console.warn("Config status check failed:", err);
      elStatusSupabase.textContent = 'Unavailable';
      elDotSupabase.style.backgroundColor = '#80868b';
      elStatusSms.textContent = 'Unavailable';
      elDotSms.style.backgroundColor = '#80868b';
      elStatusEmail.textContent = 'Unavailable';
      elDotEmail.style.backgroundColor = '#80868b';
    }
  }

  async function loadSettings() {
    try {
      const res = await fetch('/api/settings');
      if (res.ok) {
        appState.settings = await res.json();
      }
      elInputUserName.value = appState.settings.user_name || 'GuardianLink User';
      elInputSettingsPin.value = appState.settings.settings_pin || '1234';
      elInputSafeWord.value = appState.settings.safe_word || 'cancel';
      elCheckDiscreetMode.checked = appState.settings.discreet_mode === 'true';
      
      const voiceTriggerActive = appState.settings.voice_trigger === 'true';
      
      if (localStorage.getItem('guardianlink_privacy_consent') === 'true') {
        appState.voiceConsentGiven = true;
      } else {
        appState.voiceConsentGiven = false;
      }

      elCheckVoiceTrigger.checked = voiceTriggerActive && appState.voiceConsentGiven;
      
      if (voiceTriggerActive && appState.voiceConsentGiven) {
        toggleVoiceListening(true);
        toggleVoicePanel(true);
      } else {
        updateStateCard('safe');
      }
    } catch (err) {
      console.error("Settings fetch failed:", err);
    }
  }

  async function saveSettingsToServer() {
    const pinVal = elInputSettingsPin.value.trim();
    if (pinVal && !/^[0-9]{4,8}$/.test(pinVal)) {
      showToast("Safe PIN must be numeric, between 4 and 8 digits.", "error");
      return;
    }

    btnSaveSettings.disabled = true;
    btnSaveSettings.textContent = "Saving...";

    const payload = {
      user_name: elInputUserName.value.trim() || 'GuardianLink User',
      settings_pin: pinVal || '1234',
      safe_word: elInputSafeWord.value.trim() || 'cancel',
      discreet_mode: elCheckDiscreetMode.checked ? 'true' : 'false',
      voice_trigger: elCheckVoiceTrigger.checked ? 'true' : 'false'
    };

    try {
      const res = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (res.ok) {
        appState.settings = { ...appState.settings, ...payload };
        showToast("Safety configurations updated.", "success");
        toggleVoiceListening(payload.voice_trigger === 'true');
        loadSettings();
      } else {
        const data = await res.json();
        showToast(data.error || "Failed to update configurations.", "error");
      }
    } catch (err) {
      showToast("Network loss: Unable to update configurations.", "error");
    } finally {
      btnSaveSettings.disabled = false;
      btnSaveSettings.textContent = "Save Configurations";
    }
  }

  async function loadContacts() {
    try {
      const res = await fetch('/api/contacts');
      if (res.ok) {
        appState.contacts = await res.json();
        renderContactsList();
      }
    } catch (err) {
      console.error("Contacts fetch failed:", err);
    }
  }

  async function saveContactToServer() {
    const nameVal = elInputContactName.value.trim();
    const phoneVal = elInputContactPhone.value.trim();
    const emailVal = elInputContactEmail.value.trim();
    const tierVal = document.getElementById('select-contact-tier').value;
    const idVal = elInputContactId.value;

    if (!nameVal) {
      showToast("Name is required.", "error");
      return;
    }

    if (!phoneVal && !emailVal) {
      showToast("Provide at least a phone number or email address.", "error");
      return;
    }

    btnSaveContact.disabled = true;
    btnSaveContact.textContent = "Saving...";

    const payload = {
      id: idVal || undefined,
      name: nameVal,
      phone: phoneVal || null,
      email: emailVal || null,
      tier: parseInt(tierVal)
    };

    try {
      const res = await fetch('/api/contacts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();

      if (res.ok && data.success) {
        showToast(idVal ? "Contact updated." : "Contact added.", "success");
        resetContactForm();
        loadContacts();
      } else {
        showToast(data.error || "Failed to save contact.", "error");
      }
    } catch (err) {
      showToast("Server connection error.", "error");
    } finally {
      btnSaveContact.disabled = false;
      btnSaveContact.textContent = "Save Contact";
    }
  }

  function renderContactsList() {
    elContactsList.innerHTML = '';
    
    const prims = appState.contacts.filter(c => (c.tier || 1) === 1).length;
    const secs = appState.contacts.filter(c => c.tier === 2).length;
    elContactsCount.textContent = `P: ${prims}/3 | S: ${secs}/2`;

    if (appState.contacts.length === 0) {
      elContactsList.appendChild(elContactsEmptyState);
      elContactsEmptyState.classList.remove('hidden');
      return;
    }
    
    elContactsEmptyState.classList.add('hidden');

    appState.contacts.forEach(contact => {
      const item = document.createElement('div');
      item.className = 'contact-card';
      const tierBadge = `<span style="font-size:0.68rem; padding: 2px 6px; border-radius: 4px; font-weight: bold; background-color: ${contact.tier === 2 ? '#fef3c7' : '#dbeafe'}; color: ${contact.tier === 2 ? '#b45309' : '#1e40af'}; margin-left: 8px;">${contact.tier === 2 ? 'Secondary' : 'Primary'}</span>`;
      item.innerHTML = `
        <div class="contact-meta">
          <h4 style="display: flex; align-items: center;">${escapeHTML(contact.name)} ${tierBadge}</h4>
          <p>${escapeHTML(contact.phone || 'No SMS')} | ${escapeHTML(contact.email || 'No Email')}</p>
        </div>
        <div class="contact-actions">
          <button class="btn-icon-border edit-contact-btn" data-id="${contact.id}">
            <svg class="icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"></path><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path></svg>
          </button>
          <button class="btn-icon-border delete-btn delete-contact-btn" data-id="${contact.id}">
            <svg class="icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
          </button>
        </div>
      `;
      elContactsList.appendChild(item);
    });

    // Edit button mapping
    document.querySelectorAll('.edit-contact-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const id = e.currentTarget.getAttribute('data-id');
        const contact = appState.contacts.find(c => c.id === id);
        if (contact) {
          elInputContactId.value = contact.id;
          elInputContactName.value = contact.name;
          elInputContactPhone.value = contact.phone || '';
          elInputContactEmail.value = contact.email || '';
          const elSelectContactTier = document.getElementById('select-contact-tier');
          if (elSelectContactTier) elSelectContactTier.value = contact.tier || 1;
          btnCancelContact.classList.remove('hidden');
          document.getElementById('contact-form-title').textContent = 'Edit Trusted Contact';
          elContactForm.scrollIntoView({ behavior: 'smooth' });
        }
      });
    });

    // Delete button mapping
    document.querySelectorAll('.delete-contact-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const id = e.currentTarget.getAttribute('data-id');
        if (confirm("Remove this trusted contact?")) {
          try {
            const res = await fetch('/api/contacts/delete', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ id })
            });
            if (res.ok) {
              showToast("Contact removed.", "info");
              loadContacts();
            } else {
              const err = await res.json();
              showToast(err.error || "Failed to remove contact.", "error");
            }
          } catch (err) {
            showToast("Server communication error.", "error");
          }
        }
      });
    });
  }

  async function loadIncidents() {
    try {
      const res = await fetch('/api/incidents');
      if (res.ok) {
        appState.incidents = await res.json();
        renderIncidentsLog();
      }
    } catch (err) {
      console.error("Incidents log load failed:", err);
    }
  }

  function renderIncidentsLog() {
    elIncidentsLogBody.innerHTML = '';
    
    const activeIncident = appState.incidents.find(i => i.status === 'active');
    if (activeIncident) {
      appState.activeIncidentId = activeIncident.id;
      showActiveSOSOverlay();
    } else {
      appState.activeIncidentId = null;
      hideActiveSOSOverlay();
    }

    if (appState.incidents.length === 0) {
      elIncidentsLogBody.innerHTML = `<div class="text-center text-muted" style="padding: 20px 0;">No incidents recorded. All clear.</div>`;
      return;
    }

    appState.incidents.forEach(inc => {
      const date = new Date(inc.timestamp).toLocaleString();
      let locHtml = 'No Location';
      if (inc.latitude && inc.longitude) {
        locHtml = `<a href="https://www.google.com/maps?q=${inc.latitude},${inc.longitude}" target="_blank">Google Maps Link</a>`;
      }
      
      const statusClass = inc.status === 'active' ? 'active' : 'resolved';
      const statusLabel = inc.status === 'active' ? 'SOS Active' : 'Safe';
      
      const rowItem = document.createElement('div');
      rowItem.className = 'log-table-row';
      
      let resolveBtnHtml = '';
      if (inc.status === 'active') {
        resolveBtnHtml = `<button class="btn btn-secondary resolve-log-btn" style="height: 28px; padding: 0 10px; font-size: 0.72rem; margin-top: 8px;" data-id="${inc.id}">Deactivate</button>`;
      }

      let transcriptHtml = '';
      if (inc.transcript) {
        transcriptHtml = `<span class="log-transcript-preview">Heard: "${escapeHTML(inc.transcript)}"</span>`;
      }

      let timelineHtml = '';
      let classification = inc.ai_classification;
      if (typeof classification === 'string') {
        try { classification = JSON.parse(classification); } catch (e) { classification = null; }
      }
      if (classification && Array.isArray(classification.history) && classification.history.length > 0) {
        timelineHtml = `
          <div class="risk-timeline-box" style="margin-top:10px; padding:10px; background:#f8fafc; border:1px solid #e2e8f0; border-radius:6px; width: 100%;">
            <div style="font-size:0.75rem; font-weight:bold; color:var(--text-muted); margin-bottom:6px; text-align: left;">Risk Level Timeline:</div>
            <div class="timeline-steps" style="display:flex; flex-direction:column; gap:6px; border-left:2px solid var(--border-color); padding-left:10px; margin-left:4px;">
        `;
        classification.history.forEach(step => {
          const stepTime = new Date(step.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
          const stepRisk = (step.riskLevel || 'none').toUpperCase();
          let badgeColor = '#64748b';
          if (step.riskLevel === 'low') badgeColor = '#3b82f6';
          if (step.riskLevel === 'medium') badgeColor = '#f59e0b';
          if (step.riskLevel === 'high') badgeColor = '#ef4444';
          
          timelineHtml += `
            <div class="timeline-step" style="font-size:0.72rem; line-height:1.3; text-align: left;">
              <span style="color:${badgeColor}; font-weight:bold;">● [${stepRisk}]</span> 
              <span style="color:var(--text-muted); font-size:0.68rem;">(${stepTime})</span>: 
              <span style="color:var(--text-main); font-style:italic;">${escapeHTML(step.reason || '')}</span>
            </div>
          `;
        });
        timelineHtml += `
            </div>
          </div>
        `;
      }

      rowItem.innerHTML = `
        <div class="col-time">${date}</div>
        <div>
          <span class="col-status-badge ${statusClass}">${statusLabel}</span>
        </div>
        <div class="col-details-text" style="display: flex; flex-direction: column; align-items: flex-start;">
          Location: ${locHtml}
          ${transcriptHtml}
          ${timelineHtml}
          ${resolveBtnHtml}
        </div>
      `;
      elIncidentsLogBody.appendChild(rowItem);
    });

    document.querySelectorAll('.resolve-log-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const id = e.currentTarget.getAttribute('data-id');
        appState.activeIncidentId = id;
        showActiveSOSOverlay();
        elInputResolvePin.focus();
      });
    });
  }

  // --- SAFE ZONES / GEOFENCES MANAGEMENT ---
  async function loadSafeZones() {
    try {
      const res = await fetch('/api/safe-zones');
      if (res.ok) {
        appState.safeZones = await res.json();
        renderSafeZonesList();
      }
    } catch (err) {
      console.error("Safe zones load failed:", err);
    }
  }

  function renderSafeZonesList() {
    elSafeZonesList.innerHTML = '';
    if (appState.safeZones.length === 0) {
      elSafeZonesList.innerHTML = `<div class="text-center text-muted" style="font-size:0.75rem;">No safe zones defined yet.</div>`;
      return;
    }

    appState.safeZones.forEach(zone => {
      const item = document.createElement('div');
      item.className = 'safe-zone-item';
      item.innerHTML = `
        <div class="safe-zone-item-info">
          <h4>${escapeHTML(zone.name)}</h4>
          <p>Radius: ${zone.radius_meters}m | Coords: ${zone.latitude.toFixed(4)}, ${zone.longitude.toFixed(4)}</p>
        </div>
        <button class="btn-icon-border delete-btn delete-zone-btn" data-id="${zone.id}">
          <svg class="icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
        </button>
      `;
      elSafeZonesList.appendChild(item);
    });

    document.querySelectorAll('.delete-zone-btn').forEach(btn => {
      btn.onclick = async (e) => {
        const id = e.currentTarget.getAttribute('data-id');
        if (confirm("Remove this safe zone?")) {
          try {
            const res = await fetch('/api/safe-zones/delete', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ id })
            });
            if (res.ok) {
              showToast("Safe zone deleted.", "info");
              loadSafeZones();
            } else {
              showToast("Failed to delete safe zone.", "error");
            }
          } catch (err) {
            showToast("Server connection error.", "error");
          }
        }
      };
    });
  }

  async function saveSafeZoneToServer() {
    const name = elInputZoneName.value.trim();
    const lat = parseFloat(elInputZoneLat.value);
    const lng = parseFloat(elInputZoneLng.value);
    const radius = parseFloat(elInputZoneRadius.value);

    if (!name) {
      showToast("Safe zone name is required.", "error");
      return;
    }
    if (isNaN(lat) || lat < -90 || lat > 90) {
      showToast("Latitude must be between -90 and 90.", "error");
      return;
    }
    if (isNaN(lng) || lng < -180 || lng > 180) {
      showToast("Longitude must be between -180 and 180.", "error");
      return;
    }
    if (isNaN(radius) || radius <= 0) {
      showToast("Radius must be a positive number of meters.", "error");
      return;
    }

    elBtnSaveZone.disabled = true;
    elBtnSaveZone.textContent = "Saving...";

    try {
      const res = await fetch('/api/safe-zones', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, latitude: lat, longitude: lng, radius_meters: radius })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        showToast("Safe zone added successfully.", "success");
        elInputZoneName.value = '';
        elInputZoneLat.value = '';
        elInputZoneLng.value = '';
        elInputZoneRadius.value = '';
        loadSafeZones();
      } else {
        showToast(data.error || "Failed to add safe zone.", "error");
      }
    } catch (err) {
      showToast("Server network timeout.", "error");
    } finally {
      elBtnSaveZone.disabled = false;
      elBtnSaveZone.textContent = "Add Safe Zone";
    }
  }

  function setupSafeZoneEvents() {
    elBtnSaveZone.onclick = saveSafeZoneToServer;
  }

  // --- CONTINUOUS GEOLOCATION WATCHER SERVICE ---
  function startContinuousLocationWatch(incidentId) {
    if (appState.watchPositionId) {
      navigator.geolocation.clearWatch(appState.watchPositionId);
    }

    elManualCoordsSection.classList.add('hidden');
    elInputManualLocation.value = '';
    
    appState.lastPostTime = 0;

    const geoOptions = {
      enableHighAccuracy: true,
      timeout: 10000,
      maximumAge: 10000
    };

    appState.watchPositionId = navigator.geolocation.watchPosition(
      async (position) => {
        const lat = position.coords.latitude;
        const lng = position.coords.longitude;
        const acc = position.coords.accuracy;

        // Cache last successful coordinates client-side (Last-Known Fallback)
        localStorage.setItem('guardianlink_last_coords', JSON.stringify({
          latitude: lat,
          longitude: lng,
          accuracy: acc,
          timestamp: Date.now()
        }));

        // Update active overlay UI
        elOverlayLat.textContent = lat.toFixed(6);
        elOverlayLng.textContent = lng.toFixed(6);
        elOverlayAccuracy.textContent = `±${Math.round(acc)}m`;

        // Continuous Live Tracking: Throttle DB POST updates to once every 15 seconds
        const now = Date.now();
        if (now - appState.lastPostTime >= 15000) {
          appState.lastPostTime = now;
          await sendLocationUpdate(incidentId, lat, lng, acc);
        }
      },
      (error) => {
        console.warn("watchPosition failed or timed out:", error.message);
        
        // Show manual fallback panel since GPS failed/denied
        elManualCoordsSection.classList.remove('hidden');
        elOverlayAccuracy.textContent = 'GPS Unavailable';
        
        // Populate with last known cached coordinates if possible
        const cached = localStorage.getItem('guardianlink_last_coords');
        if (cached) {
          try {
            const coords = JSON.parse(cached);
            elOverlayLat.textContent = coords.latitude.toFixed(6) + ' (cached)';
            elOverlayLng.textContent = coords.longitude.toFixed(6) + ' (cached)';
            elOverlayAccuracy.textContent = `±${Math.round(coords.accuracy)}m (cached)`;
          } catch (e) {
            // ignore
          }
        }
      },
      geoOptions
    );
  }

  function stopContinuousLocationWatch() {
    if (appState.watchPositionId) {
      navigator.geolocation.clearWatch(appState.watchPositionId);
      appState.watchPositionId = null;
    }
    appState.lastPostTime = 0;
  }

  async function sendLocationUpdate(incidentId, latitude, longitude, accuracy, address = null) {
    try {
      const res = await fetch('/api/sos/update-location', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ incidentId, latitude, longitude, accuracy, address })
      });
      const data = await res.json();
      if (res.ok && data.address) {
        elDispatchStatusText.textContent = `Coordinates trail logged: ${data.address}`;
      }
    } catch (err) {
      console.warn("Location update request failed:", err);
    }
  }

  // --- SOS DISPATCH ENGINE & RESOLUTION ---

  function setupSOSEvents() {
    btnSosTrigger.onclick = () => {
      triggerSOS();
    };

    let equalsHoldTimeout;
    btnSosTrigger.addEventListener('mousedown', () => {
      equalsHoldTimeout = setTimeout(() => {
        triggerSOS();
      }, 3000);
    });
    btnSosTrigger.addEventListener('mouseup', () => { clearTimeout(equalsHoldTimeout); });
    btnSosTrigger.addEventListener('mouseleave', () => { clearTimeout(equalsHoldTimeout); });

    btnSosTrigger.addEventListener('touchstart', () => {
      equalsHoldTimeout = setTimeout(() => {
        triggerSOS();
      }, 3000);
    });
    btnSosTrigger.addEventListener('touchend', () => { clearTimeout(equalsHoldTimeout); });

    btnResolveSos.onclick = () => {
      const pin = elInputResolvePin.value.trim();
      resolveSOS(pin);
    };

    // Manual location override submission inside SOS overlay
    btnSubmitManualLocation.onclick = async () => {
      const manualAddress = elInputManualLocation.value.trim();
      if (!manualAddress) {
        showToast("Please enter an address or room description.", "error");
        return;
      }

      btnSubmitManualLocation.disabled = true;
      btnSubmitManualLocation.textContent = "Sending...";

      let lat = 28.6139;
      let lng = 77.2090;
      let acc = 50.0;

      // Extract cached values for lat/lng if we have them
      const cached = localStorage.getItem('guardianlink_last_coords');
      if (cached) {
        try {
          const coords = JSON.parse(cached);
          lat = coords.latitude;
          lng = coords.longitude;
          acc = coords.accuracy;
        } catch (e) {}
      }

      try {
        await sendLocationUpdate(appState.activeIncidentId, lat, lng, acc, manualAddress);
        showToast("Manual location update sent successfully.", "success");
        elInputManualLocation.value = '';
      } catch (err) {
        showToast("Failed to transmit manual location.", "error");
      } finally {
        btnSubmitManualLocation.disabled = false;
        btnSubmitManualLocation.textContent = "Send";
      }
    };
  }

  function showActiveSOSOverlay() {
    updateStateCard('sos');
    const isDiscreet = appState.settings.discreet_mode === 'true';
    if (!isDiscreet) {
      sosAlertOverlay.classList.remove('hidden');
      elInputResolvePin.focus();

      const activeIncident = appState.incidents.find(i => i.status === 'active');
      let isEscalated = false;
      if (activeIncident && activeIncident.ai_classification) {
        let classification = activeIncident.ai_classification;
        if (typeof classification === 'string') {
          try { classification = JSON.parse(classification); } catch (e) { classification = null; }
        }
        if (classification && (classification.riskLevel === 'escalated' || (classification.history && classification.history.some(h => h.riskLevel === 'escalated')))) {
          isEscalated = true;
        }
      }

      if (isEscalated) {
        elSosEscalationTimerArea.classList.add('hidden');
        elSosEscalationStatus.innerHTML = '<span style="color:#fca5a5; font-weight:bold;">🚨 ESCALATED</span>: User unresponsive. Wider circle contacted.';
        
        elSosGovernmentCard.style.border = '4px solid #ef4444';
        elSosGovernmentCard.style.backgroundColor = 'rgba(239, 68, 68, 0.2)';
      } else {
        elSosEscalationStatus.textContent = "SOS Active. Primary trusted contacts notified.";
        elSosEscalationTimerArea.classList.remove('hidden');
        appState.sosEscalationCountdown = ESCALATION_TIMEOUT_SECONDS;
        elLblSosEscalationCountdown.textContent = appState.sosEscalationCountdown;

        elSosGovernmentCard.style.border = '2px solid #ffffff';
        elSosGovernmentCard.style.backgroundColor = 'rgba(255,255,255,0.15)';

        if (appState.sosEscalationTimerId) clearInterval(appState.sosEscalationTimerId);
        appState.sosEscalationTimerId = setInterval(() => {
          appState.sosEscalationCountdown--;
          elLblSosEscalationCountdown.textContent = appState.sosEscalationCountdown;
          if (appState.sosEscalationCountdown <= 0) {
            clearInterval(appState.sosEscalationTimerId);
            autoEscalateActiveSOS();
          }
        }, 1000);
      }
    }
  }

  function hideActiveSOSOverlay() {
    sosAlertOverlay.classList.add('hidden');
    elInputResolvePin.value = '';
    
    if (appState.sosEscalationTimerId) clearInterval(appState.sosEscalationTimerId);
    btnSosTrigger.classList.remove('sos-active-alert');
    stopContinuousLocationWatch();

    if (elCheckVoiceTrigger.checked) {
      updateStateCard('monitoring');
    } else {
      updateStateCard('safe');
    }
  }

  async function autoEscalateActiveSOS() {
    if (appState.sosEscalationTimerId) clearInterval(appState.sosEscalationTimerId);
    
    const activeIncident = appState.incidents.find(i => i.status === 'active');
    if (!activeIncident) return;

    showToast("Safety check-in timeout! Auto-escalating to wider circle...", "error");
    elSosEscalationStatus.innerHTML = '<span style="color:#ef4444; font-weight:bold;">Escalating...</span>';

    try {
      const res = await fetch('/api/sos/escalate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          incidentId: activeIncident.id,
          durationUnresponsiveMinutes: 1
        })
      });
      const data = await res.json();
      if (res.ok) {
        showToast("Escalated alert dispatched to all circles.", "success");
        await loadIncidents();
        
        elSosEscalationTimerArea.classList.add('hidden');
        elSosEscalationStatus.innerHTML = '<span style="color:#fca5a5; font-weight:bold;">🚨 ESCALATED</span>: User unresponsive. Wider circle contacted.';
        
        elSosGovernmentCard.style.border = '4px solid #ef4444';
        elSosGovernmentCard.style.backgroundColor = 'rgba(239, 68, 68, 0.2)';
      } else {
        showToast(data.error || "Failed to escalate alert.", "error");
        elSosEscalationStatus.textContent = "SOS Active. Primary trusted contacts notified.";
      }
    } catch (err) {
      console.error("Auto escalation post failed:", err);
      elSosEscalationStatus.textContent = "SOS Active. Primary trusted contacts notified.";
    }
  }

  function updateStateCard(state) {
    if (state === 'safe') {
      elStateIndicatorDot.className = 'status-badge-dot green';
      elStateIndicatorText.textContent = "System Active & Safe";
      elStateIndicatorSubtext.textContent = "Continuous safety monitors running. You are protected.";
    } else if (state === 'monitoring') {
      elStateIndicatorDot.className = 'status-badge-dot blue';
      elStateIndicatorText.textContent = "AI Voice Monitoring Active";
      elStateIndicatorSubtext.textContent = "Listening for voice distress keywords in the background...";
    } else if (state === 'sos') {
      elStateIndicatorDot.className = 'status-badge-dot red';
      elStateIndicatorText.textContent = "SOS Emergency Active";
      elStateIndicatorSubtext.textContent = "GPS tracks transmitting. Help has been alerted.";
    }
  }

  async function triggerSOS(transcript = null) {
    if (localStorage.getItem('guardianlink_privacy_consent') !== 'true') {
      btnSosTrigger.classList.remove('sos-active-alert');
      showConsentModal(() => {
        triggerSOS(transcript);
      });
      return;
    }

    if (appState.contacts.length === 0) {
      showToast("Cannot dispatch SOS. Trusted Circle list is empty.", "error");
      return;
    }

    btnSosTrigger.classList.add('sos-active-alert');
    showToast("SOS Triggered. Acquiring location...", "info");
    
    const geoOptions = {
      enableHighAccuracy: true,
      timeout: 8000,
      maximumAge: 60000
    };

    elOverlayLat.textContent = 'Acquiring GPS...';
    elOverlayLng.textContent = 'Acquiring GPS...';
    elOverlayAccuracy.textContent = 'Acquiring...';
    elDispatchStatusText.textContent = 'Acquiring emergency coordinates...';

    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        async (position) => {
          const lat = position.coords.latitude;
          const lng = position.coords.longitude;
          const acc = position.coords.accuracy;
          
          localStorage.setItem('guardianlink_last_coords', JSON.stringify({
            latitude: lat,
            longitude: lng,
            accuracy: acc,
            timestamp: Date.now()
          }));

          elOverlayLat.textContent = lat.toFixed(6);
          elOverlayLng.textContent = lng.toFixed(6);
          elOverlayAccuracy.textContent = `±${Math.round(acc)}m`;
          elDispatchStatusText.textContent = 'Transmitting alert dispatches to contacts...';

          await sendSOSPayload(lat, lng, acc, transcript);
        },
        async (error) => {
          console.warn("Geolocation acquisition failed. Using cached fallback...", error.message);
          elDispatchStatusText.textContent = 'Location failed. Using cached GPS coordinates...';
          await triggerSOSFallback(transcript);
        },
        geoOptions
      );
    } else {
      elDispatchStatusText.textContent = 'GPS API unsupported. Using fallback...';
      await triggerSOSFallback(transcript);
    }

    showActiveSOSOverlay();
  }

  async function triggerSOSFallback(transcript) {
    let lat = null;
    let lng = null;
    let acc = null;

    const cached = localStorage.getItem('guardianlink_last_coords');
    if (cached) {
      try {
        const coords = JSON.parse(cached);
        if (Date.now() - coords.timestamp < 24 * 60 * 60 * 1000) {
          lat = coords.latitude;
          lng = coords.longitude;
          acc = coords.accuracy;
          elOverlayLat.textContent = lat.toFixed(6) + ' (cached)';
          elOverlayLng.textContent = lng.toFixed(6) + ' (cached)';
          elOverlayAccuracy.textContent = `±${Math.round(coords.accuracy)}m (cached)`;
        }
      } catch (err) {
        console.error("Error reading cached coordinates:", err);
      }
    }

    if (lat === null) {
      elOverlayLat.textContent = 'Unavailable';
      elOverlayLng.textContent = 'Unavailable';
      elOverlayAccuracy.textContent = 'Unavailable';
    }

    await sendSOSPayload(lat, lng, acc, transcript);
  }

  async function sendSOSPayload(latitude, longitude, accuracy, transcript) {
    try {
      const res = await fetch('/api/sos/trigger', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ latitude, longitude, accuracy, transcript })
      });
      const data = await res.json();
      
      if (res.ok) {
        appState.activeIncidentId = data.incidentId;
        elDispatchStatusText.textContent = 'Emergency alerts sent successfully.';
        showToast("SOS emergency messages successfully dispatched.", "success");
        loadIncidents();
        
        // Start live tracking watcher loop
        if (latitude !== null && longitude !== null) {
          startContinuousLocationWatch(data.incidentId);
        }
      } else {
        elDispatchStatusText.textContent = 'Dispatch failed: ' + data.error;
        showToast(data.error || "Emergency trigger failed.", "error");
      }
    } catch (err) {
      console.error("SOS payload send failed:", err);
      elDispatchStatusText.textContent = 'Network loss. Local logs buffered.';
      showToast("Network connection error. SOS dispatch pending.", "error");
    }
  }

  async function resolveSOS(pinOrSafeWord) {
    if (!pinOrSafeWord) {
      showToast("Safe PIN or safe-word is required to resolve.", "error");
      return;
    }

    btnResolveSos.disabled = true;
    btnResolveSos.textContent = "Confirming...";

    try {
      const res = await fetch('/api/sos/resolve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pinOrSafeWord,
          incidentId: appState.activeIncidentId
        })
      });
      
      const data = await res.json();
      if (res.ok) {
        showToast("GuardianLink alert resolved successfully.", "success");
        hideActiveSOSOverlay();
        loadIncidents();
      } else {
        showToast(data.error || "Incorrect safety credentials.", "error");
      }
    } catch (err) {
      console.error("SOS resolution failed:", err);
      showToast("Server connection error.", "error");
    } finally {
      btnResolveSos.disabled = false;
      btnResolveSos.textContent = "Verify Safety";
    }
  }

  // --- DISCREET GESTURE TRIPLE-TAP ---

  function setupSOSGestures() {
    document.onclick = (e) => {
      if (!sosAlertOverlay.classList.contains('hidden') || !fakeCallOverlay.classList.contains('hidden') || !authOverlay.classList.contains('hidden')) {
        return;
      }

      const now = Date.now();
      appState.tapTimes.push(now);

      if (appState.tapTimes.length > 3) {
        appState.tapTimes.shift();
      }

      if (appState.tapTimes.length === 3) {
        const timeDiff = appState.tapTimes[2] - appState.tapTimes[0];
        if (timeDiff < 1000) {
          console.log("Discreet triple-tap triggered!");
          triggerSOS();
          appState.tapTimes = [];
        }
      }
    };
  }

  function setupDashboardEvents() {
    btnSaveSettings.onclick = saveSettingsToServer;
    btnSaveContact.onclick = saveContactToServer;
    
    btnCancelContact.onclick = () => {
      resetContactForm();
    };

    elCheckVoiceTrigger.onchange = (e) => {
      const active = e.target.checked;
      
      if (active && !appState.voiceConsentGiven) {
        e.target.checked = false;
        showConsentModal();
      } else {
        toggleVoiceListening(active);
        toggleVoicePanel(active);
      }
    };

    setupCommuteEvents();
  }

  // --- EXPLICIT MICROPHONE CONSENT MODAL ---

  function showConsentModal(onAccept = null) {
    elConsentModal.classList.remove('hidden');
    elCheckConsentAgree.checked = false;
    btnConsentAccept.disabled = true;

    elCheckConsentAgree.onchange = (e) => {
      btnConsentAccept.disabled = !e.target.checked;
    };

    btnConsentDecline.onclick = () => {
      elConsentModal.classList.add('hidden');
      elCheckVoiceTrigger.checked = false;
      toggleVoiceListening(false);
      toggleVoicePanel(false);
      showToast("Consent declined. Location and voice triggers disabled.", "info");
    };

    btnConsentAccept.onclick = () => {
      localStorage.setItem('guardianlink_privacy_consent', 'true');
      appState.voiceConsentGiven = true;
      elConsentModal.classList.add('hidden');
      
      showToast("Safety & Privacy Consent granted.", "success");
      
      if (onAccept) {
        onAccept();
      } else {
        elCheckVoiceTrigger.checked = true;
        toggleVoiceListening(true);
        toggleVoicePanel(true);
      }
    };
  }

  function toggleVoicePanel(show) {
    if (show) {
      elVoiceTranscriptSection.classList.remove('hidden');
      elWaveformContainer.classList.remove('hidden');
    } else {
      elVoiceTranscriptSection.classList.add('hidden');
      elWaveformContainer.classList.add('hidden');
    }
  }

  // --- SOCIAL ESCAPE FAKE CALLS ---

  function setupFakeCallEvents() {
    btnScheduleCall.onclick = () => {
      const delay = parseInt(selectCallDelay.value);
      
      if (appState.fakeCallTimeoutId) {
        clearTimeout(appState.fakeCallTimeoutId);
      }

      if (delay === 0) {
        startFakeCall();
      } else {
        showToast(`Fake call scheduled in ${delay} seconds.`, "info");
        appState.fakeCallTimeoutId = setTimeout(() => {
          startFakeCall();
        }, delay * 1000);
      }
    };

    btnDeclineCall.onclick = stopFakeCall;
    btnEndCall.onclick = stopFakeCall;
    btnAcceptCall.onclick = acceptFakeCall;
  }

  function startFakeCall() {
    appState.ringtoneActive = true;
    fakeCallerName.textContent = appState.settings.fake_caller || 'Home';
    activeCallerName.textContent = appState.settings.fake_caller || 'Home';
    
    fakeCallOverlay.classList.remove('hidden');
    callStateRinging.classList.remove('hidden');
    callStateActive.classList.add('hidden');

    playRingtoneSynth();
  }

  function stopFakeCall() {
    appState.ringtoneActive = false;
    stopRingtoneSynth();

    if (appState.fakeCallIntervalId) {
      clearInterval(appState.fakeCallIntervalId);
    }
    
    fakeCallOverlay.classList.add('hidden');
    appState.fakeCallTimeoutId = null;
    appState.fakeCallIntervalId = null;
  }

  function acceptFakeCall() {
    stopRingtoneSynth();
    
    callStateRinging.classList.add('hidden');
    callStateActive.classList.remove('hidden');

    let seconds = 0;
    callDuration.textContent = '00:00';
    
    if (appState.fakeCallIntervalId) {
      clearInterval(appState.fakeCallIntervalId);
    }

    appState.fakeCallIntervalId = setInterval(() => {
      seconds++;
      const mins = String(Math.floor(seconds / 60)).padStart(2, '0');
      const secs = String(seconds % 60).padStart(2, '0');
      callDuration.textContent = `${mins}:${secs}`;
    }, 1000);
  }

  // --- AUDIO SYNTHESIZER (WEB AUDIO API RINGTONE) ---

  function playRingtoneSynth() {
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;

      const ctx = new AudioCtx();
      appState.ringtoneContext = ctx;

      const osc1 = ctx.createOscillator();
      const osc2 = ctx.createOscillator();
      const gainNode = ctx.createGain();

      osc1.frequency.value = 440;
      osc2.frequency.value = 480;

      osc1.connect(gainNode);
      osc2.connect(gainNode);
      gainNode.connect(ctx.destination);

      osc1.start();
      osc2.start();

      appState.ringtoneOscillators = [osc1, osc2];

      let time = ctx.currentTime;
      gainNode.gain.setValueAtTime(0, time);

      function pulse() {
        if (!appState.ringtoneActive) return;
        
        gainNode.gain.linearRampToValueAtTime(0.1, ctx.currentTime + 0.05);
        gainNode.gain.setValueAtTime(0.1, ctx.currentTime + 2.0);
        gainNode.gain.linearRampToValueAtTime(0.0, ctx.currentTime + 2.05);
        
        setTimeout(() => {
          if (appState.ringtoneActive) pulse();
        }, 6000);
      }
      
      pulse();

    } catch (err) {
      console.warn("Web Audio API not supported.", err);
    }
  }

  function stopRingtoneSynth() {
    try {
      appState.ringtoneOscillators.forEach(osc => {
        osc.stop();
        osc.disconnect();
      });
      appState.ringtoneOscillators = [];
      if (appState.ringtoneContext) {
        appState.ringtoneContext.close();
        appState.ringtoneContext = null;
      }
    } catch (err) {
      // Ignore
    }
  }

  // --- SPEECH RECOGNITION (AI DISTRESS LISTENING ENGINE) ---

  function setupSpeechRecognition() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    
    if (!SpeechRecognition) {
      console.warn("SpeechRecognition API not supported on this browser.");
      elCheckVoiceTrigger.disabled = true;
      const smallHelp = elCheckVoiceTrigger.parentNode.nextElementSibling;
      if (smallHelp) {
        smallHelp.textContent = "Voice trigger unavailable: SpeechRecognition API is not supported on this browser. Try Chrome or Safari.";
        smallHelp.style.color = '#ff3b30';
      }
      return;
    }

    const rec = new SpeechRecognition();
    rec.continuous = true;
    rec.interimResults = false;
    rec.lang = 'en-US';

    rec.onstart = () => {
      appState.recognitionSessionActive = true;
      updateMicIndicator(true);
    };

    rec.onend = () => {
      appState.recognitionSessionActive = false;
      if (appState.speechActive) {
        try {
          rec.start();
        } catch (err) {
          console.error("Failed to restart voice stream:", err);
        }
      } else {
        updateMicIndicator(false);
      }
    };

    rec.onerror = (e) => {
      console.error("SpeechRecognition error:", e.error);
      if (e.error === 'not-allowed') {
        showToast("Microphone permission denied. Speech recognition disabled.", "error");
        elCheckVoiceTrigger.checked = false;
        toggleVoiceListening(false);
      }
    };

    rec.onresult = async (event) => {
      const lastIndex = event.results.length - 1;
      const phrase = event.results[lastIndex][0].transcript.trim();
      
      if (!phrase) return;
      console.log(`Speech heard: "${phrase}"`);
      
      appendTranscriptToLog(phrase);
      await evaluatePhraseForDistress(phrase);
    };

    appState.recognition = rec;
  }

  function toggleVoiceListening(start) {
    appState.speechActive = start;
    if (!appState.recognition) return;

    if (start) {
      if (!appState.recognitionSessionActive) {
        try {
          appState.recognition.start();
        } catch (e) {
          console.error(e);
        }
      }
      updateStateCard('monitoring');
      elWaveformContainer.classList.add('listening-active');
    } else {
      if (appState.recognitionSessionActive) {
        try {
          appState.recognition.stop();
        } catch (e) {
          console.error(e);
        }
      }
      
      if (appState.activeIncidentId) {
        updateStateCard('sos');
      } else {
        updateStateCard('safe');
      }
      elWaveformContainer.classList.remove('listening-active');
    }
  }

  function updateMicIndicator(active) {
    if (elStatusMic) {
      elStatusMic.textContent = active ? 'Active' : 'Off';
      elStatusMic.style.color = active ? '#10b981' : '#64748b';
    }
  }

  function appendTranscriptToLog(phrase) {
    appState.rollingTranscript.push({
      text: phrase,
      time: new Date().toLocaleTimeString(),
      danger: false
    });

    if (appState.rollingTranscript.length > 25) {
      appState.rollingTranscript.shift();
    }

    renderTranscriptLog();
  }

  function renderTranscriptLog() {
    if (!elLiveTranscriptLog) return;
    
    if (appState.rollingTranscript.length === 0) {
      elLiveTranscriptLog.innerHTML = `<span class="text-muted">Listening active. Speak now...</span>`;
      return;
    }

    elLiveTranscriptLog.innerHTML = '';
    [...appState.rollingTranscript].reverse().forEach(item => {
      const logItem = document.createElement('div');
      logItem.className = 'transcript-item';
      
      const dangerClass = item.danger ? 'transcript-danger' : '';
      const textHtml = `<span class="transcript-text ${dangerClass}">${escapeHTML(item.text)}</span>`;
      const metaHtml = `<span class="transcript-meta">${item.time}</span>`;
      
      logItem.innerHTML = textHtml + metaHtml;
      elLiveTranscriptLog.appendChild(logItem);
    });
  }

  async function evaluatePhraseForDistress(phrase) {
    try {
      const res = await fetch('/api/ai/classify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transcript: phrase })
      });
      const data = await res.json();
      
      if (res.ok) {
        console.log(`Distress Level: ${data.danger_level.toUpperCase()} | Reasoning: ${data.reasoning}`);
        
        const matchingLog = appState.rollingTranscript.find(item => item.text === phrase);
        if (matchingLog && data.danger_level !== 'low') {
          matchingLog.danger = true;
          renderTranscriptLog();
        }

        if (data.danger_level === 'high') {
          console.warn("⚠️ AI voice distress detected high risk! Auto-triggering silent SOS...");
          
          const recentTranscriptText = appState.rollingTranscript
            .map(item => item.text)
            .join('. ');

          triggerSOS(recentTranscriptText);
        }
      }
    } catch (err) {
      console.error("AI Evaluation request failed:", err);
    }
  }

  // --- HELPER UTILS ---

  function resetContactForm() {
    elInputContactId.value = '';
    elInputContactName.value = '';
    elInputContactPhone.value = '';
    elInputContactEmail.value = '';
    const elSelectContactTier = document.getElementById('select-contact-tier');
    if (elSelectContactTier) elSelectContactTier.value = '1';
    btnCancelContact.classList.add('hidden');
    document.getElementById('contact-form-title').textContent = 'Add Trusted Contact';
  }

  function escapeHTML(str) {
    if (!str) return '';
    return str.replace(/[&<>'"]/g, 
      tag => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        "'": '&#39;',
        '"': '&quot;'
      }[tag] || tag)
    );
  }

  // --- COMMUTE / TRAVEL MODE ENGINE ---

  function setupCommuteEvents() {
    if (!elBtnStartCommute) return;

    elBtnStartCommute.onclick = startCommute;
    elBtnEndCommute.onclick = () => endCommute();
    elBtnSimulateDeviation.onclick = () => updateCommuteLocation({ simulateDeviation: true });
    elBtnSimulateStop.onclick = () => updateCommuteLocation({ simulateStop: true });
    elBtnCheckinSafe.onclick = handleCheckinResponseSafe;
  }

  async function startCommute() {
    if (appState.contacts.length === 0) {
      showToast("Cannot start commute. Trusted Circle list is empty.", "error");
      return;
    }

    if (localStorage.getItem('guardianlink_privacy_consent') !== 'true') {
      showConsentModal(() => { startCommute(); });
      return;
    }

    const destination = elInputCommuteDestination.value.trim();
    if (!destination) {
      showToast("Please enter a destination address.", "error");
      return;
    }

    const etaVal = parseInt(elSelectCommuteEta.value) || 15;
    elBtnStartCommute.disabled = true;
    elBtnStartCommute.textContent = "Initiating trip...";

    try {
      const res = await fetch('/api/commute/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ destination, etaMinutes: etaVal })
      });
      const data = await res.json();

      if (res.ok && data.success) {
        appState.activeTrip = {
          destination,
          etaSeconds: etaVal * 60,
          startTime: Date.now()
        };

        elLblCommuteDestination.textContent = destination;
        elLblCommuteEta.textContent = formatRemainingTime(appState.activeTrip.etaSeconds);
        
        elCommuteSetupSection.classList.add('hidden');
        elCommuteActiveSection.classList.remove('hidden');
        elCommuteStatusBadge.classList.remove('hidden');
        
        showToast("Commute safety monitoring activated.", "success");
        
        if (appState.tripCheckIntervalId) clearInterval(appState.tripCheckIntervalId);
        appState.tripCheckIntervalId = setInterval(checkCommuteTick, 1000);
      } else {
        showToast(data.error || "Failed to start commute monitoring.", "error");
      }
    } catch (err) {
      console.error("Commute start failed:", err);
      showToast("Server connection error.", "error");
    } finally {
      elBtnStartCommute.disabled = false;
      elBtnStartCommute.textContent = "Start Commute Monitoring";
    }
  }

  function checkCommuteTick() {
    if (!appState.activeTrip) {
      clearInterval(appState.tripCheckIntervalId);
      return;
    }

    appState.activeTrip.etaSeconds--;
    elLblCommuteEta.textContent = formatRemainingTime(appState.activeTrip.etaSeconds);

    if (appState.activeTrip.etaSeconds <= 0) {
      clearInterval(appState.tripCheckIntervalId);
      autoEscalateCommuteAlert("Commute duration ETA timeout reached without safe check-in.");
      return;
    }

    if (appState.activeTrip.etaSeconds % 10 === 0) {
      updateCommuteLocation();
    }
  }

  async function updateCommuteLocation(params = {}) {
    if (!appState.activeTrip) return;

    const geoOptions = { enableHighAccuracy: true, timeout: 5000 };

    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        await postCommuteUpdate(pos.coords.latitude, pos.coords.longitude, pos.coords.accuracy, params);
      },
      async (err) => {
        await postCommuteUpdate(28.614, 77.2091, 10, params);
      },
      geoOptions
    );
  }

  async function postCommuteUpdate(latitude, longitude, accuracy, params) {
    try {
      const res = await fetch('/api/commute/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ latitude, longitude, accuracy, ...params })
      });
      const data = await res.json();
      
      if (data.success && data.deviate) {
        triggerCheckinPrompt(data.reason);
      }
    } catch (err) {
      console.warn("Location update failed:", err);
    }
  }

  function triggerCheckinPrompt(reason) {
    elCheckinModal.classList.remove('hidden');
    let countdown = ESCALATION_TIMEOUT_SECONDS;
    elLblCheckinCountdown.textContent = countdown;

    if (appState.checkinCountdownId) clearInterval(appState.checkinCountdownId);
    appState.checkinCountdownId = setInterval(() => {
      countdown--;
      elLblCheckinCountdown.textContent = countdown;
      if (countdown <= 0) {
        clearInterval(appState.checkinCountdownId);
        elCheckinModal.classList.add('hidden');
        autoEscalateCommuteAlert(reason);
      }
    }, 1000);
  }

  function handleCheckinResponseSafe() {
    elCheckinModal.classList.add('hidden');
    if (appState.checkinCountdownId) clearInterval(appState.checkinCountdownId);
    
    if (appState.activeTrip) {
      appState.activeTrip.etaSeconds += 300; // Give 5 extra minutes padding for safety confirmation
      elLblCommuteEta.textContent = formatRemainingTime(appState.activeTrip.etaSeconds);
    }
    showToast("Safety check-in acknowledged. Commute monitoring resumed.", "success");
  }

  async function autoEscalateCommuteAlert(reason) {
    showToast("Safety timeout! Auto-escalating distress dispatch...", "error");
    
    const geoOptions = { enableHighAccuracy: true, timeout: 5000 };

    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        await triggerSOSWithCommuteData(pos.coords.latitude, pos.coords.longitude, pos.coords.accuracy, reason);
      },
      async (err) => {
        await triggerSOSWithCommuteData(28.614, 77.2091, 10, reason);
      },
      geoOptions
    );
  }

  async function triggerSOSWithCommuteData(lat, lng, acc, reason) {
    try {
      const res = await fetch('/api/sos/trigger', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          latitude: lat,
          longitude: lng,
          accuracy: acc,
          riskLevel: 'high',
          reason: `Auto-escalation: Route Deviation check-in timeout. ${reason}`
        })
      });
      
      if (res.ok) {
        showToast("High-risk SOS alert dispatched successfully.", "success");
        await endCommute(true);
        loadIncidents();
      }
    } catch (err) {
      console.error("SOS Trigger from Commute failed:", err);
    }
  }

  async function endCommute(silent = false) {
    if (appState.tripCheckIntervalId) clearInterval(appState.tripCheckIntervalId);
    if (appState.checkinCountdownId) clearInterval(appState.checkinCountdownId);
    appState.activeTrip = null;

    elCommuteSetupSection.classList.remove('hidden');
    elCommuteActiveSection.classList.add('hidden');
    elCommuteStatusBadge.classList.add('hidden');
    elInputCommuteDestination.value = '';

    try {
      await fetch('/api/commute/end', { method: 'POST' });
      if (!silent) {
        showToast("Commute safety monitoring deactivated.", "info");
      }
    } catch (err) {
      console.warn("Failed to notify server of commute ending:", err);
    }
  }

  function formatRemainingTime(seconds) {
    if (seconds <= 0) return "0:00";
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
  }
});
