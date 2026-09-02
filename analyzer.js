// analyzer.js — Moteur d'analyse heuristique de courrier administratif francais.
// Concu pour etre complete/remplace par un appel LLM (voir server.js -> llmAnalyze).
// Aucune dependance externe.

const MONTHS = {
  "janvier": 1, "fevrier": 2, "février": 2, "mars": 3, "avril": 4, "mai": 5,
  "juin": 6, "juillet": 7, "aout": 8, "août": 8, "septembre": 9,
  "octobre": 10, "novembre": 11, "decembre": 12, "décembre": 12
};

function pad(n) { return String(n).padStart(2, "0"); }
function fmt(d) { return pad(d.getDate()) + "/" + pad(d.getMonth() + 1) + "/" + d.getFullYear(); }
function addDays(base, n) { const d = new Date(base); d.setDate(d.getDate() + n); return d; }

// --- Detection du type d'expediteur ---
const TYPES = [
  { type: "Huissier / Commissaire de justice", icon: "\u2696\uFE0F", keys: ["huissier", "commissaire de justice", "commandement de payer", "titre executoire", "titre exécutoire", "injonction de payer", "saisie"] },
  { type: "Impots (DGFiP)", icon: "\uD83C\uDFDB\uFE0F", keys: ["finances publiques", "dgfip", "impot", "impôt", "avis d'imposition", "taxe fonciere", "taxe foncière", "taxe d'habitation", "prelevement a la source", "prélèvement à la source", "tresor public", "trésor public"] },
  { type: "URSSAF", icon: "\uD83D\uDCCA", keys: ["urssaf", "cotisations sociales", "cotisations dues"] },
  { type: "CAF", icon: "\uD83D\uDC6A", keys: ["caf", "allocations familiales", "caisse d'allocations", "rsa", "apl", "prime d'activite", "prime d'activité"] },
  { type: "Assurance Maladie (Ameli / CPAM)", icon: "\uD83E\uDE7A", keys: ["assurance maladie", "cpam", "ameli", "carte vitale", "indemnites journalieres", "feuille de soins"] },
  { type: "Energie (EDF / Engie...)", icon: "\u26A1", keys: ["edf", "engie", "totalenergies", "kwh", "facture d'electricite", "facture d'électricité", "facture de gaz", "echeancier", "échéancier"] },
  { type: "Banque", icon: "\uD83C\uDFE6", keys: ["releve de compte", "relevé de compte", "decouvert", "découvert", "agios", "prelevement rejete", "prélèvement rejeté"] },
  { type: "Assurance", icon: "\uD83D\uDEE1\uFE0F", keys: ["sinistre", "contrat d'assurance", "franchise", "indemnisation", "police d'assurance"] },
  { type: "Justice / Tribunal", icon: "\u2696\uFE0F", keys: ["tribunal", "greffe", "convocation", "audience"] }
];

function detectType(t) {
  // Score chaque type par nombre de mots-cles trouves ; le plus eleve gagne.
  // En cas d'egalite, l'ordre du tableau TYPES fait office de priorite.
  let best = null, bestScore = 0;
  for (const c of TYPES) {
    let s = 0;
    for (const k of c.keys) { if (t.includes(k)) s++; }
    if (s > bestScore) { bestScore = s; best = c; }
  }
  return bestScore > 0 ? best : { type: "Courrier non identifie", icon: "\u2709\uFE0F", keys: [] };
}

// --- Detection d'arnaque (hameconnage) ---
const OFFICIAL_DOMAINS = ["impots.gouv.fr", "service-public.fr", "ameli.fr", "urssaf.fr", "caf.fr", "gouv.fr", "laposte.fr", "sncf.fr", "orange.fr", "sfr.fr", "bouyguestelecom.fr"];

