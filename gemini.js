// Engdoc.ai · server-side proxy to the Gemini API (Vercel serverless function)
// The API key stays here on the server, never in the browser.
// Set GEMINI_API_KEY in Vercel → Project → Settings → Environment Variables.
// Optional: GEMINI_MODEL to choose a model (otherwise the latest Flash model is used).
// © English Doctor

const MODELS = [process.env.GEMINI_MODEL, 'gemini-flash-latest', 'gemini-2.5-flash'].filter(Boolean);
const LEVEL_STYLE = {
  foundation: 'Foundation (absolute beginner): use very short, very simple sentences and the most common words only.',
  elementary: 'Elementary: use simple everyday English and short sentences.',
  intermediate: 'Intermediate: use natural everyday English.',
  advanced: 'Advanced: use rich, natural, idiomatic English as a fluent speaker would.'
};

const BUDDY = `You are Doctor Buddy, a warm, patient spoken-English practice partner created by English Doctor for Bangladeshi learners.
- Stay in the role-play described below and keep the conversation going naturally.
- Reply in 1-3 short spoken-style sentences, then ask ONE follow-up question.
- Check ONLY the learner's latest message. If it has a grammar, vocabulary, word-order or Bangla-influenced mistake (for example "I am agree", "He don't know", "Give me a call to you", "I have a doubt" meaning "I have a question", "What is your good name?"), give ONE correction: "said" = the wrong part, "better" = a corrected natural sentence, "why_bn" = a short friendly explanation in simple Bangla. If the message is fine, correction is null.
- If the learner writes in Bangla, put their Bangla in "said", a natural English version in "better", and continue in English.
- "tip" = one useful phrase for this situation, or an empty string.
- Never mock or discourage. Keep everything suitable for all ages. Never ask for personal information such as phone numbers or addresses. Politely refuse unsafe or off-topic requests and steer back to English practice.`;

const EXAMINER = `You are a friendly, professional IELTS Speaking examiner practising with a Bangladeshi candidate.
- Ask ONE question at a time, as in the real test. Do not correct the candidate during the test.
- Part 1: short questions about familiar topics; move to a new question after each answer.
- Part 3: deeper, abstract discussion questions; you may ask a short follow-up ("Why do you think that is?").
- Keep your turn short (one or two sentences). Do not give feedback yet.
- Never ask for personal information such as phone numbers or addresses.`;

const S = { type: 'STRING' };
const CORR = { type: 'OBJECT', nullable: true, properties: { said: S, better: S, why_bn: S }, required: ['said', 'better', 'why_bn'] };
const MIST = { type: 'ARRAY', items: { type: 'OBJECT', properties: { said: S, better: S, why_bn: S }, required: ['said', 'better', 'why_bn'] } };
const CRIT = { type: 'OBJECT', properties: { band: { type: 'NUMBER' }, comment_bn: S }, required: ['band', 'comment_bn'] };

const clip = (s, n) => String(s == null ? '' : s).slice(0, n);
// Conversation turns must start with the user and alternate user/model.
const hist = h => {
  const out = [];
  for (const m of (Array.isArray(h) ? h.slice(-14) : [])) {
    const role = m && m.role === 'model' ? 'model' : 'user';
    const text = clip(m && m.text, 1200) || '...';
    if (!out.length && role === 'model') out.push({ role: 'user', parts: [{ text: '(Start the conversation.)' }] });
    const last = out[out.length - 1];
    if (last && last.role === role) last.parts[0].text += '\n' + text;
    else out.push({ role, parts: [{ text }] });
  }
  return out;
};

