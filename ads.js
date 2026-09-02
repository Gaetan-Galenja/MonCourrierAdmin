// ads.js — Regie publicitaire "maison", sans script tiers ni pistage.
// Le serveur choisit une offre selon le TYPE de courrier detecte localement.
// Aucune donnee de l'utilisateur n'est envoyee a un tiers : seul un lien
// d'affiliation est propose, et le clic est comptabilise localement.
//
// >>> Remplace les URLs "https://exemple..." par tes vrais liens d'affiliation. <<<

const OFFERS = [
  {
    id: "energie",
    match: ["energie", "énergie", "edf", "engie", "electric", "électric", "gaz", "totalenergies"],
    tag: "Partenaire",
    title: "Payez-vous votre energie trop cher ?",
    text: "Comparez les offres d'electricite et de gaz et changez de fournisseur en quelques minutes.",
    cta: "Comparer les offres",
    url: "https://exemple-affiliation.fr/energie?ref=courrieradmin"
  },
  {
    id: "mutuelle",
    match: ["ameli", "cpam", "assurance maladie", "sante", "santé", "mutuelle", "remboursement"],
    tag: "Partenaire",
    title: "Vos remboursements sante sont-ils optimises ?",
    text: "Comparez les mutuelles sante adaptees a votre situation et a votre budget.",
    cta: "Comparer les mutuelles",
    url: "https://exemple-affiliation.fr/mutuelle?ref=courrieradmin"
  },
  {
    id: "protection-juridique",
    match: ["huissier", "commissaire", "justice", "tribunal", "greffe", "litige"],
    tag: "Partenaire",
    title: "Besoin d'un accompagnement juridique ?",
    text: "Une protection juridique vous aide a faire valoir vos droits face aux litiges.",
    cta: "Decouvrir la protection juridique",
    url: "https://exemple-affiliation.fr/protection-juridique?ref=courrieradmin"
  },
  {
    id: "compta-indep",
    match: ["urssaf", "cotisation", "independant", "indépendant", "auto-entrepreneur"],
    tag: "Partenaire",
    title: "Independant ? Simplifiez votre comptabilite",
    text: "Un outil de comptabilite en ligne gere vos cotisations et declarations sans stress.",
    cta: "Essayer gratuitement",
    url: "https://exemple-affiliation.fr/comptabilite?ref=courrieradmin"
  },
  {
    id: "banque",
    match: ["banque", "bancaire", "decouvert", "découvert", "agios", "compte"],
    tag: "Partenaire",
    title: "Frais bancaires trop eleves ?",
    text: "Comparez les banques (y compris en ligne) et reduisez vos frais de tenue de compte.",
    cta: "Comparer les banques",
    url: "https://exemple-affiliation.fr/banque?ref=courrieradmin"
  },
  {
    id: "impots",
    match: ["impot", "impôt", "dgfip", "fisc", "finances publiques", "tresor", "trésor"],
    tag: "Partenaire",
    title: "Une question sur vos impots ?",
    text: "Faites relire votre situation par un conseiller fiscal et evitez les erreurs couteuses.",
    cta: "Parler a un conseiller",
    url: "https://exemple-affiliation.fr/conseil-fiscal?ref=courrieradmin"
  },
  {
    id: "assurance",
    match: ["assurance", "assureur", "sinistre", "contrat"],
    tag: "Partenaire",
    title: "Vos contrats d'assurance sont-ils au bon prix ?",
    text: "Comparez auto, habitation et emprunteur pour reduire vos cotisations.",
    cta: "Comparer les assurances",
    url: "https://exemple-affiliation.fr/assurance?ref=courrieradmin"
  }
];

// Offre par defaut (courrier non identifie, CAF, etc.)
const DEFAULT_OFFER = {
  id: "coffre",
  match: [],
  tag: "Partenaire",
  title: "Gardez vos documents importants en securite",
  text: "Un coffre-fort numerique conserve vos courriers et justificatifs, accessibles a tout moment.",
  cta: "Decouvrir le coffre-fort",
  url: "https://exemple-affiliation.fr/coffre-fort?ref=courrieradmin"
};

const DISCLOSURE = "Annonce d'un partenaire. Selectionnee selon le type de courrier, sans partage de vos donnees.";

function pickAd(type) {
  const t = String(type || "").toLowerCase();
  const o = OFFERS.find(x => x.match.some(k => t.indexOf(k) >= 0)) || DEFAULT_OFFER;
  // On n'expose pas l'URL au client : le clic passe par /api/go/:id
  return { id: o.id, tag: o.tag, title: o.title, text: o.text, cta: o.cta, disclosure: DISCLOSURE };
}

function getAdById(id) {
  return OFFERS.find(x => x.id === id) || (DEFAULT_OFFER.id === id ? DEFAULT_OFFER : null);
}

module.exports = { pickAd, getAdById, DISCLOSURE };