function detectScam(raw) {
  const reasons = [];
  let score = 0;
  const urls = raw.match(/https?:\/\/[^\s)]+/gi) || [];
  const suspiciousTld = /\.(xyz|top|info|click|ru|cn|tk|gq|ml|buzz|online|site|link|cf|ga|lol|download|review|store|stream|download|world|space)\b/i;
  
  // Detect suspicious domain mimicking
  const domainMimics = [
    [/impots?[\-\.]gouv[\-\.]fr/i, 40, "Faux domaine Impots (mimicry)"],
    [/ameli?[\-\.]fr/i, 35, "Faux domaine Ameli (mimicry)"],
    [/urssaf?[\-\.]fr/i, 35, "Faux domaine URSSAF (mimicry)"],
    [/caf?[\-\.]fr/i, 35, "Faux domaine CAF (mimicry)"],
    [/sncf?[\-\.]fr/i, 30, "Faux domaine SNCF (mimicry)"]
  ];
  
  for (const u of urls) {
    const isOfficial = OFFICIAL_DOMAINS.some(d => u.toLowerCase().includes(d));
    if (!isOfficial) { 
      score += 20; 
      reasons.push("Lien vers un site non officiel : " + u); 
    }
    if (suspiciousTld.test(u)) { 
      score += 20; 
      reasons.push("Nom de domaine douteux (.xyz, .top, .click...)"); 
    }
    for (const [pattern, pts, label] of domainMimics) {
      if (pattern.test(u)) { score += pts; reasons.push(label); }
    }
  }
  
  const patterns = [
    // Demandes bancaires (très suspect)
    [/(coordonnees|coordonnées|informations|donnees|données)\s+bancaires/i, 30, "Demande de coordonnees bancaires"],
    [/(carte\s+bancaire|numero\s+de\s+carte|numéro\s+de\s+carte|cryptogramme|cvv|code\s+securite|code\s+sécurité)/i, 35, "Demande de donnees de carte bancaire"],
    [/(iban|bic|compte\s+courant)/i, 25, "Demande d'identifiants bancaires"],
    
    // Liens suspects
    [/cliquez\s+(ici|sur\s+le\s+lien|ce\s+lien)/i, 15, "Incitation a cliquer sur un lien"],
    [/\.com\s+$|\.cc\s+$|\.ru\s+$|\.cn\s+$/i, 25, "Lien externe suspect"],
    
    // Themes arnaques courantes FR
    [/colis\s+(non\s+livre|non\s+livré|rejet|bloque|bloqué)/i, 25, "Faux avis de colis non livre"],
    [/(cpf|compte\s+personnel\s+de\s+formation|formation\s+gratuite)/i, 20, "Theme CPF (arnaque courante)"],
    [/(prime|bonus|remboursement)\s+(gouvernement|etat|état)/i, 20, "Fausse aide gouvernementale"],
    
    // Urgence/menaces
    [/(suspendu|suspension|bloque|bloqué|activite\s+suspecte|activité\s+suspecte|restriction|desactiv)/i, 15, "Ton alarmiste / menace de suspension"],
    [/(sous|dans|delai\s+de)\s+(24|48|6)\s*h/i, 18, "Urgence artificielle (24/48h)"],
    [/(immediate|immédiate|urgent|asap|critical)/i, 12, "Ton d'urgence suspect"],
    
    // Mise a jour
    [/mettre\s+a\s+jour\s+vos\s+(informations|coordonnees|coordonnées|profile|profil)/i, 18, "Demande de mise a jour de donnees"],
    
    // Remboursement/paiement
    [/remboursement\s+de\s+\d+\s*(€|euros?|eur)/i, 15, "Promesse de remboursement"],
    [/(frais|taxe|douane)\s+(a\s+payer|à\s+payer|impayee|impayée)/i, 20, "Faux frais a payer"],
    
    // Verifications identité
    [/(verifier|vérifier|confirmer)\s+vos\s+(identifiant|mot\s+de\s+passe|password|login)/i, 25, "Demande de verification d'identite"],
    [/(nous\s+confirmer|valider|reconfirmer)\s+vos\s+(donnees|données)/i, 22, "Demande de confirmation de donnees"],
    
    // Absence d'adresse email officielle
    [/via\s+sms|par\s+sms|appel\s+a\s+un\s+numero/i, 20, "Communication par SMS (pas officiel)"]
  ];
  
  for (const [re, pts, label] of patterns) {
    if (re.test(raw)) { score += pts; reasons.push(label); }
  }
  
  score = Math.min(100, score);
  return { isScam: score >= 45, score, reasons };
}

// --- Extraction des echeances ---
function labelFor(raw, idx) {
  const ctx = raw.slice(Math.max(0, idx - 70), idx + 25).toLowerCase();
  if (/(payer|paiement|reglement|règlement|acquitter|regler|régler|montant|solde)/.test(ctx)) return "Date limite de paiement";
  if (/(repondre|répondre|reponse|réponse|contester|recours|reclamation|réclamation|justificatif|pieces|pièces|documents|transmettre)/.test(ctx)) return "Date limite de reponse / envoi de documents";
  if (/(rendez-vous|convocation|audience|presenter|présenter)/.test(ctx)) return "Date de rendez-vous / convocation";
  return "Echeance a retenir";
}

