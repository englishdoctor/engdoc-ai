/* Engdoc.ai app · © English Doctor
   Plain JavaScript, no build step. Progress is saved only on the learner's device (localStorage). */
(() => {
'use strict';
const DAILY_LIMIT = 40;               // AI replies per device per day (protects the free Gemini quota)
const API = '/api/gemini';
const $ = s => document.querySelector(s);
const app = $('#app');
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const LV = {}; const UNIT = {};
LEVELS.forEach(l => { LV[l.id] = l; l.units.forEach((u, i) => { u.level = l.id; u.n = i + 1; UNIT[u.id] = u; }); });
const ALL_UNITS = LEVELS.flatMap(l => l.units);

/* ---------- saved state ---------- */
const KEY = 'engdoc-v1';
const defaults = () => ({name:'', streak:0, last:'', sessions:0, done:{}, best:{}, notebook:[], ai:{day:'', n:0}, accent:'en-GB', auto:true, level:'foundation'});
let S; try { S = Object.assign(defaults(), JSON.parse(localStorage.getItem(KEY) || '{}')); } catch (e) { S = defaults(); }
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {} };
const day = (d = new Date()) => d.toLocaleDateString('en-CA');
function touchStreak() {
  const t = day(); if (S.last === t) return;
  const y = new Date(); y.setDate(y.getDate() - 1);
  S.streak = S.last === day(y) ? S.streak + 1 : 1; S.last = t; save();
}
const aiLeft = () => S.ai.day === day() ? Math.max(0, DAILY_LIMIT - S.ai.n) : DAILY_LIMIT;
function addNote(fix, src) {
  if (!fix || !fix.better) return;
  if (S.notebook.some(n => n.better === fix.better)) return;
  S.notebook.unshift({said: fix.said || '', better: fix.better, why_bn: fix.why_bn || '', src: src || '', date: day()});
  S.notebook = S.notebook.slice(0, 300); save();
}

/* ---------- small UI helpers ---------- */
let toastT;
function toast(msg) {
  let t = $('.toast'); if (!t) { t = document.createElement('div'); t.className = 'toast'; t.setAttribute('role', 'status'); document.body.append(t); }
  t.textContent = msg; t.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => { t.hidden = true; }, 3500);
}
const view = html => { app.innerHTML = html; window.scrollTo(0, 0); };
const spinner = '<span class="spin" aria-label="Loading"></span>';

/* ---------- AI ---------- */
async function ai(task, data) {
  if (!navigator.onLine) throw new Error('offline');
  if (aiLeft() <= 0) throw new Error('limit');
  const r = await fetch(API, {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(Object.assign({task}, data))});
  if (r.status === 429) throw new Error('busy');
  if (!r.ok) throw new Error('server');
  const j = await r.json();
  if (S.ai.day !== day()) S.ai = {day: day(), n: 0};
  S.ai.n++; save(); touchStreak();
  return j;
}
function aiError(e) {
  const m = e && e.message;
  if (m === 'limit') return 'আজকের AI অনুশীলন শেষ! Great work today. Come back tomorrow · কাল আবার এসো 🌙';
  if (m === 'offline') return 'ইন্টারনেট নেই। You are offline. Phrase practice still works.';
  if (m === 'busy') return 'অনেকে একসাথে অনুশীলন করছে। Too many requests right now, please try again in a minute.';
  return 'দুঃখিত, এখন উত্তর পাওয়া যাচ্ছে না। Something went wrong. Please try again.';
}

/* ---------- speech: listen and speak ---------- */
const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
function listen({lang = 'en-US', continuous = false, onText, onEnd}) {
  const r = new SR(); r.lang = lang; r.interimResults = true; r.continuous = continuous; r.maxAlternatives = 1;
  let fin = '', active = true, ended = false;
  r.onresult = e => { let interim = ''; for (let i = e.resultIndex; i < e.results.length; i++) { const t = e.results[i][0].transcript; if (e.results[i].isFinal) fin += t.trim() + ' '; else interim += t; } onText && onText((fin + interim).trim()); };
  r.onerror = e => { if (e.error === 'not-allowed' || e.error === 'service-not-allowed') { active = false; toast('মাইক্রোফোন অনুমতি দাও। Please allow the microphone.'); } };
  r.onend = () => { if (active && continuous) { try { r.start(); return; } catch (x) {} } if (!ended) { ended = true; onEnd && onEnd(fin.trim()); } };
  try { r.start(); } catch (e) { toast('Microphone could not start.'); }
  return { stop() { active = false; try { r.stop(); } catch (e) {} }, text: () => fin.trim() };
}
let voices = [];
const loadVoices = () => { voices = 'speechSynthesis' in window ? speechSynthesis.getVoices() : []; };
if ('speechSynthesis' in window) { loadVoices(); speechSynthesis.onvoiceschanged = loadVoices; }
function speak(text, lang) {
  if (!('speechSynthesis' in window) || !text) return;
  lang = lang || S.accent; speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text); u.lang = lang; u.rate = .95;
  const v = voices.find(v => v.lang.replace('_', '-') === lang) || voices.find(v => v.lang.replace('_', '-').startsWith(lang.slice(0, 2)));
  if (v) u.voice = v; speechSynthesis.speak(u);
}
const stopSpeak = () => { if ('speechSynthesis' in window) speechSynthesis.cancel(); };