function build(b) {
  const t = b && b.task;
  if (t === 'chat') {
    const level = LEVEL_STYLE[b.level] || LEVEL_STYLE.intermediate;
    return {
      system: `${BUDDY}\nRole-play: ${clip(b.role, 300)}.\nTopic: ${clip(b.topic, 120)}.\nLearner level: ${level}`,
      contents: hist(b.history),
      schema: { type: 'OBJECT', properties: { reply: S, correction: CORR, tip: S }, required: ['reply', 'correction', 'tip'] }
    };
  }
  if (t === 'examiner') {
    return {
      system: `${EXAMINER}\nThis is IELTS Speaking Part ${b.part === 3 ? 3 : 1}. Topic: ${clip(b.topic, 120)}.`,
      contents: hist(b.history),
      schema: { type: 'OBJECT', properties: { reply: S }, required: ['reply'] }
    };
  }
  if (t === 'translate') {
    return {
      system: 'You help Bangladeshi learners say things in natural spoken English. The learner gives a sentence in Bangla or Banglish. Give a simple version, a more natural version, and a very short tip in Bangla.',
      contents: [{ role: 'user', parts: [{ text: clip(b.text, 500) }] }],
      schema: { type: 'OBJECT', properties: { simple: S, natural: S, tip_bn: S }, required: ['simple', 'natural', 'tip_bn'] }
    };
  }
  if (t === 'ielts_feedback') {
    return {
      system: `You are an experienced IELTS Speaking trainer giving feedback to a Bangladeshi candidate on a TRANSCRIPT of their speaking (IELTS Speaking Part ${clip(b.part, 2)}).
Estimate bands (0-9, in steps of 0.5) for Fluency and Coherence, Lexical Resource, and Grammatical Range and Accuracy, using the public IELTS band descriptors. Be honest and realistic; do not inflate. Pronunciation cannot be judged from text, so do not score it.
Write each comment in simple Bangla (2 sentences). List up to 5 real mistakes from the transcript with corrections and a short Bangla explanation. Then write an improved model answer in English at about one band higher than the candidate, keeping their ideas. Give 3 short practical tips in Bangla.`,
      contents: [{ role: 'user', parts: [{ text: `Question or task:\n${clip(b.question, 800)}\n\nCandidate transcript:\n${clip(b.answer, 6000)}` }] }],
      schema: {
        type: 'OBJECT',
        properties: { fluency: CRIT, lexical: CRIT, grammar: CRIT, mistakes: MIST, better_answer: S, tips_bn: { type: 'ARRAY', items: S } },
        required: ['fluency', 'lexical', 'grammar', 'mistakes', 'better_answer', 'tips_bn']
      }
    };
  }
  if (t === 'report') {
    return {
      system: 'You review a short spoken-English practice chat by a Bangladeshi learner. Pick the learner\'s top mistakes (max 3) with corrections and a short Bangla explanation, 3 useful new phrases for this topic, and one warm line of encouragement in Bangla.',
      contents: [{ role: 'user', parts: [{ text: (Array.isArray(b.history) ? b.history.slice(-20) : []).map(m => (m.role === 'model' ? 'Buddy: ' : 'Learner: ') + clip(m.text, 600)).join('\n') || 'Learner: hello' }] }],
      schema: { type: 'OBJECT', properties: { top_mistakes: MIST, new_phrases: { type: 'ARRAY', items: S }, encouragement_bn: S }, required: ['top_mistakes', 'new_phrases', 'encouragement_bn'] }
    };
  }
  return null;
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') { res.status(405).json({ error: 'method_not_allowed' }); return; }
  const key = process.env.GEMINI_API_KEY;
  if (!key) { res.status(500).json({ error: 'no_key' }); return; }
  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch (e) { body = null; } }
  const p = build(body);
  if (!p) { res.status(400).json({ error: 'bad_request' }); return; }
  if (!p.contents.length) p.contents = [{ role: 'user', parts: [{ text: 'Hello' }] }];

  for (const model of MODELS) {
    let r;
    try {
      r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: p.system }] },
          contents: p.contents,
          generationConfig: { responseMimeType: 'application/json', responseSchema: p.schema, temperature: 0.7, maxOutputTokens: 4096 }
        })
      });
    } catch (e) { res.status(502).json({ error: 'network' }); return; }
    if (r.status === 404) continue; // model name not available: try the next one
    if (r.status === 429) { res.status(429).json({ error: 'rate_limited' }); return; }
    if (!r.ok) { const t = await r.text(); res.status(502).json({ error: 'upstream', status: r.status, detail: t.slice(0, 300) }); return; }
    const j = await r.json();
    const text = ((j.candidates && j.candidates[0] && j.candidates[0].content && j.candidates[0].content.parts) || []).map(x => x.text || '').join('');
    try { res.status(200).json(JSON.parse(text)); } catch (e) { res.status(502).json({ error: 'bad_json' }); }
    return;
  }
  res.status(502).json({ error: 'no_model' });
};
