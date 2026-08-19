const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

// Database paths and client setup
const LOCAL_DB_PATH = path.resolve(__dirname, '../local_db.json');
const useSupabase = !!(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
let supabase = null;

if (useSupabase) {
  console.log("[DB Service] Supabase configurations detected.");
  supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
} else {
  console.log("[DB Service] Supabase credentials missing. Running in LOCAL MOCK DATABASE mode.");
  readLocalDB(); // Pre-initialize JSON database file
}

function checkSupabaseConnected() {
  return useSupabase;
}

// --- LOCAL JSON DB ENGINE BINDINGS ---
function readLocalDB() {
  if (!fs.existsSync(LOCAL_DB_PATH)) {
    const defaultDB = {
      users: [],
      contacts: [],
      settings: [], // array of { user_id, key, value }
      incidents: [],
      location_trail: [],
      safe_zones: []
    };
    fs.writeFileSync(LOCAL_DB_PATH, JSON.stringify(defaultDB, null, 2));
    return defaultDB;
  }
  try {
    const db = JSON.parse(fs.readFileSync(LOCAL_DB_PATH, 'utf8'));
    // Ensure all required fields are present and in correct format to migrate older schemas
    if (!db.users || !Array.isArray(db.users) || !Array.isArray(db.settings) || !db.incidents || !db.contacts || !db.location_trail || !db.safe_zones) {
      console.log("[DB Migrator] Old database format detected. Performing automatic migration...");
      const migratedDB = {
        users: db.users || [],
        contacts: db.contacts || [],
        settings: Array.isArray(db.settings) ? db.settings : [],
        incidents: db.incidents || [],
        location_trail: db.location_trail || [],
        safe_zones: db.safe_zones || []
      };
      fs.writeFileSync(LOCAL_DB_PATH, JSON.stringify(migratedDB, null, 2));
      return migratedDB;
    }
    return db;
  } catch (err) {
    console.error("[DB Fallback] Failed reading JSON file, resetting:", err.message);
    const defaultDB = { users: [], contacts: [], settings: [], incidents: [], location_trail: [], safe_zones: [] };
    fs.writeFileSync(LOCAL_DB_PATH, JSON.stringify(defaultDB, null, 2));
    return defaultDB;
  }
}

function writeLocalDB(data) {
  fs.writeFileSync(LOCAL_DB_PATH, JSON.stringify(data, null, 2));
}

// --- CORE EXPORTED DATABASE ACTIONS (USER ISOLATED) ---

async function getUserByEmail(email) {
  const normalizedEmail = email.toLowerCase().trim();
  
  if (useSupabase) {
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .eq('email', normalizedEmail)
      .maybeSingle();
    if (error) throw error;
    return data;
  } else {
    const db = readLocalDB();
    return db.users.find(u => u.email === normalizedEmail) || null;
  }
}

async function createUser(email, passwordHash) {
  const normalizedEmail = email.toLowerCase().trim();
  
  if (useSupabase) {
    const { data, error } = await supabase
      .from('users')
      .insert({ email: normalizedEmail, password_hash: passwordHash })
      .select()
      .single();
    if (error) throw error;
    return data;
  } else {
    const db = readLocalDB();
    const newUser = {
      id: Math.random().toString(36).substr(2, 9),
      email: normalizedEmail,
      password_hash: passwordHash,
      created_at: new Date().toISOString()
    };
    db.users.push(newUser);
    writeLocalDB(db);
    return newUser;
  }
}

async function getContacts(userId) {
  if (useSupabase) {
    const { data, error } = await supabase
      .from('contacts')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: true });
    if (error) throw error;
    return data || [];
  } else {
    const db = readLocalDB();
    return db.contacts.filter(c => c.user_id === userId);
  }
}