/* compare what the learner said with the target phrase (free, no AI) */
const words = s => String(s).toLowerCase().replace(/[’']/g, "'").replace(/[^a-z0-9' ]+/g, ' ').split(/\s+/).filter(Boolean);
function compare(target, said) {
  const a = words(target), b = words(said);
  const dp = Array.from({length: a.length + 1}, () => new Array(b.length + 1).fill(0));
  for (let i = a.length - 1; i >= 0; i--) for (let j = b.length - 1; j >= 0; j--) dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const hit = new Set(); let i = 0, j = 0;
  while (i < a.length && j < b.length) { if (a[i] === b[j]) { hit.add(i); i++; j++; } else if (dp[i + 1][j] >= dp[i][j + 1]) i++; else j++; }
  return { pct: a.length ? Math.round(hit.size / a.length * 100) : 0, html: a.map((w, k) => `<span class="${hit.has(k) ? 'hit' : 'miss'}">${esc(w)}</span>`).join(' ') };
}

/* ---------- screens ---------- */
const dailyTopic = () => { const d = new Date(); const n = Math.floor((d - new Date(d.getFullYear(), 0, 0)) / 864e5); return DAILY[n % DAILY.length]; };
const nextUnit = () => ALL_UNITS.find(u => !S.done[u.id]) || ALL_UNITS[ALL_UNITS.length - 1];

function home() {
  const t = dailyTopic(), nu = nextUnit(), done = Object.keys(S.done).length;
  view(`
  ${S.name ? `<h1>Hi, ${esc(S.name)}! 👋</h1><p class="bn">আজ একটু ইংরেজি বলি?</p>` : `
  <div class="card"><h2>Welcome to Engdoc.ai · স্বাগতম!</h2><p class="bn">তোমার নাম লেখো, যাতে Doctor Buddy তোমাকে চিনতে পারে।</p>
  <form class="row" id="nameF"><input type="text" id="nameI" placeholder="Your name" aria-label="Your name" style="flex:1"><button class="btn">Start · শুরু</button></form></div>`}
  <div class="hero"><div class="bn">আজকের টপিক · Topic of the day</div><h2>${esc(t[0])}</h2><p class="bn">${esc(t[1])}</p>
  <p>Speak for 1–2 minutes about this topic with Doctor Buddy, your AI partner.</p>
  <a class="btn" href="#talk-daily" style="display:inline-grid;place-items:center;min-height:44px;padding:0 18px;border-radius:12px;text-decoration:none;font-weight:600">🎙 Speak now · এখনই বলো</a></div>
  <div class="stats"><div class="stat"><b>${S.streak}</b>🔥 day streak</div><div class="stat"><b>${done}</b>of ${ALL_UNITS.length} units</div><div class="stat"><b>${aiLeft()}</b>AI replies left today</div></div>
  <div class="grid" style="margin-top:12px">
    <a class="tile" style="--c:${LV[nu.level].color}" href="#unit-${nu.id}"><span class="muted">Continue · চালিয়ে যাও</span><b>${esc(nu.en)}</b><span class="bn">${esc(LV[nu.level].en)} · Unit ${nu.n}</span></a>
    <a class="tile" style="--c:#D24B4B" href="#ielts"><span class="muted">Exam prep</span><b>IELTS Speaking</b><span class="bn">Part 1, 2, 3 + band feedback</span></a>
    <a class="tile" style="--c:#2F6FD0" href="#say"><span class="muted">Stuck? · আটকে গেলে</span><b>Say it in English</b><span class="bn">বাংলায় বলো, ইংরেজি শেখো</span></a>
  </div>`);
  const f = $('#nameF'); if (f) f.onsubmit = e => { e.preventDefault(); const v = $('#nameI').value.trim(); if (v) { S.name = v.slice(0, 30); save(); home(); } };
}

function learn() {
  view(`<h1>Learn · শেখো</h1><p class="bn">Foundation থেকে Advanced, ধাপে ধাপে। Each unit: phrases → pronunciation check → AI role-play.</p>
  ${LEVELS.map(l => { const d = l.units.filter(u => S.done[u.id]).length; return `
  <div class="card" style="border-top:6px solid ${l.color}">
    <div class="row" style="justify-content:space-between"><div><h2>${esc(l.en)} · ${esc(l.bn)}</h2><span class="muted">${esc(l.note)}</span></div><span class="muted">${d}/${l.units.length}</span></div>
    <div class="bar" style="margin:10px 0"><i style="width:${d / l.units.length * 100}%;background:${l.color}"></i></div>
    ${l.units.map(u => `<a class="unit" href="#unit-${u.id}"><span class="n" style="background:${l.color}">${S.done[u.id] ? '✓' : u.n}</span><span class="t"><b>${esc(u.en)}</b><small>${esc(u.bn)}</small></span><span aria-hidden="true">›</span></a>`).join('')}
  </div>`; }).join('')}
  <a class="tile" style="--c:#D24B4B" href="#ielts"><b>Next: IELTS Speaking →</b><span class="bn">Advanced শেষ? এবার IELTS প্রস্তুতি।</span></a>`);
}

function unit(id) {
  const u = UNIT[id]; if (!u) return learn();
  const l = LV[u.level];
  view(`<a href="#learn" class="muted">‹ ${esc(l.en)}</a>
  <h1>${esc(u.en)}</h1><p class="bn">${esc(u.bn)} · ${esc(l.en)} Unit ${u.n}</p>
  <div class="card"><h3>1. Learn the phrases · বাক্যগুলো শেখো</h3><p class="muted">🔊 শোনো, তারপর 🎙 চেপে বলো। Listen, then say it. You get a score.</p>
  ${u.phrases.map((p, i) => `<div class="ph"><div class="tx"><b>${esc(p[0])}</b><span class="bn">${esc(p[1])}</span><div class="score" id="sc${i}">${S.best[id + i] ? `Best: ${S.best[id + i]}%` : ''}</div></div>
    <button class="ic" data-say="${i}" aria-label="Listen">🔊</button>${SR ? `<button class="ic" data-rec="${i}" aria-label="Say it">🎙</button>` : ''}</div>`).join('')}
  ${SR ? '' : '<p class="muted">Speech check works in Chrome, Edge and Safari. Here you can listen and repeat aloud.</p>'}
  </div>
  <div class="card"><h3>2. Speaking task · বলার কাজ</h3><p>${esc(u.task[0])}</p><p class="bn">${esc(u.task[1])}</p></div>
  <div class="card"><h3>3. Role-play with Doctor Buddy</h3><p class="bn">AI-এর সাথে বাস্তব কথোপকথন। Mistakes are corrected in Bangla.</p>
  <a class="btn" href="#talk-${u.id}" style="display:inline-grid;place-items:center;min-height:44px;padding:0 18px;border-radius:12px;text-decoration:none;font-weight:600">Start role-play · শুরু করো</a></div>
  <button class="${S.done[id] ? '' : 'btn-navy'}" id="doneB" style="width:100%">${S.done[id] ? '✓ Completed · সম্পন্ন (tap to undo)' : 'Mark unit complete · ইউনিট শেষ'}</button>`);
  let rec = null;
  app.onclick = e => {
    const s = e.target.closest('[data-say]'); if (s) { speak(u.phrases[+s.dataset.say][0]); return; }
    const r = e.target.closest('[data-rec]'); if (!r) return;
    const i = +r.dataset.rec, out = $('#sc' + i);
    if (rec) { rec.stop(); return; }
    stopSpeak(); r.classList.add('mic', 'live'); out.textContent = 'Listening… বলো';
    rec = listen({lang: 'en-US', onText: t => { out.textContent = '“' + t + '”'; }, onEnd: said => {
      rec = null; r.classList.remove('mic', 'live');
      if (!said) { out.textContent = 'কিছু শোনা যায়নি। Try again.'; return; }
      const c = compare(u.phrases[i][0], said); const k = id + i;
      if (!S.best[k] || c.pct > S.best[k]) { S.best[k] = c.pct; save(); }
      touchStreak();
      out.innerHTML = `<b>${c.pct}%</b> ${c.pct >= 90 ? '🌟 Excellent!' : c.pct >= 70 ? '👍 Good!' : '🔁 Try again'} · ${c.html}`;
    }});
  };
  $('#doneB').onclick = () => { if (S.done[id]) delete S.done[id]; else { S.done[id] = day(); touchStreak(); toast('Unit complete! ইউনিট সম্পন্ন 🎉'); } save(); unit(id); };
}

/* ---------- chat screen (Doctor Buddy role-play, IELTS examiner) ---------- */
let chat = null;
function talk(key) {
  const u = UNIT[key];
  const t = dailyTopic();
  const cfg = u ? {title: u.en, sub: u.bn, role: u.role, topic: u.en, level: u.level, open: u.open, back: '#unit-' + u.id}
    : {title: t[0], sub: 'আজকের টপিক · Topic of the day', role: 'a friendly conversation partner chatting with the learner about today\'s topic', topic: t[0], level: S.level, open: `Hi${S.name ? ' ' + S.name : ''}! Today's topic is "${t[0]}". What comes to your mind first?`, back: '#home', daily: true};
  chat = {mode: 'buddy', cfg, msgs: [{role: 'model', text: cfg.open}], busy: false, bn: false};
  chatScreen();
  if (S.auto) speak(cfg.open);
}
function examiner(part, topic) {
  const open = part === 1 ? `Good afternoon. Now, in this first part, I'd like to ask you some questions about yourself. Let's talk about ${topic.toLowerCase()}. ` + ({hometown: 'Where is your hometown?', 'work-study': 'Do you work or are you a student?', home: 'Do you live in a house or an apartment?', food: 'What kind of food do you like?', weather: 'What is the weather usually like where you live?', 'free-time': 'What do you like to do in your free time?', friends: 'Do you prefer to have a few close friends or many friends?', phones: 'How often do you use your mobile phone?', shopping: 'Do you enjoy shopping?', travel: 'Do you like travelling?'}[chat && chat.topicId] || 'Can you tell me something about it?')
    : `We've been talking about a topic, and now I'd like to discuss with you some more general questions related to ${topic.toLowerCase()}. Let's begin.`;
  return open;
}
function startExam(part, id, topic) {
  chat = {mode: 'exam', part, topicId: id, cfg: {title: `IELTS Part ${part}`, sub: topic, topic, back: '#ielts' + part}, msgs: [], busy: false, bn: false};
  const first = part === 1 ? examiner(1, topic) : examiner(3, topic);
  chat.msgs.push({role: 'model', text: first});
  chatScreen();
  if (S.auto) speak(first);
  if (part === 3) sendExam(true);
}
function chatScreen() {
  const c = chat.cfg, exam = chat.mode === 'exam';
  view(`<a href="${c.back}" class="muted">‹ Back</a>
  <div class="row" style="justify-content:space-between"><div><h2>${esc(c.title)}</h2><span class="bn">${esc(c.sub)}</span></div>
  ${c.daily ? `<select id="lvSel" aria-label="Level">${LEVELS.map(l => `<option value="${l.id}" ${S.level === l.id ? 'selected' : ''}>${l.en}</option>`).join('')}</select>` : ''}</div>
  ${exam ? '<p class="muted">Answer like the real test: 2–4 sentences each. Feedback comes at the end · শেষে ফিডব্যাক পাবে।</p>' : ''}
  <div class="chat" id="chat"></div>
  <form class="compose" id="cf">
    ${SR ? '<button type="button" class="mic" id="micB" aria-label="Speak">🎙</button>' : ''}
    <input id="ci" autocomplete="off" placeholder="${SR ? 'Tap 🎙 to speak, or type…' : 'Type your answer…'}" aria-label="Your message">
    <button class="btn" id="sendB" aria-label="Send">➤</button>
  </form>
  <div class="row">${!exam && SR ? '<button type="button" id="bnB">🇧🇩 Speak in Bangla: off</button>' : ''}
  <button type="button" id="autoB">🔊 Read aloud: ${S.auto ? 'on' : 'off'}</button>
  <button type="button" class="btn-navy" id="endB">${exam ? 'Finish & get band feedback' : 'End session · রিপোর্ট দেখো'}</button></div>
  <div id="rep"></div>`);
  drawChat();
  const ls = $('#lvSel'); if (ls) ls.onchange = () => { S.level = ls.value; chat.cfg.level = ls.value; save(); };
  $('#cf').onsubmit = e => { e.preventDefault(); const v = $('#ci').value.trim(); if (!v || chat.busy) return; $('#ci').value = ''; chat.msgs.push({role: 'user', text: v}); drawChat(); exam ? sendExam() : sendBuddy(); };
  $('#autoB').onclick = () => { S.auto = !S.auto; save(); $('#autoB').textContent = '🔊 Read aloud: ' + (S.auto ? 'on' : 'off'); if (!S.auto) stopSpeak(); };
  const bnB = $('#bnB'); if (bnB) bnB.onclick = () => { chat.bn = !chat.bn; bnB.textContent = '🇧🇩 Speak in Bangla: ' + (chat.bn ? 'on' : 'off'); };
  const micB = $('#micB');
  if (micB) { let rec = null; micB.onclick = () => {
    if (rec) { rec.stop(); return; }
    stopSpeak(); micB.classList.add('live'); const ci = $('#ci'); const base = ci.value;
    rec = listen({lang: chat.bn ? 'bn-BD' : 'en-US', continuous: exam, onText: t => { ci.value = (base + ' ' + t).trim(); }, onEnd: () => { rec = null; micB.classList.remove('live'); if (ci.value.trim()) $('#cf').requestSubmit(); }});
  }; }
  $('#endB').onclick = () => exam ? examFeedback() : report();
  $('#chat').onclick = e => { const b = e.target.closest('[data-say]'); if (b) speak(chat.msgs[+b.dataset.say].text); };
}
function drawChat() {
  const el = $('#chat'); if (!el) return;
  el.innerHTML = chat.msgs.map((m, i) => {
    let h = `<div class="m ${m.role === 'model' ? 'ai' : 'me'}">${esc(m.text)}${m.role === 'model' ? ` <button class="say" data-say="${i}" aria-label="Play">🔊</button>` : ''}</div>`;
    if (m.fix) h += `<div class="fix">✏️ <s>${esc(m.fix.said)}</s><br><span class="good">✓ ${esc(m.fix.better)}</span><br><span class="bn">${esc(m.fix.why_bn)}</span></div>`;
    if (m.tip) h += `<div class="tip">💡 Useful: <b>${esc(m.tip)}</b></div>`;
    return h;
  }).join('') + (chat.busy ? `<div class="m ai">${spinner}</div>` : '');
  const last = el.lastElementChild; if (last && last.scrollIntoView) last.scrollIntoView({block: 'nearest'});
}
async function sendBuddy() {
  chat.busy = true; drawChat();
  try {
    const r = await ai('chat', {role: chat.cfg.role, topic: chat.cfg.topic, level: chat.cfg.level, history: chat.msgs.map(m => ({role: m.role, text: m.text}))});
    const me = chat.msgs[chat.msgs.length - 1];
    if (r.correction && r.correction.better) { me.fix = r.correction; addNote(r.correction, chat.cfg.title); }
    const m = {role: 'model', text: String(r.reply || 'Sorry, could you say that again?')}; if (r.tip) m.tip = String(r.tip);
    chat.msgs.push(m); chat.busy = false; drawChat(); if (S.auto) speak(m.text);
  } catch (e) { chat.busy = false; drawChat(); toast(aiError(e)); }
}
async function sendExam(silent) {
  chat.busy = true; drawChat();
  try {
    const r = await ai('examiner', {part: chat.part, topic: chat.cfg.topic, history: chat.msgs.map(m => ({role: m.role, text: m.text}))});
    const m = {role: 'model', text: String(r.reply || 'Thank you. Next question.')};
    if (silent) chat.msgs[0] = {role: 'model', text: chat.msgs[0].text + '\n\n' + m.text}; else chat.msgs.push(m);
    chat.busy = false; drawChat(); if (S.auto) speak(m.text);
  } catch (e) { chat.busy = false; drawChat(); toast(aiError(e)); }
}
async function report() {
  const box = $('#rep'); const n = chat.msgs.filter(m => m.role === 'user').length;
  if (n < 2) { toast('আরও কিছু কথা বলো! Say at least 2 things first.'); return; }
  box.innerHTML = `<div class="card">${spinner} Making your report…</div>`;
  try {
    const r = await ai('report', {history: chat.msgs.map(m => ({role: m.role, text: m.text}))});
    S.sessions++; save();
    box.innerHTML = `<div class="card"><h2>Session report · রিপোর্ট</h2><p>${n} turns spoken · ${n}টি উত্তর দিয়েছো</p>
    <h3>Top mistakes</h3>${(r.top_mistakes || []).length ? r.top_mistakes.map(f => `<div class="fix" style="max-width:100%;margin:8px 0">✏️ <s>${esc(f.said)}</s><br><span class="good">✓ ${esc(f.better)}</span><br><span class="bn">${esc(f.why_bn)}</span></div>`).join('') : '<p>No big mistakes. চমৎকার! 🌟</p>'}
    <h3>New phrases</h3>${(r.new_phrases || []).map(p => `<div class="ph"><div class="tx"><b>${esc(p)}</b></div><button class="ic" data-p="${esc(p)}" aria-label="Listen">🔊</button></div>`).join('')}
    <p style="font-size:18px">💛 ${esc(r.encouragement_bn)}</p></div>`;
    (r.top_mistakes || []).forEach(f => addNote(f, chat.cfg.title));
    box.onclick = e => { const b = e.target.closest('[data-p]'); if (b) speak(b.dataset.p); };
    box.scrollIntoView({block: 'start'});
  } catch (e) { box.innerHTML = ''; toast(aiError(e)); }
}

/* ---------- IELTS ---------- */
function ielts() {
  view(`<h1>IELTS Speaking</h1><p class="bn">আসল পরীক্ষার মতো অনুশীলন, তারপর AI ব্যান্ড ফিডব্যাক।</p>
  <div class="grid">
    <a class="tile" style="--c:#2E9E6A" href="#ielts1"><b>Part 1 · Interview</b><span class="bn">৪–৫ মিনিট · familiar topics, short answers</span></a>
    <a class="tile" style="--c:#F2A93B" href="#ielts2"><b>Part 2 · Cue card</b><span class="bn">১ মিনিট প্রস্তুতি + ২ মিনিট বলা</span></a>
    <a class="tile" style="--c:#D24B4B" href="#ielts3"><b>Part 3 · Discussion</b><span class="bn">৪–৫ মিনিট · deeper questions, give reasons</span></a>
  </div>
  <div class="card"><h3>How the feedback works · ফিডব্যাক কীভাবে</h3>
  <p>The AI reads the transcript of what you said and estimates bands for <b>Fluency and Coherence</b>, <b>Lexical Resource</b> and <b>Grammatical Range and Accuracy</b>.</p>
  <p class="bn">উচ্চারণ (Pronunciation) লেখা থেকে মাপা যায় না, তাই এটা স্কোর করা হয় না। এটা আনুমানিক ব্যান্ড, অফিসিয়াল স্কোর নয়।</p></div>`);
}
function ieltsPart(p) {
  if (p === 2) return part2List();
  const list = p === 1 ? IELTS.part1.map(t => [t.id, t.en, t.bn]) : IELTS.part2.map(c => [c.id, c.p3, '']);
  view(`<a href="#ielts" class="muted">‹ IELTS</a><h1>Part ${p} · ${p === 1 ? 'Interview' : 'Discussion'}</h1>
  <p class="bn">একটা টপিক বেছে নাও। Choose a topic. The examiner asks one question at a time.</p>
  <div class="grid">${list.map(t => `<button class="tile" style="--c:${p === 1 ? '#2E9E6A' : '#D24B4B'};text-align:left" data-t="${t[0]}"><b>${esc(t[1])}</b>${t[2] ? `<span class="bn">${esc(t[2])}</span>` : ''}</button>`).join('')}</div>`);
  app.onclick = e => { const b = e.target.closest('[data-t]'); if (!b) return; const it = list.find(t => t[0] === b.dataset.t); chat = {topicId: it[0]}; startExam(p, it[0], it[1]); };
}
async function examFeedback() {
  const ans = chat.msgs.filter(m => m.role === 'user');
  if (ans.length < 2) { toast('আরও কিছু প্রশ্নের উত্তর দাও। Answer at least 2 questions first.'); return; }
  const qa = chat.msgs.map(m => (m.role === 'model' ? 'Examiner: ' : 'Candidate: ') + m.text).join('\n');
  await feedback($('#rep'), chat.part, `IELTS Speaking Part ${chat.part}: ${chat.cfg.topic}`, qa);
}
async function feedback(box, part, question, answer) {
  box.innerHTML = `<div class="card">${spinner} Checking your answer like an examiner… পরীক্ষকের মতো দেখছি…</div>`;
  box.scrollIntoView({block: 'start'});
  try {
    const r = await ai('ielts_feedback', {part, question, answer});
    const crit = [['Fluency and Coherence', r.fluency], ['Lexical Resource', r.lexical], ['Grammatical Range and Accuracy', r.grammar]];
    const nums = crit.map(c => Number(c[1] && c[1].band) || 0);
    const avg = Math.round(nums.reduce((a, b) => a + b, 0) / 3 * 2) / 2;
    S.sessions++; save(); (r.mistakes || []).forEach(f => addNote(f, 'IELTS Part ' + part));
    box.innerHTML = `<div class="card"><h2>Estimated band · আনুমানিক ব্যান্ড: ${avg.toFixed(1)}</h2>
    <p class="muted">From your transcript only. Pronunciation is not scored. · শুধু লেখা থেকে, উচ্চারণ বাদে।</p>
    <div class="bands">${crit.map(c => `<div class="band"><b>${esc(Number(c[1] && c[1].band || 0).toFixed(1))}</b><span>${esc(c[0])}</span><p class="bn">${esc(c[1] && c[1].comment_bn)}</p></div>`).join('')}</div>
    <h3 style="margin-top:14px">Mistakes to fix · ভুল সংশোধন</h3>${(r.mistakes || []).map(f => `<div class="fix" style="max-width:100%;margin:8px 0">✏️ <s>${esc(f.said)}</s><br><span class="good">✓ ${esc(f.better)}</span><br><span class="bn">${esc(f.why_bn)}</span></div>`).join('') || '<p>No major mistakes found. 🌟</p>'}
    <h3>Better answer · উন্নত উত্তর</h3><p style="white-space:pre-wrap">${esc(r.better_answer)}</p><button id="playBetter">🔊 Listen</button>
    <h3 style="margin-top:14px">Tips · পরামর্শ</h3><ul>${(r.tips_bn || []).map(t => `<li>${esc(t)}</li>`).join('')}</ul></div>`;
    $('#playBetter').onclick = () => speak(r.better_answer);
  } catch (e) { box.innerHTML = ''; toast(aiError(e)); }
}
function part2List() {
  view(`<a href="#ielts" class="muted">‹ IELTS</a><h1>Part 2 · Cue card</h1>
  <p class="bn">একটা কার্ড বেছে নাও। ১ মিনিট নোট নাও, তারপর ২ মিনিট বলো।</p>
  <button class="btn" id="rnd" style="width:100%;margin-bottom:12px">🎲 Random card · যেকোনো একটা</button>
  ${IELTS.part2.map(c => `<a class="unit" href="#card-${c.id}"><span class="n" style="background:#F2A93B">2</span><span class="t"><b>${esc(c.title)}</b></span>›</a>`).join('')}`);
  $('#rnd').onclick = () => { location.hash = 'card-' + IELTS.part2[Math.floor(Math.random() * IELTS.part2.length)].id; };
}
let tick = null;
function card(id) {
  const c = IELTS.part2.find(x => x.id === id); if (!c) return part2List();
  clearInterval(tick);
  view(`<a href="#ielts2" class="muted">‹ Cue cards</a>
  <div class="cue"><b style="font-size:19px">${esc(c.title)}</b><p>You should say:</p><ul>${c.points.map(p => `<li>${esc(p)}</li>`).join('')}</ul></div>
  <div class="card"><div class="timer" id="tm">1:00</div><p class="muted" style="text-align:center" id="phase">Preparation: 1 minute · প্রস্তুতি ১ মিনিট</p>
  <textarea id="notes" rows="3" placeholder="Notes (keywords only) · নোট লেখো"></textarea>
  <div class="row" style="justify-content:center;margin-top:10px"><button class="btn" id="go">Start preparation</button><button id="skip">Skip to speaking</button></div></div>
  <div class="card"><h3>Your answer · তোমার উত্তর</h3><p class="muted">${SR ? 'Speaking starts automatically after preparation. Your words appear here. You can also type or edit.' : 'Speech typing is not supported in this browser. Type your answer here.'}</p>
  <textarea id="ans" rows="7" placeholder="Your answer…"></textarea>
  <div class="row" style="margin-top:10px"><button class="btn-navy" id="fb">Get band feedback</button><a class="muted" href="#ielts3">Then try Part 3 →</a></div></div>
  <div id="rep"></div>`);
  let rec = null;
  const tm = $('#tm'), ph = $('#phase');
  const fmt = s => Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
  function run(sec, onDone) { clearInterval(tick); let s = sec; tm.textContent = fmt(s); tick = setInterval(() => { s--; tm.textContent = fmt(Math.max(s, 0)); if (s <= 0) { clearInterval(tick); onDone(); } }, 1000); }
  function speakPhase() {
    ph.textContent = 'Speak now: 2 minutes · এখন ২ মিনিট বলো'; $('#go').hidden = true; $('#skip').textContent = 'Stop'; stopSpeak();
    if (SR) { const a = $('#ans'); const base = a.value; rec = listen({lang: 'en-US', continuous: true, onText: t => { a.value = (base + ' ' + t).trim(); }, onEnd: () => {} }); }
    run(120, stopAll);
    $('#skip').onclick = stopAll;
  }
  function stopAll() { clearInterval(tick); if (rec) { rec.stop(); rec = null; } ph.textContent = 'Time is up. Get your feedback below · সময় শেষ'; $('#skip').hidden = true; $('#go').hidden = true; }
  $('#go').onclick = () => { $('#go').disabled = true; run(60, speakPhase); };
  $('#skip').onclick = speakPhase;
  $('#fb').onclick = () => { stopAll(); const a = $('#ans').value.trim(); if (a.split(/\s+/).length < 25) { toast('উত্তর খুব ছোট। Say a bit more (at least 25 words).'); return; } feedback($('#rep'), 2, c.title + ' You should say: ' + c.points.join('; '), a); };
}

/* ---------- Say it in English ---------- */
function say() {
  view(`<h1>Say it in English</h1><p class="bn">বাংলায় লেখো বা বলো, ইংরেজিতে কীভাবে বলবে তা শেখো।</p>
  <div class="card"><textarea id="bnT" rows="3" placeholder="যেমন: আমি একটু দেরি করে ফেলেছি, দুঃখিত।"></textarea>
  <div class="row" style="margin-top:10px">${SR ? '<button class="mic" id="bnMic" aria-label="Speak in Bangla">🎙</button>' : ''}<button class="btn" id="tr" style="flex:1">ইংরেজিতে বলো · Translate</button></div></div>
  <div id="trOut"></div>`);
  const mic = $('#bnMic'); let rec = null;
  if (mic) mic.onclick = () => { if (rec) { rec.stop(); return; } mic.classList.add('live'); const t = $('#bnT'); rec = listen({lang: 'bn-BD', onText: x => { t.value = x; }, onEnd: () => { rec = null; mic.classList.remove('live'); } }); };
  $('#tr').onclick = async () => {
    const t = $('#bnT').value.trim(); if (!t) return; const out = $('#trOut');
    out.innerHTML = `<div class="card">${spinner}</div>`;
    try {
      const r = await ai('translate', {text: t});
      out.innerHTML = `<div class="card"><div class="ph"><div class="tx"><span class="muted">Simple</span><b>${esc(r.simple)}</b></div><button class="ic" data-p="${esc(r.simple)}" aria-label="Listen">🔊</button></div>
      <div class="ph"><div class="tx"><span class="muted">More natural</span><b>${esc(r.natural)}</b></div><button class="ic" data-p="${esc(r.natural)}" aria-label="Listen">🔊</button></div>
      <p>💡 ${esc(r.tip_bn)}</p><button id="keep">⭐ Save to my notebook</button></div>`;
      out.onclick = e => { const b = e.target.closest('[data-p]'); if (b) speak(b.dataset.p); };
      $('#keep').onclick = () => { addNote({said: t, better: r.natural, why_bn: r.tip_bn}, 'Say it'); toast('Saved · নোটবুকে রাখা হলো'); };
    } catch (e) { out.innerHTML = ''; toast(aiError(e)); }
  };
}

/* ---------- Me: progress, notebook, settings ---------- */
function me() {
  const done = Object.keys(S.done).length;
  view(`<h1>My progress · আমার অগ্রগতি</h1>
  <div class="stats"><div class="stat"><b>${S.streak}</b>🔥 streak</div><div class="stat"><b>${done}</b>units done</div><div class="stat"><b>${S.sessions}</b>sessions</div></div>
  <div class="card">${LEVELS.map(l => { const d = l.units.filter(u => S.done[u.id]).length; return `<p style="margin:8px 0 4px"><b>${esc(l.en)}</b> · ${d}/${l.units.length}</p><div class="bar"><i style="width:${d / l.units.length * 100}%;background:${l.color}"></i></div>`; }).join('')}</div>
  <div class="card"><h2>My mistake notebook · ভুলের খাতা (${S.notebook.length})</h2>
  <input type="search" id="nbS" placeholder="Search · খুঁজো" aria-label="Search notebook"><div id="nb"></div></div>
  <div class="card"><h2>Settings · সেটিংস</h2>
  <label class="row" style="margin:8px 0">Your name <input type="text" id="nmI" value="${esc(S.name)}" style="flex:1"></label>
  <label class="row" style="margin:8px 0">Voice accent <select id="acc"><option value="en-GB" ${S.accent === 'en-GB' ? 'selected' : ''}>British (IELTS)</option><option value="en-US" ${S.accent === 'en-US' ? 'selected' : ''}>American</option></select></label>
  <p class="muted">AI replies left today: ${aiLeft()} of ${DAILY_LIMIT}. Resets at midnight.</p>
  <button id="erase">Erase my data · সব মুছে ফেলো</button></div>
  <div class="card"><h2>About Engdoc.ai</h2>
  <p>Engdoc.ai is a free spoken-English practice app by <b>English Doctor</b>, from Foundation to IELTS Speaking.</p>
  <p class="bn">ব্যক্তিগত তথ্য (ফোন নম্বর, ঠিকানা, পাসওয়ার্ড) চ্যাটে লিখবে না। Don't share personal information in practice chats. AI can make mistakes.</p>
  <p>Facebook: <a href="https://www.facebook.com/search/top?q=English%20Doctor">English Doctor</a> · WhatsApp: <a href="https://wa.me/8801682888114">01682888114</a></p>
  <p class="muted">Install: Android/PC Chrome → “Install app”. iPhone Safari → Share → “Add to Home Screen”.</p></div>`);
  const nb = $('#nb');
  const draw = q => { const list = S.notebook.filter(n => !q || (n.better + n.said + n.why_bn).toLowerCase().includes(q.toLowerCase()));
    nb.innerHTML = list.length ? list.map(n => `<div class="ph"><div class="tx">${n.said ? `<s class="muted">${esc(n.said)}</s>` : ''}<b>${esc(n.better)}</b><span class="bn">${esc(n.why_bn)}</span></div><button class="ic" data-p="${esc(n.better)}" aria-label="Listen">🔊</button><button class="ic" data-del="${esc(n.better)}" aria-label="Delete">🗑</button></div>`).join('') : '<p class="muted">ভুলগুলো এখানে জমা হবে। Your corrected mistakes will appear here.</p>'; };
  draw('');
  $('#nbS').oninput = e => draw(e.target.value);
  nb.onclick = e => { const p = e.target.closest('[data-p]'); if (p) speak(p.dataset.p); const d = e.target.closest('[data-del]'); if (d) { S.notebook = S.notebook.filter(n => n.better !== d.dataset.del); save(); draw($('#nbS').value); } };
  $('#nmI').onchange = e => { S.name = e.target.value.trim().slice(0, 30); save(); toast('Saved'); };
  $('#acc').onchange = e => { S.accent = e.target.value; save(); speak('Hello! This is how I sound.'); };
  $('#erase').onclick = () => { const m = document.createElement('div'); m.className = 'modal';
    m.innerHTML = `<div class="card"><h3>Erase all progress?</h3><p class="bn">তোমার সব অগ্রগতি মুছে যাবে।</p><div class="row"><button id="noE">Cancel</button><button class="btn-navy" id="yesE">Erase</button></div></div>`;
    document.body.append(m); $('#noE').onclick = () => m.remove(); $('#yesE').onclick = () => { S = defaults(); save(); m.remove(); me(); }; };
}

/* ---------- router ---------- */
function route() {
  stopSpeak(); clearInterval(tick); app.onclick = null;
  const h = location.hash.slice(1) || 'home';
  const tab = h.startsWith('unit-') || h === 'learn' || h.startsWith('talk-') && h !== 'talk-daily' ? 'learn' : h.startsWith('ielts') || h.startsWith('card-') ? 'ielts' : ['say', 'me'].includes(h) ? h : 'home';
  document.querySelectorAll('.nav a').forEach(a => a.classList.toggle('on', a.dataset.n === tab));
  if (h === 'home') home();
  else if (h === 'learn') learn();
  else if (h.startsWith('unit-')) unit(h.slice(5));
  else if (h.startsWith('talk-')) talk(h.slice(5));
  else if (h === 'ielts') ielts();
  else if (h === 'ielts1') ieltsPart(1);
  else if (h === 'ielts2') ieltsPart(2);
  else if (h === 'ielts3') ieltsPart(3);
  else if (h.startsWith('card-')) card(h.slice(5));
  else if (h === 'say') say();
  else if (h === 'me') me();
  else home();
}
window.addEventListener('hashchange', route);
route();

/* ---------- install as an app (PWA) ---------- */
let deferred = null; const ib = $('#installBtn');
window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); deferred = e; ib.hidden = false; });
const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent) && !window.MSStream;
const standalone = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone;
if (isIOS && !standalone) ib.hidden = false;
ib.onclick = async () => {
  if (deferred) { deferred.prompt(); await deferred.userChoice; deferred = null; ib.hidden = true; return; }
  toast('iPhone: Safari-তে Share ⬆ চাপো, তারপর “Add to Home Screen”।');
};
window.addEventListener('appinstalled', () => { ib.hidden = true; toast('Engdoc.ai installed! 🎉'); });
if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('sw.js').catch(() => {});
})();