function extractDeadlines(raw, today) {
  const found = [];
  let m;
  const reNum = /(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2,4})/g;
  while ((m = reNum.exec(raw))) {
    let d = +m[1], mo = +m[2], y = +m[3];
    if (y < 100) y += 2000;
    const dt = new Date(y, mo - 1, d);
    if (!isNaN(dt) && mo >= 1 && mo <= 12 && d >= 1 && d <= 31) found.push({ date: fmt(dt), _d: dt, label: labelFor(raw, m.index) });
  }
  const reTxt = /(\d{1,2})(?:er)?\s+(janvier|fevrier|février|mars|avril|mai|juin|juillet|aout|août|septembre|octobre|novembre|decembre|décembre)\s+(\d{4})/gi;
  while ((m = reTxt.exec(raw))) {
    const d = +m[1], mo = MONTHS[m[2].toLowerCase()], y = +m[3];
    const dt = new Date(y, mo - 1, d);
    if (!isNaN(dt)) found.push({ date: fmt(dt), _d: dt, label: labelFor(raw, m.index) });
  }
  const reRel = /(?:sous|dans\s+un\s+delai\s+de|dans\s+un\s+délai\s+de|dans)\s+(\d{1,3})\s+jours/gi;
  while ((m = reRel.exec(raw))) {
    const dt = addDays(today, +m[1]);
    found.push({ date: fmt(dt), _d: dt, label: labelFor(raw, m.index) + " (delai de " + m[1] + " jours)" });
  }
  const seen = new Set();
  const out = [];
  for (const f of found) {
    const key = f.date + "|" + f.label;
    if (!seen.has(key)) { seen.add(key); out.push(f); }
  }
  out.sort((a, b) => a._d - b._d);
  return out;
}

function detectAmount(raw) {
  const m = raw.match(/(\d{1,3}(?:[ .]\d{3})*(?:[.,]\d{2})?)\s*(?:€|euros?)/i);
  return m ? m[0].replace(/\s+/g, " ").trim() : null;
}

// --- Textes generes ---
function buildSummary(type, amount, deadlines, scam) {
  if (scam.isScam) {
    return "Attention : ce message presente plusieurs signes d'arnaque (hameconnage). Une administration francaise ne vous demandera jamais vos donnees bancaires par lien ou SMS. Ne cliquez sur aucun lien et ne communiquez aucune information personnelle.";
  }
  const dl = deadlines[0] ? " Une echeance importante est fixee au " + deadlines[0].date + " (" + deadlines[0].label.toLowerCase() + ")." : "";
  const am = amount ? " Un montant de " + amount + " est mentionne." : "";
  const map = {
    "Impots (DGFiP)": "Courrier des impots (DGFiP) concernant votre situation fiscale (avis, prelevement ou relance).",
    "CAF": "Courrier de la CAF concernant vos allocations ou une demande de pieces justificatives.",
    "URSSAF": "Courrier de l'URSSAF au sujet de vos cotisations sociales.",
    "Assurance Maladie (Ameli / CPAM)": "Courrier de l'Assurance Maladie (CPAM) concernant vos remboursements ou votre dossier.",
    "Huissier / Commissaire de justice": "Courrier d'un commissaire de justice (huissier). A traiter rapidement : il peut s'agir d'une mise en demeure ou d'un commandement de payer.",
    "Energie (EDF / Engie...)": "Courrier de votre fournisseur d'energie (facture, echeancier ou relance).",
    "Banque": "Courrier de votre banque (releve, decouvert ou incident de paiement).",
    "Assurance": "Courrier de votre assureur (contrat, sinistre ou indemnisation).",
    "Justice / Tribunal": "Courrier de justice (convocation ou procedure). A ne pas negliger.",
    "Courrier non identifie": "Courrier administratif. Voici l'essentiel a retenir et les actions a prevoir."
  };
  return (map[type] || map["Courrier non identifie"]) + am + dl;
}