async function saveContact(userId, contact) {
  if (useSupabase) {
    let response;
    if (contact.id) {
      response = await supabase
        .from('contacts')
        .update({
          name: contact.name,
          phone: contact.phone,
          email: contact.email
        })
        .eq('id', contact.id)
        .eq('user_id', userId)
        .select();
    } else {
      const { count } = await supabase
        .from('contacts')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId);
      if (count >= 3) {
        throw new Error("Maximum of 3 trusted contacts reached.");
      }
      response = await supabase
        .from('contacts')
        .insert({
          user_id: userId,
          name: contact.name,
          phone: contact.phone,
          email: contact.email
        })
        .select();
    }
    if (response.error) throw response.error;
    return response.data[0];
  } else {
    const db = readLocalDB();
    if (contact.id) {
      const idx = db.contacts.findIndex(c => c.id === contact.id && c.user_id === userId);
      if (idx !== -1) {
        db.contacts[idx] = {
          ...db.contacts[idx],
          name: contact.name,
          phone: contact.phone,
          email: contact.email
        };
      } else {
        throw new Error("Contact not found.");
      }
    } else {
      const userContacts = db.contacts.filter(c => c.user_id === userId);
      if (userContacts.length >= 3) {
        throw new Error("Maximum of 3 trusted contacts reached.");
      }
      const newContact = {
        id: Math.random().toString(36).substr(2, 9),
        user_id: userId,
        name: contact.name,
        phone: contact.phone,
        email: contact.email,
        created_at: new Date().toISOString()
      };
      db.contacts.push(newContact);
      contact = newContact;
    }
    writeLocalDB(db);
    return contact;
  }
}

async function deleteContact(userId, id) {
  if (useSupabase) {
    const { error } = await supabase
      .from('contacts')
      .delete()
      .eq('id', id)
      .eq('user_id', userId);
    if (error) throw error;
  } else {
    const db = readLocalDB();
    db.contacts = db.contacts.filter(c => !(c.id === id && c.user_id === userId));
    writeLocalDB(db);
  }
  return true;
}

async function getSettings(userId) {
  const defaults = [
    { key: 'user_name', value: 'GuardianLink User' },
    { key: 'settings_pin', value: '1234' },
    { key: 'safe_word', value: 'cancel' },
    { key: 'discreet_mode', value: 'true' },
    { key: 'voice_trigger', value: 'false' },
    { key: 'fake_caller', value: 'Home' }
  ];

  if (useSupabase) {
    const { data, error } = await supabase
      .from('settings')
      .select('*')
      .eq('user_id', userId);
    if (error) throw error;
    
    const settingsObj = {};
    if (!data || data.length === 0) {
      const seeds = defaults.map(d => ({ user_id: userId, key: d.key, value: d.value }));
      await supabase.from('settings').insert(seeds);
      defaults.forEach(d => { settingsObj[d.key] = d.value; });
    } else {
      defaults.forEach(d => {
        const found = data.find(r => r.key === d.key);
        settingsObj[d.key] = found ? found.value : d.value;
      });
      data.forEach(row => {
        settingsObj[row.key] = row.value;
      });
    }
    return settingsObj;
  } else {
    const db = readLocalDB();
    const userSettings = db.settings.filter(s => s.user_id === userId);
    const settingsObj = {};

    if (userSettings.length === 0) {
      defaults.forEach(d => {
        db.settings.push({ user_id: userId, key: d.key, value: d.value });
        settingsObj[d.key] = d.value;
      });
      writeLocalDB(db);
    } else {
      defaults.forEach(d => {
        const found = userSettings.find(r => r.key === d.key);
        settingsObj[d.key] = found ? found.value : d.value;
      });
      userSettings.forEach(row => {
        settingsObj[row.key] = row.value;
      });
    }
    return settingsObj;
  }
}

async function saveSettings(userId, settingsMap) {
  if (useSupabase) {
    const promises = Object.entries(settingsMap).map(([key, value]) => {
      return supabase
        .from('settings')
        .upsert({ user_id: userId, key, value, updated_at: new Date().toISOString() });
    });
    await Promise.all(promises);
  } else {
    const db = readLocalDB();
    Object.entries(settingsMap).forEach(([key, value]) => {
      const idx = db.settings.findIndex(s => s.user_id === userId && s.key === key);
      if (idx !== -1) {
        db.settings[idx].value = String(value);
      } else {
        db.settings.push({ user_id: userId, key, value: String(value) });
      }
    });
    writeLocalDB(db);
  }
  return true;
}

