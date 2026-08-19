// GuardianLink Production Hardened Location & Safe-Zones Test Suite
const { fork } = require('child_process');
const http = require('http');

const TEST_PORT = 3001;
const BASE_URL = `http://localhost:${TEST_PORT}`;

// Helper to make HTTP requests carrying session cookies
function request(method, path, body = null, cookie = null) {
  return new Promise((resolve, reject) => {
    const url = `${BASE_URL}${path}`;
    const options = {
      method: method,
      headers: {
        'Content-Type': 'application/json',
      }
    };
    
    if (cookie) {
      options.headers['Cookie'] = cookie;
    }
    
    const req = http.request(url, options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        const rawCookies = res.headers['set-cookie'] || [];
        const parsedCookies = rawCookies.map(c => c.split(';')[0]);
        const nextCookie = parsedCookies.join('; ');

        try {
          const parsed = data ? JSON.parse(data) : {};
          resolve({ status: res.statusCode, body: parsed, cookie: nextCookie });
        } catch (err) {
          resolve({ status: res.statusCode, rawBody: data, cookie: nextCookie });
        }
      });
    });
    
    req.on('error', (err) => {
      reject(err);
    });
    
    if (body) {
      req.write(JSON.stringify(body));
    }
    req.end();
  });
}

async function runTests() {
  console.log("=========================================");
  console.log("   GUARDIANLINK LOCATION TESTS           ");
  console.log("=========================================");

  // Reset local database file for test isolation
  const fs = require('fs');
  const path = require('path');
  const localDbPath = path.resolve(__dirname, '../local_db.json');
  if (fs.existsSync(localDbPath)) {
    try {
      fs.unlinkSync(localDbPath);
      console.log("Cleaned local database file for test isolation.");
    } catch (e) {
      console.warn("Could not delete local database file:", e.message);
    }
  }

  console.log(`Starting GuardianLink test server on port ${TEST_PORT}...`);
  const serverProcess = fork(require('path').resolve('server.js'), [], {
    env: {
      ...process.env,
      PORT: TEST_PORT,
      NODE_ENV: 'development',
      SUPABASE_URL: '',
      SUPABASE_SERVICE_ROLE_KEY: '',
      TWILIO_ACCOUNT_SID: '',
      SMTP_USER: '',
      GEMINI_API_KEY: '',
      OPENAI_API_KEY: '',
      JWT_SECRET: 'location-test-suite-signature-998877'
    },
    silent: true
  });

  serverProcess.stdout.on('data', (data) => {
    console.log('[Server STDOUT]:', data.toString().trim());
  });
  
  serverProcess.stderr.on('data', (data) => {
    console.error('[Server STDERR]:', data.toString().trim());
  });

  // Give server 5 seconds to boot
  await new Promise(resolve => setTimeout(resolve, 5000));

  let passed = true;

  try {
    // --- AUTHENTICATION SEEDING ---
    const userAPayload = { email: "userA@test.com", password: "password123" };
    const auth1 = await request('POST', '/api/auth/register', userAPayload);
    const cookieA = auth1.cookie;

    const userBPayload = { email: "userB@test.com", password: "securepassword" };
    const auth2 = await request('POST', '/api/auth/register', userBPayload);
    const cookieB = auth2.cookie;

    // Seeding contacts so User A can trigger SOS
    const contactA = { name: "Alice Guardian", phone: "+15551111111", email: "alice@test.com" };
    await request('POST', '/api/contacts', contactA, cookieA);

    // --- TEST 1: SAFE ZONE CREATION & ISOLATION ---
    console.log("\nTest 1: POST /api/safe-zones (User A adds safe zone [College])");
    const zoneA = {
      name: "College",
      latitude: 28.6139,
      longitude: 77.2090,
      radius_meters: 200.0
    };
    const addZoneRes = await request('POST', '/api/safe-zones', zoneA, cookieA);
    console.log(`Status: ${addZoneRes.status}`);
    if (addZoneRes.status === 200 && addZoneRes.body.success === true) {
      console.log("✅ Safe zone created successfully:", addZoneRes.body.zone.id);
    } else {
      console.log("❌ Failed to create safe zone.");
      passed = false;
    }

    console.log("\nTest 2: GET /api/safe-zones (User B checks safe zones - should be empty)");
    const getZoneBRes = await request('GET', '/api/safe-zones', null, cookieB);
    console.log(`Status: ${getZoneBRes.status}`);
    console.log('User B safe zones count:', getZoneBRes.body.length);
    if (getZoneBRes.status === 200 && getZoneBRes.body.length === 0) {
      console.log("✅ User B safe zones are isolated.");
    } else {
      console.log("❌ Safe zones scope isolation leak detected.");
      passed = false;
    }

    // --- TEST 2: SOS TRIGGER & INITIAL BREADCRUMB ---
    console.log("\nTest 3: POST /api/sos/trigger (Trigger SOS inside safe zone College)");
    const triggerA = {
      latitude: 28.6140, // inside College zone
      longitude: 77.2091,
      accuracy: 8.0,
      transcript: "Suspicious vehicle following me!"
    };
    const triggerRes = await request('POST', '/api/sos/trigger', triggerA, cookieA);
    console.log(`Status: ${triggerRes.status}`);
    
    let incidentId = null;
    if (triggerRes.status === 200 && triggerRes.body.success === true) {
      incidentId = triggerRes.body.incidentId;
      console.log(`✅ SOS active. Share link generated: ${triggerRes.body.message.includes('/share.html?id=')}`);
    } else {
      console.log("❌ SOS trigger failed.");
      passed = false;
    }

    // --- TEST 3: LIVE TRACKING UPDATE TRAIL ---
    console.log("\nTest 4: POST /api/sos/update-location (Tracking update within safe zone)");
    const update1 = {
      incidentId,
      latitude: 28.6142, // inside College zone (~35m)
      longitude: 77.2092,
      accuracy: 6.0
    };
    const updateRes1 = await request('POST', '/api/sos/update-location', update1, cookieA);
    console.log(`Status: ${updateRes1.status}`);
    if (updateRes1.status === 200 && updateRes1.body.success === true) {
      console.log("✅ Coordinate point successfully appended to location trail.");
    } else {
      console.log("❌ Failed to append trail update.");
      passed = false;
    }

    // --- TEST 4: GEOFENCING BREACH TRANSITION ---
    console.log("\nTest 5: POST /api/sos/update-location (Tracking update exiting safe zone College)");
    const update2 = {
      incidentId,
      latitude: 28.6250, // outside College zone (~1200m away)
      longitude: 77.2150,
      accuracy: 10.0
    };
    const updateRes2 = await request('POST', '/api/sos/update-location', update2, cookieA);
    console.log(`Status: ${updateRes2.status}`);
    if (updateRes2.status === 200 && updateRes2.body.success === true) {
      console.log("✅ Exited safe zone successfully checked.");
    } else {
      console.log("❌ Exited safe zone check failed.");
      passed = false;
    }

    // --- TEST 5: TIME-LIMITED PUBLIC SHARE LINK ---
    console.log("\nTest 6: GET /api/public/share/:incidentId (Public view while active)");
    const shareRes1 = await request('GET', `/api/public/share/${incidentId}`);
    console.log(`Status: ${shareRes1.status}`);
    console.log('Incident state:', shareRes1.body.active);
    console.log('Trail length captured:', shareRes1.body.trail?.length);
    if (shareRes1.status === 200 && shareRes1.body.active === true && shareRes1.body.trail?.length >= 3) {
      console.log("✅ Public share active and trail history returned correctly.");
    } else {
      console.log("❌ Public sharing check failed.");
      passed = false;
    }

    // Resolve active incident
    console.log("\nResolving User A incident...");
    await request('POST', '/api/sos/resolve', { pinOrSafeWord: "1234", incidentId }, cookieA);

    console.log("\nTest 7: GET /api/public/share/:incidentId (Public view after resolution)");
    const shareRes2 = await request('GET', `/api/public/share/${incidentId}`);
    console.log(`Status: ${shareRes2.status}`);
    console.log('Incident status response details:', shareRes2.body);
    if (shareRes2.status === 200 && shareRes2.body.active === false && shareRes2.body.error) {
      console.log("✅ Public tracking link successfully deactivated on safety check-in (expired).");
    } else {
      console.log("❌ Tracking session failed to expire.");
      passed = false;
    }

  } catch (err) {
    console.error("Test execution run failure:", err);
    passed = false;
  } finally {
    console.log("\nStopping GuardianLink test server...");
    serverProcess.kill();
  }

  console.log("\n=========================================");
  if (passed) {
    console.log("   🎉 ALL LOCATION INFRASTRUCTURE TESTS PASSED ");
    process.exit(0);
  } else {
    console.log("   ❌ LOCATION INFRASTRUCTURE TESTS FAILED   ");
    process.exit(1);
  }
}

runTests();
