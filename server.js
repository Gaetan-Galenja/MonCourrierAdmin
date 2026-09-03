// server.js — Serveur HTTP zero-dependance pour "Mon Courrier Admin" (prototype).
const http = require("http");
const fs = require("fs");
const path = require("path");
const { analyze } = require("./analyzer");
const samples = require("./samples");
const { pickAd, getAdById } = require("./ads");

// --- Branchement IA locale via Ollama (gratuit, prive : rien ne sort de la machine) ---
// Si Ollama ne repond pas / erreur / JSON invalide -> on retombe sur le moteur heuristique.
const OLLAMA_URL = process.env.OLLAMA_URL || "http://localhost:11434";
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || "qwen2.5:7b";
const OLLAMA_VISION_MODEL = process.env.OLLAMA_VISION_MODEL || "minicpm-v";
const USE_OLLAMA = process.env.USE_OLLAMA !== "0";

// Fournisseur LLM : "ollama" (local, defaut) ou "openai" (cloud, pour un deploiement en ligne).
const LLM_PROVIDER = process.env.LLM_PROVIDER || "ollama";
const OPENAI_BASE_URL = process.env.OPENAI_BASE_URL || "https://api.openai.com/v1";
const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";
const OCR_CLEANUP = process.env.OCR_CLEANUP !== "0";
const OCR_ENABLED = process.env.OCR_DISABLED !== "1";
const ENGINE = LLM_PROVIDER === "openai"
  ? ("IA cloud (" + OPENAI_MODEL + ")")
  : ("IA locale (Ollama: " + OLLAMA_MODEL + ")");

// --- Persistance simple (historique + echeances), zero-dependance ---
const DATA_DIR = path.join(__dirname, "data");
const HISTORY_FILE = path.join(DATA_DIR, "history.json");
function loadHistory() { try { return JSON.parse(fs.readFileSync(HISTORY_FILE, "utf8")); } catch (e) { return []; } }
function saveHistory(list) { try { fs.mkdirSync(DATA_DIR, { recursive: true }); fs.writeFileSync(HISTORY_FILE, JSON.stringify(list, null, 2)); } catch (e) {} }
function parseFrDate(s) { const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(String(s || "").trim()); if (!m) return null; const d = new Date(+m[3], +m[2] - 1, +m[1]); return isNaN(d) ? null : d; }
function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }

function pad2(n) { return String(n).padStart(2, "0"); }
function todayStr() { const d = new Date(); return pad2(d.getDate()) + "/" + pad2(d.getMonth() + 1) + "/" + d.getFullYear(); }

const SYSTEM_PROMPT =
"Tu es un assistant qui aide des particuliers en France a comprendre leur courrier administratif.\n" +
"On te donne le texte d'un courrier ou d'un message. Tu reponds STRICTEMENT par un objet JSON valide (aucun texte autour, pas de markdown), en francais, avec EXACTEMENT ces champs :\n" +
"{\n" +
'  "type": "categorie de l\'expediteur (ex: Impots (DGFiP), CAF, URSSAF, Assurance Maladie (Ameli / CPAM), Huissier / Commissaire de justice, Energie, Banque, Assurance, Justice / Tribunal, ou Courrier non identifie)",\n' +
'  "icon": "un emoji representant le type",\n' +
'  "urgency": "l\'une de ces valeurs exactes: normale, a surveiller, urgente, arnaque",\n' +
'  "amount": "le montant principal mentionne avec sa devise, ou null",\n' +
'  "summary": "2 a 4 phrases en francais simple expliquant le courrier et ses consequences",\n' +
'  "deadlines": [ { "date": "JJ/MM/AAAA", "label": "nature de l\'echeance" } ],\n' +
'  "actions": [ "action concrete a faire" ],\n' +
'  "draftReply": "un brouillon de reponse poli et pret a completer ; si c\'est une arnaque, indiquer de ne pas repondre et de signaler",\n' +
'  "scam": { "isScam": true, "score": 0, "reasons": ["indice"] }\n' +
"}\n" +
"Regles:\n" +
"- La date du jour est {TODAY}. Convertis tout delai relatif (ex: 'sous 15 jours') en date JJ/MM/AAAA.\n" +
"- Une administration francaise ne demande JAMAIS de coordonnees bancaires par lien ou SMS : si le message le fait, c'est une arnaque (urgency='arnaque', scam.isScam=true, score eleve).\n" +
"- S'il n'y a pas d'echeance, mets \"deadlines\": [].\n" +
"- N'invente JAMAIS de numero de telephone, d'adresse e-mail, de reference de dossier ni d'URL : utilise uniquement les informations presentes dans le courrier, et laisse des crochets [a completer] pour ce qui manque.\n" +
"- Le brouillon (draftReply) doit rester generique, poli, sans coordonnees inventees.\n" +
"- Coherence : si scam.isScam vaut true, alors urgency doit valoir 'arnaque' et scam.score doit etre >= 70.\n" +
"- Reponds uniquement par le JSON, rien d'autre.";