async function createIncident(userId, lat, lng, acc, transcript, aiClassification, aiDraftedMessage) {
  if (useSupabase) {
    const { data, error } = await supabase
      .from('incidents')
      .insert({
        user_id: userId,
        latitude: lat,
        longitude: lng,
        accuracy: acc,
        status: 'active',
        transcript: transcript || null,
        ai_classification: aiClassification || null,
        ai_drafted_message: aiDraftedMessage || null
      })
      .select();
    if (error) throw error;
    return data[0];
  } else {
    const db = readLocalDB();
    const newIncident = {
      id: Math.random().toString(36).substr(2, 9),
      user_id: userId,
      timestamp: new Date().toISOString(),
      latitude: lat,
      longitude: lng,
      accuracy: acc,
      status: 'active',
      resolved_at: null,
      safe_word_used: null,
      transcript: transcript || null,
      ai_classification: aiClassification || null,
      ai_drafted_message: aiDraftedMessage || null,
      created_at: new Date().toISOString()
    };
    db.incidents.push(newIncident);
    writeLocalDB(db);
    return newIncident;
  }
}

async function resolveIncident(userId, incidentId, safeWord) {
  if (useSupabase) {
    let query = supabase
      .from('incidents')
      .update({
        status: 'resolved',
        resolved_at: new Date().toISOString(),
        safe_word_used: safeWord
      })
      .eq('user_id', userId);
    
    if (incidentId) {
      query = query.eq('id', incidentId);
    } else {
      const { data: activeIncidents } = await supabase
        .from('incidents')
        .select('*')
        .eq('user_id', userId)
        .eq('status', 'active')
        .order('timestamp', { ascending: false })
        .limit(1);
      
      if (!activeIncidents || activeIncidents.length === 0) {
        throw new Error("No active incident found to resolve.");
      }
      query = query.eq('id', activeIncidents[0].id);
    }
    
    const { data, error } = await query.select();
    if (error) throw error;
    return data[0];
  } else {
    const db = readLocalDB();
    let incident;
    if (incidentId) {
      incident = db.incidents.find(i => i.id === incidentId && i.user_id === userId);
    } else {
      incident = db.incidents.find(i => i.status === 'active' && i.user_id === userId);
    }

    if (!incident) {
      throw new Error("No active incident found to resolve.");
    }
    
    incident.status = 'resolved';
    incident.resolved_at = new Date().toISOString();
    incident.safe_word_used = safeWord;
    writeLocalDB(db);
    return incident;
  }
}

async function getIncidents(userId) {
  if (useSupabase) {
    const { data, error } = await supabase
      .from('incidents')
      .select('*')
      .eq('user_id', userId)
      .order('timestamp', { ascending: false });
    if (error) throw error;
    return data || [];
  } else {
    const db = readLocalDB();
    return db.incidents
      .filter(i => i.user_id === userId)
      .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  }
}

// Public incident lookup (for time-limited live tracking link)
async function getPublicIncidentStatus(incidentId) {
  if (useSupabase) {
    const { data, error } = await supabase
      .from('incidents')
      .select('id, status, user_id, transcript, timestamp, latitude, longitude, accuracy')
      .eq('id', incidentId)
      .maybeSingle();
    if (error) throw error;
    if (!data) return null;

    // Get User Profile Name
    const { data: nameRow } = await supabase
      .from('settings')
      .select('value')
      .eq('user_id', data.user_id)
      .eq('key', 'user_name')
      .maybeSingle();
    
    data.user_name = nameRow ? nameRow.value : 'GuardianLink User';
    return data;
  } else {
    const db = readLocalDB();
    const incident = db.incidents.find(i => i.id === incidentId);
    if (!incident) return null;

    // Get username from settings
    const settings = db.settings.filter(s => s.user_id === incident.user_id);
    const nameRow = settings.find(s => s.key === 'user_name');
    
    return {
      id: incident.id,
      status: incident.status,
      user_id: incident.user_id,
      transcript: incident.transcript,
      timestamp: incident.timestamp,
      latitude: incident.latitude,
      longitude: incident.longitude,
      accuracy: incident.accuracy,
      user_name: nameRow ? nameRow.value : 'GuardianLink User'
    };
  }
}

// --- LOCATION TRAILS MODULE ---
async function appendLocationTrail(userId, incidentId, latitude, longitude, accuracy, address) {
  if (useSupabase) {
    const { data, error } = await supabase
      .from('location_trail')
      .insert({
        user_id: userId,
        incident_id: incidentId,
        latitude,
        longitude,
        accuracy,
        address
      })
      .select();
    if (error) throw error;
    return data[0];
  } else {
    const db = readLocalDB();
    const newPoint = {
      id: Math.random().toString(36).substr(2, 9),
      user_id: userId,
      incident_id: incidentId,
      latitude,
      longitude,
      accuracy,
      address,
      timestamp: new Date().toISOString()
    };
    db.location_trail.push(newPoint);
    writeLocalDB(db);
    return newPoint;
  }
}

