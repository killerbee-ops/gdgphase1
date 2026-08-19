// AI Distress Classification & Drafting Service
const geminiApiKey = process.env.GEMINI_API_KEY;
const openaiApiKey = process.env.OPENAI_API_KEY;

// Helper to query Gemini API
async function callGemini(prompt, responseJson = false) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${geminiApiKey}`;
  const payload = {
    contents: [{ parts: [{ text: prompt }] }]
  };
  
  if (responseJson) {
    payload.generationConfig = { responseMimeType: "application/json" };
  }

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  if (!res.ok) {
    throw new Error(`Gemini Server Error: ${res.status} - ${await res.text()}`);
  }

  const data = await res.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error("Empty reply from Gemini Engine");
  return text.trim();
}

// Helper to query OpenAI API
async function callOpenAI(prompt, responseJson = false) {
  const url = 'https://api.openai.com/v1/chat/completions';
  const payload = {
    model: "gpt-4o-mini",
    messages: [{ role: "user", content: prompt }]
  };

  if (responseJson) {
    payload.response_format = { type: "json_object" };
  }

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${openaiApiKey}`
    },
    body: JSON.stringify(payload)
  });

  if (!res.ok) {
    throw new Error(`OpenAI Server Error: ${res.status} - ${await res.text()}`);
  }

  const data = await res.json();
  const text = data.choices?.[0]?.message?.content;
  if (!text) throw new Error("Empty reply from OpenAI Engine");
  return text.trim();
}

// Global LLM query manager
async function queryLLM(prompt, responseJson = false) {
  if (geminiApiKey) {
    try {
      return await callGemini(prompt, responseJson);
    } catch (err) {
      console.warn("[AI Service] Gemini call failed, trying OpenAI fallback...", err.message);
      if (openaiApiKey) {
        return await callOpenAI(prompt, responseJson);
      }
      throw err;
    }
  } else if (openaiApiKey) {
    return await callOpenAI(prompt, responseJson);
  } else {
    throw new Error("AI API credentials missing.");
  }
}

// --- LOCAL MOCK MAPPING ENGINES ---

function mockClassifyDistress(transcript) {
  const text = transcript.toLowerCase();
  const highKeywords = ['help', 'stop', 'let go', 'don\'t touch', 'police', 'kill', 'run', 'fire', 'emergency', 'get away'];
  const medKeywords = ['suspicious', 'scared', 'follow', 'creepy', 'weird', 'who is', 'don\'t like'];
  
  let danger_level = 'low';
  let reasoning = 'Analysis shows standard background conversation.';
  let confidence = 0.90;

  const foundHigh = highKeywords.filter(k => text.includes(k));
  const foundMed = medKeywords.filter(k => text.includes(k));

  if (foundHigh.length > 0) {
    danger_level = 'high';
    reasoning = `Distress phrase detected matching: [${foundHigh.join(', ')}].`;
    confidence = 0.98;
  } else if (foundMed.length > 0) {
    danger_level = 'medium';
    reasoning = `Vulnerable phrase detected matching: [${foundMed.join(', ')}].`;
    confidence = 0.85;
  }

  return { danger_level, reasoning, confidence };
}

function mockDraftAlert(userName, transcript, locationDetails) {
  const time = new Date().toLocaleString();
  if (!transcript || transcript.trim().length === 0) {
    return `EMERGENCY ALERT: ${userName} has triggered a GuardianLink silent alarm. Current location: ${locationDetails}. Timestamp: ${time}.`;
  }
  return `EMERGENCY ALERT: ${userName} has triggered a GuardianLink alarm. Background speech heard: "${transcript}". Location: ${locationDetails}. Timestamp: ${time}. Please investigate immediately!`;
}

// --- EXPORTED SERVICE API ---

async function classifySpeech(transcript) {
  if (!transcript || transcript.trim().length === 0) {
    return { danger_level: 'low', reasoning: 'Empty transcript.', confidence: 1.0 };
  }

  const hasKeys = !!(geminiApiKey || openaiApiKey);
  if (!hasKeys) {
    return { ...mockClassifyDistress(transcript), mock: true };
  }

  try {
    const prompt = `You are an AI distress detection system for a personal safety app. Analyze the following transcript of audio recorded from a user's device and classify the situation:
Transcript: "${transcript}"

Determine if the user is in danger or distress.
Analyze for:
- Specific keywords ("help", "stop", "let go", "no", "don't", "police", "run", "leave me alone")
- Panic or distress tone/phrases
- Any verbal conflict, harassment, threatening behavior, physical abuse, or emergency situations.
- You must classify the distress level as one of: "high" (immediate danger, SOS required), "medium" (suspicious/vulnerable, needs attention), or "low" (normal conversation, no danger).

Response must be a valid JSON object matching this schema:
{
  "danger_level": "high" | "medium" | "low",
  "reasoning": "brief explanation of why this classification was made",
  "confidence": 0.0 to 1.0
}
Do not include any markdown formatting or extra text, output ONLY raw JSON.`;

    const rawJson = await queryLLM(prompt, true);
    const result = JSON.parse(rawJson);
    return { ...result, mock: false };
  } catch (err) {
    console.error("[AI Service] Live LLM classification failed, falling back to local regex matching:", err.message);
    return { ...mockClassifyDistress(transcript), mock: true, error: err.message };
  }
}

async function generateAIDraft(userName, transcript, locationDetails) {
  const hasKeys = !!(geminiApiKey || openaiApiKey);
  if (!hasKeys) {
    return mockDraftAlert(userName, transcript, locationDetails);
  }

  try {
    const prompt = `You are an AI personal safety dispatcher. Generate a clear, concise, and highly urgent emergency SMS/email message to be sent to the trusted contacts of a user who is in danger.
Context:
- User Name: ${userName}
- Situation Transcript: "${transcript}"
- Location details: "${locationDetails}"

The alert must:
- Summarize what is happening based on the transcript (e.g. if background voices are heard threatening them or they are asking for help, summarize that).
- Be concise and clear (suitable for an SMS/Email, under 200 characters if possible but complete).
- Instruct the recipient to check on the user immediately and dial 911 if they cannot reach them.
- Do NOT use generic template wording unless the transcript is empty or non-informative.
- Output ONLY the message text. No prefixes (like "Subject:" or "Message:"), no markdown, no quotes around the output.`;

    const draftedMessage = await queryLLM(prompt, false);
    return draftedMessage;
  } catch (err) {
    console.error("[AI Service] Live LLM drafting failed, falling back to local mock:", err.message);
    return mockDraftAlert(userName, transcript, locationDetails);
  }
}

function checkAIEnabled() {
  return !!(geminiApiKey || openaiApiKey);
}

module.exports = {
  classifySpeech,
  generateAIDraft,
  checkAIEnabled
};