function normalize(o) {
  const urg = ["normale", "a surveiller", "urgente", "arnaque"];
  const scam = o.scam || {};
  const isScam = !!scam.isScam;
  let urgency = urg.indexOf(o.urgency) >= 0 ? o.urgency : "normale";
  let score = Math.max(0, Math.min(100, Number(scam.score) || 0));
  if (isScam) { urgency = "arnaque"; if (score < 70) score = 70; }
  return {
    type: String(o.type || "Courrier non identifie"),
    icon: String(o.icon || "\u2709\uFE0F"),
    urgency: urgency,
    amount: o.amount ? String(o.amount) : null,
    summary: String(o.summary || ""),
    deadlines: Array.isArray(o.deadlines)
      ? o.deadlines.filter(d => d && d.date).map(d => ({ date: String(d.date), label: String(d.label || "Echeance") }))
      : [],
    actions: Array.isArray(o.actions) ? o.actions.map(String) : [],
    draftReply: String(o.draftReply || ""),
    scam: {
      isScam: isScam,
      score: score,
      reasons: Array.isArray(scam.reasons) ? scam.reasons.map(String) : []
    },
    engine: ENGINE
  };
}

// --- Fusion IA + filet heuristique deterministe ---
// La detection d'arnaque et les consignes de securite ne dependent JAMAIS du seul
// modele local (trop faillible) : on prend le pire cas des deux moteurs, et en cas
// d'arnaque on impose des actions/reponses sures.
const SCAM_SUMMARY = "Attention : ce message presente des signes d'arnaque (hameconnage). Une administration ou une entreprise legitime ne vous demandera jamais vos coordonnees bancaires par lien ou SMS. Ne cliquez sur aucun lien et ne communiquez aucune information.";
const SCAM_ACTIONS = [
  "Ne cliquez sur aucun lien et ne communiquez aucune donnee personnelle ou bancaire.",
  "Verifiez en passant par le site officiel (tapez l'adresse vous-meme) ou un numero figurant sur vos courriers officiels.",
  "Signalez : SMS au 33700, ou sur signal-arnaques.com / cybermalveillance.gouv.fr.",
  "Supprimez le message."
];
const SCAM_REPLY = "(Aucune reponse a envoyer : il s'agit tres probablement d'une tentative d'arnaque. Ne repondez pas et signalez-le.)";

function mostSevere(a, b) {
  const r = { "normale": 0, "a surveiller": 1, "urgente": 2, "arnaque": 3 };
  return (r[b] > r[a]) ? b : a;
}
function mergeDeadlines(a, b) {
  const out = [], seen = new Set();
  for (const d of a.concat(b)) {
    if (!d || !d.date) continue;
    if (!seen.has(d.date)) { seen.add(d.date); out.push({ date: String(d.date), label: String(d.label || "Echeance") }); }
  }
  return out;
}
function mergeResults(heur, llm) {
  const isScam = !!(heur.scam.isScam || llm.scam.isScam);
  let score = Math.max(heur.scam.score || 0, llm.scam.score || 0);
  if (isScam && score < 70) score = 70;
  const reasons = [], seenR = new Set();
  for (const r of (heur.scam.reasons || []).concat(llm.scam.reasons || [])) {
    const s = String(r);
    if (s && !seenR.has(s)) { seenR.add(s); reasons.push(s); }
  }
  const useLlmType = llm.type && llm.type !== "Courrier non identifie";
  return {
    type: isScam ? "Message suspect" : (useLlmType ? llm.type : heur.type),
    icon: isScam ? "\u26A0\uFE0F" : (useLlmType ? llm.icon : heur.icon),
    urgency: isScam ? "arnaque" : mostSevere(heur.urgency, llm.urgency),
    amount: llm.amount || heur.amount || null,
    summary: isScam ? SCAM_SUMMARY : (llm.summary || heur.summary),
    deadlines: isScam ? [] : mergeDeadlines(llm.deadlines || [], heur.deadlines || []),
    actions: isScam ? SCAM_ACTIONS.slice() : ((llm.actions && llm.actions.length) ? llm.actions : heur.actions),
    draftReply: isScam ? SCAM_REPLY : (llm.draftReply || heur.draftReply),
    scam: { isScam: isScam, score: score, reasons: reasons },
    engine: ENGINE + " + filet heuristique"
  };
}