async function getLocationTrail(incidentId) {
  if (useSupabase) {
    const { data, error } = await supabase
      .from('location_trail')
      .select('*')
      .eq('incident_id', incidentId)
      .order('timestamp', { ascending: true });
    if (error) throw error;
    return data || [];
  } else {
    const db = readLocalDB();
    return db.location_trail
      .filter(t => t.incident_id === incidentId)
      .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
  }
}

// --- SAFE ZONES / GEOFENCING MODULE ---
async function getSafeZones(userId) {
  if (useSupabase) {
    const { data, error } = await supabase
      .from('safe_zones')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: true });
    if (error) throw error;
    return data || [];
  } else {
    const db = readLocalDB();
    return db.safe_zones.filter(z => z.user_id === userId);
  }
}

async function saveSafeZone(userId, zone) {
  if (useSupabase) {
    let response;
    if (zone.id) {
      response = await supabase
        .from('safe_zones')
        .update({
          name: zone.name,
          latitude: zone.latitude,
          longitude: zone.longitude,
          radius_meters: zone.radius_meters
        })
        .eq('id', zone.id)
        .eq('user_id', userId)
        .select();
    } else {
      response = await supabase
        .from('safe_zones')
        .insert({
          user_id: userId,
          name: zone.name,
          latitude: zone.latitude,
          longitude: zone.longitude,
          radius_meters: zone.radius_meters
        })
        .select();
    }
    if (response.error) throw response.error;
    return response.data[0];
  } else {
    const db = readLocalDB();
    if (zone.id) {
      const idx = db.safe_zones.findIndex(z => z.id === zone.id && z.user_id === userId);
      if (idx !== -1) {
        db.safe_zones[idx] = {
          ...db.safe_zones[idx],
          name: zone.name,
          latitude: parseFloat(zone.latitude),
          longitude: parseFloat(zone.longitude),
          radius_meters: parseFloat(zone.radius_meters)
        };
      } else {
        throw new Error("Safe Zone not found.");
      }
    } else {
      const newZone = {
        id: Math.random().toString(36).substr(2, 9),
        user_id: userId,
        name: zone.name,
        latitude: parseFloat(zone.latitude),
        longitude: parseFloat(zone.longitude),
        radius_meters: parseFloat(zone.radius_meters),
        is_active: true,
        created_at: new Date().toISOString()
      };
      db.safe_zones.push(newZone);
      zone = newZone;
    }
    writeLocalDB(db);
    return zone;
  }
}

async function deleteSafeZone(userId, id) {
  if (useSupabase) {
    const { error } = await supabase
      .from('safe_zones')
      .delete()
      .eq('id', id)
      .eq('user_id', userId);
    if (error) throw error;
  } else {
    const db = readLocalDB();
    db.safe_zones = db.safe_zones.filter(z => !(z.id === id && z.user_id === userId));
    writeLocalDB(db);
  }
  return true;
}

async function getActiveIncident(userId) {
  if (useSupabase) {
    const { data, error } = await supabase
      .from('incidents')
      .select('*')
      .eq('user_id', userId)
      .eq('status', 'active')
      .order('timestamp', { ascending: false })
      .limit(1);
    if (error) throw error;
    return data && data.length > 0 ? data[0] : null;
  } else {
    const db = readLocalDB();
    return db.incidents.find(i => i.user_id === userId && i.status === 'active') || null;
  }
}

async function updateIncidentClassification(incidentId, aiClassification) {
  if (useSupabase) {
    const { data, error } = await supabase
      .from('incidents')
      .update({ ai_classification: aiClassification })
      .eq('id', incidentId)
      .select();
    if (error) throw error;
    return data[0];
  } else {
    const db = readLocalDB();
    const incident = db.incidents.find(i => i.id === incidentId);
    if (incident) {
      incident.ai_classification = aiClassification;
      writeLocalDB(db);
    }
    return incident;
  }
}

module.exports = {
  checkSupabaseConnected,
  getUserByEmail,
  createUser,
  getContacts,
  saveContact,
  deleteContact,
  getSettings,
  saveSettings,
  createIncident,
  resolveIncident,
  getIncidents,
  getPublicIncidentStatus,
  appendLocationTrail,
  getLocationTrail,
  getSafeZones,
  saveSafeZone,
  deleteSafeZone,
  getActiveIncident,
  updateIncidentClassification
};