function buildActions(type, deadlines, scam) {
  if (scam.isScam) {
    return [
      "Ne cliquez sur aucun lien et ne communiquez aucune donnee.",
      "Verifiez en passant par le site officiel (tapez l'adresse vous-meme) ou le numero figurant sur vos courriers officiels.",
      "Signalez : SMS au 33700, ou sur signal-arnaques.com / cybermalveillance.gouv.fr.",
      "Supprimez le message."
    ];
  }
  const base = [];
  if (deadlines[0]) base.push("Noter l'echeance du " + deadlines[0].date + " dans votre agenda.");
  const map = {
    "Impots (DGFiP)": ["Verifier le montant sur impots.gouv.fr (espace particulier).", "Payer en ligne ou demander un delai de paiement si besoin.", "Contester via la messagerie securisee si le montant est errone."],
    "CAF": ["Vous connecter sur caf.fr pour consulter la demande.", "Rassembler les pieces justificatives demandees.", "Repondre avant la date limite pour eviter une suspension des droits."],
    "URSSAF": ["Verifier le decompte sur urssaf.fr.", "Regler ou demander un echeancier.", "Contester en cas d'erreur de calcul."],
    "Assurance Maladie (Ameli / CPAM)": ["Consulter votre compte ameli.", "Envoyer les documents manquants le cas echeant.", "Contacter le 3646 en cas de doute."],
    "Huissier / Commissaire de justice": ["Ne pas ignorer : les delais sont courts.", "Verifier la dette et son bien-fonde.", "Contacter l'etude pour un echeancier, ou un point d'acces au droit / avocat."],
    "Energie (EDF / Engie...)": ["Verifier la facture et l'index.", "Payer ou demander un echeancier.", "Signaler une erreur d'estimation si besoin."],
    "Banque": ["Verifier les operations concernees.", "Regulariser le solde ou contacter votre conseiller.", "Contester tout prelevement non reconnu."],
    "Assurance": ["Relire les garanties concernees.", "Envoyer les pieces demandees.", "Repondre dans les delais pour preserver vos droits."]
  };
  return base.concat(map[type] || ["Lire attentivement le courrier.", "Repondre ou agir avant l'echeance indiquee.", "Conserver le document."]);
}

function buildReply(type, scam) {
  if (scam.isScam) return "(Aucune reponse a envoyer : il s'agit tres probablement d'une tentative d'arnaque. Ne repondez pas, signalez-le.)";
  const generic = "Madame, Monsieur,\n\nJe fais suite a votre courrier reference ci-dessus. [Precisez votre demande : accuse de reception / envoi de justificatifs / demande de delai / contestation.]\n\nJe reste a votre disposition pour tout complement d'information et vous prie d'agreer, Madame, Monsieur, mes salutations distinguees.\n\n[Nom, prenom]\n[Adresse]\n[References du dossier]";
  const map = {
    "Impots (DGFiP)": "Madame, Monsieur,\n\nJe fais suite a votre avis concernant ma situation fiscale (reference : [a completer]). [Je souhaite regler la somme / demander un delai de paiement / contester le montant pour le motif suivant : ...].\n\nJe vous remercie de bien vouloir m'indiquer la marche a suivre et vous prie d'agreer mes salutations distinguees.\n\n[Nom, prenom - numero fiscal]",
    "CAF": "Madame, Monsieur,\n\nEn reponse a votre demande, veuillez trouver ci-joint les pieces justificatives sollicitees (reference dossier : [a completer]). Je reste disponible pour tout complement.\n\nVeuillez agreer, Madame, Monsieur, mes salutations distinguees.\n\n[Nom, prenom - numero allocataire]",
    "Huissier / Commissaire de justice": "Madame, Monsieur,\n\nJe fais suite a votre courrier (dossier : [a completer]). Je souhaite [contester la creance / mettre en place un echeancier de paiement adapte a ma situation]. Je vous remercie de me recontacter afin d'en convenir.\n\nVeuillez agreer mes salutations distinguees.\n\n[Nom, prenom - coordonnees]"
  };
  return map[type] || generic;
}

function analyze(text, opts) {
  opts = opts || {};
  const today = opts.today ? new Date(opts.today) : new Date();
  const raw = (text || "").trim();
  const t = raw.toLowerCase();
  const typeInfo = detectType(t);
  const scam = detectScam(raw);
  const deadlinesInt = extractDeadlines(raw, today);
  const amount = detectAmount(raw);
  const summary = buildSummary(typeInfo.type, amount, deadlinesInt, scam);
  const actions = buildActions(typeInfo.type, deadlinesInt, scam);
  const draftReply = buildReply(typeInfo.type, scam);

  let urgency = "normale";
  if (scam.isScam) {
    urgency = "arnaque";
  } else if (deadlinesInt[0]) {
    const days = Math.round((deadlinesInt[0]._d - today) / 86400000);
    if (days <= 7) urgency = "urgente";
    else if (days <= 21) urgency = "a surveiller";
  }
  if (typeInfo.type.indexOf("Huissier") === 0 && urgency === "normale") urgency = "urgente";

  return {
    type: typeInfo.type,
    icon: typeInfo.icon,
    urgency: urgency,
    amount: amount,
    summary: summary,
    deadlines: deadlinesInt.map(d => ({ date: d.date, label: d.label })),
    actions: actions,
    draftReply: draftReply,
    scam: scam,
    engine: "heuristique (demo)"
  };
}

module.exports = { analyze };