async function llmAnalyze(text) {
  if (LLM_PROVIDER === "openai") return openaiAnalyze(text);
  if (!USE_OLLAMA) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 120000);
  try {
    const r = await fetch(OLLAMA_URL + "/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: OLLAMA_MODEL,
        stream: false,
        format: "json",
        options: { temperature: 0.1, num_predict: 800 },
        messages: [
          { role: "system", content: SYSTEM_PROMPT.replace("{TODAY}", todayStr()) },
          { role: "user", content: String(text).slice(0, 8000) }
        ]
      }),
      signal: controller.signal
    });
    if (!r.ok) return null;
    const data = await r.json();
    const content = data && data.message && data.message.content;
    if (!content) return null;
    let obj;
    try { obj = JSON.parse(content); } catch (e) { return null; }
    return normalize(obj);
  } catch (e) {
    return null; // fallback heuristique
  } finally {
    clearTimeout(timer);
  }
}

// Variante cloud (OpenAI-compatible) pour tourner sans Ollama lors d'un deploiement en ligne.
async function openaiAnalyze(text) {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 60000);
  try {
    const r = await fetch(OPENAI_BASE_URL + "/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": "Bearer " + key },
      body: JSON.stringify({
        model: OPENAI_MODEL,
        temperature: 0.1,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: SYSTEM_PROMPT.replace("{TODAY}", todayStr()) },
          { role: "user", content: String(text).slice(0, 8000) }
        ]
      }),
      signal: controller.signal
    });
    if (!r.ok) return null;
    const data = await r.json();
    const c = data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
    if (!c) return null;
    let obj;
    try { obj = JSON.parse(c); } catch (e) { return null; }
    return normalize(obj);
  } catch (e) {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// --- OCR via PaddleOCR (free Python), Google Vision, or Ollama ---
const USE_PADDLE_OCR = process.env.USE_PADDLE_OCR === "1" || process.env.USE_PADDLE === "1";
const { spawn } = require("child_process");

async function ocrImageGoogle(b64) {
  if (!GOOGLE_VISION_KEY) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30000);
  try {
    const r = await fetch("https://vision.googleapis.com/v1/images:annotate?key=" + GOOGLE_VISION_KEY.project_id, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        requests: [{
          image: { content: b64 },
          features: [{ type: "TEXT_DETECTION" }]
        }]
      }),
      signal: controller.signal
    });
    if (!r.ok) return null;
    const data = await r.json();
    const annotations = data.responses && data.responses[0] && data.responses[0].textAnnotations;
    if (!annotations || annotations.length === 0) return null;
    return annotations[0].description || null;
  } catch (e) {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function ocrImage(b64) {
  let result = null;
  
  // Try PaddleOCR first (free Python, fast)
  if (USE_PADDLE_OCR) {
    result = await ocrImagePaddle(b64);
    if (result) return result;
  }
  
  // Fall back to Ollama local (if available)
  if (USE_OLLAMA) {
    result = await ocrImageOllama(b64);
    if (result) return result;
  }
  
  return null;
}

async function ocrImagePaddle(b64) {
  return new Promise((resolve) => {
    const timeout = setTimeout(() => { resolve(null); }, 120000);
    try {
      const python = spawn("python3", ["-c", `
import sys, base64, json
sys.path.insert(0, '.')
try:
  from paddleocr import PaddleOCR
  from PIL import Image
  import io
  ocr = PaddleOCR(use_angle_cls=True, lang='ch')
  img_data = base64.b64decode(sys.argv[1])
  img = Image.open(io.BytesIO(img_data))
  result = ocr.ocr(img, cls=True)
  text = '\\n'.join([line[0][1] for line in result if line])
  print(text)
except Exception as e:
  print('', file=sys.stderr)
  sys.exit(1)
`, b64], { timeout: 120000, stdio: ["pipe", "pipe", "pipe"] });
      
      let output = "";
      let error = "";
      python.stdout.on("data", (data) => { output += data.toString(); });
      python.stderr.on("data", (data) => { error += data.toString(); });
      python.on("close", (code) => {
        clearTimeout(timeout);
        resolve(code === 0 && output.trim() ? output.trim() : null);
      });
      python.on("error", () => {
        clearTimeout(timeout);
        resolve(null);
      });
    } catch (e) {
      clearTimeout(timeout);
      resolve(null);
    }
  });
}

async function ocrImageOllama(b64) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 180000);
  try {
    const r = await fetch(OLLAMA_URL + "/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: OLLAMA_VISION_MODEL,
        stream: false,
        options: { temperature: 0 },
        messages: [{
          role: "user",
          content: "Transcris fidelement et integralement le texte present dans cette image (un courrier administratif francais). Ne traduis pas, n'ajoute aucun commentaire, ne resume pas. Rends uniquement le texte brut tel qu'il apparait.",
          images: [b64]
        }]
      }),
      signal: controller.signal
    });
    if (!r.ok) return null;
    const data = await r.json();
    const content = data && data.message && data.message.content;
    return content ? String(content).trim() : null;
  } catch (e) {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// --- Nettoyage OCR : corrige les fautes de reconnaissance sans toucher aux chiffres/dates ---
async function ocrCleanup(raw) {
  if (LLM_PROVIDER === "openai" || !USE_OLLAMA) return raw;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 120000);
  try {
    const r = await fetch(OLLAMA_URL + "/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: OLLAMA_MODEL,
        stream: false,
        options: { temperature: 0 },
        messages: [
          { role: "system", content: "Tu corriges les fautes de reconnaissance optique (OCR) d'un courrier administratif francais : orthographe, mots manifestement mal lus, ponctuation. NE MODIFIE JAMAIS les chiffres, montants, dates, references et URLs. Ne resume pas, n'ajoute rien, ne traduis pas. Rends uniquement le texte corrige." },
          { role: "user", content: String(raw).slice(0, 8000) }
        ]
      }),
      signal: controller.signal
    });
    if (!r.ok) return raw;
    const data = await r.json();
    const c = data && data.message && data.message.content;
    return c ? String(c).trim() : raw;
  } catch (e) {
    return raw;
  } finally {
    clearTimeout(timer);
  }
}

const PUBLIC = path.join(__dirname, "public");
const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".ico": "image/x-icon"
};

function readBody(req) {
  return new Promise(resolve => {
    let b = "";
    req.on("data", c => (b += c));
    req.on("end", () => resolve(b));
  });
}
function json(res, code, obj) {
  res.writeHead(code, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(obj));
}
function sendFile(res, p) {
  const ext = path.extname(p);
  res.writeHead(200, { "Content-Type": MIME[ext] || "application/octet-stream" });
  fs.createReadStream(p).pipe(res);
}

const server = http.createServer(async (req, res) => {
  try {
    const url = req.url.split("?")[0];

    if (req.method === "GET" && (url === "/" || url === "/index.html")) {
      return sendFile(res, path.join(PUBLIC, "index.html"));
    }
    if (req.method === "GET" && url === "/api/config") {
      return json(res, 200, { ocrEnabled: OCR_ENABLED, llmProvider: LLM_PROVIDER, engine: ENGINE });
    }
    if (req.method === "GET" && url === "/api/samples") {
      return json(res, 200, samples.map(s => ({ id: s.id, label: s.label })));
    }
    if (req.method === "GET" && url.startsWith("/api/sample/")) {
      const id = decodeURIComponent(url.split("/").pop());
      const s = samples.find(x => x.id === id);
      return s ? json(res, 200, { text: s.text }) : json(res, 404, { error: "not found" });
    }
    if (req.method === "POST" && url === "/api/ocr") {
      const body = await readBody(req);
      let data = {};
      try { data = JSON.parse(body || "{}"); } catch (e) {}
      let img = (data.image || "").toString();
      const marker = img.indexOf("base64,");
      if (marker >= 0) img = img.slice(marker + 7);
      if (!img) return json(res, 400, { error: "Aucune image fournie" });
      const raw = await ocrImage(img);
      if (!raw) return json(res, 502, { error: "OCR indisponible. Configurez Google Vision API ou Ollama pour activer la reconnaissance de photos." });
      const text = OCR_CLEANUP ? await ocrCleanup(raw) : raw;
      return json(res, 200, { text, raw });
    }
    if (req.method === "POST" && url === "/api/analyze") {
      const body = await readBody(req);
      let data = {};
      try { data = JSON.parse(body || "{}"); } catch (e) {}
      const text = (data.text || "").toString();
      if (!text.trim()) return json(res, 400, { error: "Texte vide" });
      const heur = analyze(text, {});
      const llm = await llmAnalyze(text);
      const result = llm ? mergeResults(heur, llm) : heur;
      // Encart partenaire contextuel — jamais sur une arnaque.
      if (!(result.scam && result.scam.isScam)) result.ad = pickAd(result.type);
      return json(res, 200, result);
    }
    if (req.method === "POST" && url === "/api/save") {
      const body = await readBody(req);
      let data = {};
      try { data = JSON.parse(body || "{}"); } catch (e) {}
      const result = data.result || null;
      if (!result) return json(res, 400, { error: "Rien a enregistrer" });
      const list = loadHistory();
      const rec = { id: uid(), savedAt: new Date().toISOString(), type: result.type || "Courrier", text: String(data.text || "").slice(0, 20000), result: result };
      list.unshift(rec);
      saveHistory(list);
      return json(res, 200, { id: rec.id });
    }
    if (req.method === "GET" && url === "/api/history") {
      const list = loadHistory().map(r => ({ id: r.id, savedAt: r.savedAt, type: r.type, urgency: r.result && r.result.urgency, summary: r.result && r.result.summary, deadlines: (r.result && r.result.deadlines) || [] }));
      return json(res, 200, list);
    }
    if (req.method === "GET" && url === "/api/reminders") {
      const today = new Date(); today.setHours(0, 0, 0, 0);
      const items = [];
      for (const r of loadHistory()) {
        for (const d of ((r.result && r.result.deadlines) || [])) {
          const dt = parseFrDate(d.date);
          if (dt && dt >= today) items.push({ id: r.id, type: r.type, date: d.date, label: d.label, _t: dt.getTime() });
        }
      }
      items.sort((a, b) => a._t - b._t);
      return json(res, 200, items.map(x => ({ id: x.id, type: x.type, date: x.date, label: x.label })));
    }
    if (req.method === "GET" && url === "/api/calendar.ics") {
      const today = new Date(); today.setHours(0, 0, 0, 0);
      const stamp = new Date().toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
      const evts = [];
      for (const r of loadHistory()) {
        for (const d of ((r.result && r.result.deadlines) || [])) {
          const dt = parseFrDate(d.date);
          if (!dt || dt < today) continue;
          const p = d.date.split("/");
          evts.push(["BEGIN:VEVENT", "UID:" + uid() + "@courrier-admin", "DTSTAMP:" + stamp, "DTSTART;VALUE=DATE:" + p[2] + p[1] + p[0], "SUMMARY:Echeance - " + (d.label || "") + " (" + r.type + ")", "BEGIN:VALARM", "TRIGGER:-P2D", "ACTION:DISPLAY", "DESCRIPTION:Rappel echeance", "END:VALARM", "END:VEVENT"].join("\r\n"));
        }
      }
      const ics = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Mon Courrier Admin//FR"].concat(evts).concat(["END:VCALENDAR"]).join("\r\n");
      res.writeHead(200, { "Content-Type": "text/calendar; charset=utf-8", "Content-Disposition": "attachment; filename=echeances.ics" });
      return res.end(ics);
    }
    if (req.method === "DELETE" && url.startsWith("/api/item/")) {
      const id = decodeURIComponent(url.split("/").pop());
      saveHistory(loadHistory().filter(r => r.id !== id));
      return json(res, 200, { ok: true });
    }
    if (req.method === "GET" && url.startsWith("/api/go/")) {
      const id = decodeURIComponent(url.split("/").pop());
      const ad = getAdById(id);
      if (!ad) return json(res, 404, { error: "offre inconnue" });
      try {
        fs.mkdirSync(DATA_DIR, { recursive: true });
        const f = path.join(DATA_DIR, "clicks.json");
        let clicks = {}; try { clicks = JSON.parse(fs.readFileSync(f, "utf8")); } catch (e) {}
        clicks[id] = (clicks[id] || 0) + 1;
        fs.writeFileSync(f, JSON.stringify(clicks, null, 2));
      } catch (e) {}
      res.writeHead(302, { "Location": ad.url });
      return res.end();
    }
    if (req.method === "GET") {
      const p = path.join(PUBLIC, url.replace(/^\//, ""));
      if (p.startsWith(PUBLIC) && fs.existsSync(p) && fs.statSync(p).isFile()) return sendFile(res, p);
    }
    json(res, 404, { error: "not found" });
  } catch (e) {
    json(res, 500, { error: String(e) });
  }
});

const PORT = process.env.PORT || 5173;
server.listen(PORT, () => console.log("Mon Courrier Admin (prototype) -> http://localhost:" + PORT));
