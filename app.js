'use strict';

const SEUIL = 20;            // en dessous, un taux est affiché comme échantillon insuffisant
const VERDICTS = [
  { id: 'vrai', nom: 'Vrai', c: '--v-vrai' },
  { id: 'trompeur', nom: 'Trompeur', c: '--v-trompeur' },
  { id: 'faux', nom: 'Faux', c: '--v-faux' },
  { id: 'non_etaye', nom: 'Non étayé', c: '--v-non-etaye' },
  { id: 'inverifiable', nom: 'Invérifiable', c: '--v-inverifiable' },
];
const TYPES = [
  { id: 'fait', nom: 'Faits', c: '--t-fait' },
  { id: 'opinion', nom: 'Opinions', c: '--t-opinion' },
  { id: 'autre', nom: 'Questions, procédure', c: '--t-autre' },
];
const PERIODES = [
  { id: 'tout', nom: 'Tout' },
  { id: '2022', nom: 'Depuis 2022' },
  { id: '12m', nom: '12 mois' },
  { id: 'annee', nom: new Date().getFullYear() + '' },
];

const S = {
  d: null, pers: {}, partis: {}, periode: lireLocal('periode', 'tout'), affichage: lireLocal('affichage', 'cartes'),
  source: lireLocal('source', 'tout'), onglet: lireLocal('onglet', 'reseaux'),
  tri: { col: null, sens: -1 },
};

// ---------- Outils ----------
function lireLocal(k, def) { try { return localStorage.getItem('tamis.' + k) || def; } catch { return def; } }
function ecrireLocal(k, v) { try { localStorage.setItem('tamis.' + k, v); } catch { /* sans stockage */ } }
const $ = (s, r = document) => r.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const norm = s => String(s || '').normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
const pct = (a, b) => b ? Math.round(100 * a / b) : 0;
const MOIS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
function fdate(d) {
  if (!d) return '';
  const [y, m, j] = d.split('-');
  return j ? `${+j} ${MOIS[+m - 1]} ${y}` : m ? `${MOIS[+m - 1]} ${y}` : y;
}
function age(d) {
  if (!d) return null;
  const n = new Date(d), a = new Date();
  let x = a.getFullYear() - n.getFullYear();
  if (a.getMonth() < n.getMonth() || (a.getMonth() === n.getMonth() && a.getDate() < n.getDate())) x--;
  return x;
}
function couleur(v) { return `var(${v})`; }

// Site public : les données sont des fichiers produits par exporter.py, rien ne s'écrit.
const STATIQUE = !!window.STATIQUE;
const CONTACT = window.CONTACT || '';
const FICHIERS_STATIQUES = [
  [/^\/api\/donnees$/, 'data/donnees.json'], [/^\/api\/fiche\/(.+)$/, 'data/fiches/$1.json'],
  [/^\/api\/registre$/, 'data/registre.json'], [/^\/api\/registre\/(.+)$/, 'data/affirmations/$1.json'],
  [/^\/api\/posts$/, 'data/posts.json'],
];

async function api(chemin, corps) {
  if (STATIQUE) {
    if (corps) throw new Error('Site en lecture seule');
    const f = FICHIERS_STATIQUES.find(([rx]) => rx.test(chemin));
    if (f) chemin = chemin.replace(f[0], f[1]);
  }
  const r = await fetch(chemin, corps ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corps) } : {});
  const j = await r.json();
  if (!r.ok) throw new Error(j.erreur || r.status);
  return j;
}

// ---------- Données ----------
async function charger() {
  S.d = await api('/api/donnees');
  S.pers = Object.fromEntries(S.d.personnes.map(p => [p.id, p]));
  S.partis = Object.fromEntries(S.d.partis.map(p => [p.id, p]));
  // Médias des intervenants (journalistes, éditorialistes) et groupes propriétaires : traités comme des partis.
  Object.assign(S.partis, S.d.redactions || {});
  S.groupesMedias = Object.fromEntries((S.d.groupes_medias || []).map(g => [g.id, g]));
  for (const g of S.d.groupes_medias || []) S.partis[g.id] = { ...g, sigle: g.nom };
  const navMedias = $('[data-nav="medias"]');
  if (navMedias) navMedias.hidden = !(S.d.groupes_medias || []).length;  // onglet masqué tant que personne n'est retenu
  const pastille = $('#nb-atelier');
  if (pastille) {
    const n = S.d.a_qualifier.length + S.d.registre_a_confirmer + S.d.registre_signalements;
    pastille.hidden = !n;
    pastille.textContent = n;
  }
  const maj = $('#publie');
  if (maj && S.d.publie) maj.textContent = 'Données du ' + fdate(S.d.publie.slice(0, 10));
}

function dansPeriode(date) {
  if (S.periode === 'tout') return true;
  if (!date) return false;
  if (S.periode === '2022') return date >= '2022-01-01';
  if (S.periode === 'annee') return date.slice(0, 4) === String(new Date().getFullYear());
  const lim = new Date(); lim.setFullYear(lim.getFullYear() - 1);
  return date >= lim.toISOString().slice(0, 10);
}
const verdicts = () => S.d.verdicts.filter(v => dansPeriode(v.date));
const SOURCES = [
  { id: 'tout', nom: 'Toutes sources' }, { id: 'seance', nom: 'Séance' }, { id: 'reseaux', nom: 'Réseaux' },
  { id: 'presse', nom: 'Presse' }, { id: 'saisis', nom: 'Saisis' },
];
const dansMois = m => dansPeriode(m + '-15');
const propos = () => ['tout', 'saisis'].includes(S.source) ? S.d.propos.filter(p => dansPeriode(p.date)) : [];
// Lignes de phrases analysées : [personne, mois, parti, faits, opinions, autres, interventions, source]
const lignesPhrases = () => S.d.phrases.filter(l => dansMois(l[1]) && (S.source === 'tout' || S.source === l[7]));

// Propos non fiables : faux, trompeurs ou non étayés.
const estMedia = id => S.pers[id]?.categorie === 'media';
const estCollectifMedia = id => /^[mg]-/.test(id || '');
// Ensemble des identifiants regroupés : un groupe propriétaire rassemble ses rédactions.
const membresDe = id => S.groupesMedias?.[id]?.medias || [id];
const nonFiables = c => c.faux + c.trompeur + (c.non_etaye || 0);

function compter(vs) {
  const c = { n: vs.length };
  VERDICTS.forEach(v => c[v.id] = 0);
  vs.forEach(v => c[v.verdict]++);
  return c;
}
// Phrases des propos saisis (ps) et des séances de l'Assemblée (ls : [personne, mois, parti, faits, opinions, autres, interventions]).
function compterPhrases(ps, ls = []) {
  const c = { n: 0, fait: 0, opinion: 0, autre: 0, propos: ps.length, sanctions: 0, src: {} };
  ps.forEach(p => {
    if (p.sanction) c.sanctions++;
    p.phrases.forEach(f => { c.n++; c[f.type]++; });
  });
  ls.forEach(([, , , fa, op, au, nb, so]) => {
    c.fait += fa; c.opinion += op; c.autre += au; c.n += fa + op + au;
    const x = c.src[so] = c.src[so] || { phrases: 0, nb: 0 };
    x.phrases += fa + op + au; x.nb += nb;
  });
  return c;
}

// ---------- Présence, médias, thèmes ----------
function heures(sec) {
  if (sec < 3600) return Math.max(1, Math.round(sec / 60)) + ' min';
  return Math.floor(sec / 3600) + ' h ' + String(Math.round(sec % 3600 / 60)).padStart(2, '0');
}
function mediasDe(ids) {
  const ch = {}; let total = 0;
  ids.forEach(id => Object.entries(S.d.medias[id] || {}).forEach(([m, t]) => {
    if (!dansMois(m)) return;
    Object.entries(t).forEach(([c, sec]) => { ch[c] = (ch[c] || 0) + sec; total += sec; });
  }));
  return { total, ch };
}
// Participation aux scrutins publics : [scrutins, en personne, délégation, solennels, solennels en personne]
function presenceDe(id) {
  const t = [0, 0, 0, 0, 0];
  Object.entries(S.d.presence[id] || {}).forEach(([m, v]) => { if (dansMois(m)) v.forEach((x, i) => t[i] += x); });
  return t[0] ? { scrutins: t[0], tx: t[1] / t[0], deleg: t[2] / t[0], solennels: t[3], sol: t[3] ? t[4] / t[3] : null } : null;
}
function mediane(xs) {
  const a = xs.filter(x => x != null).sort((x, y) => x - y);
  return a.length ? (a.length % 2 ? a[(a.length - 1) / 2] : (a[a.length / 2 - 1] + a[a.length / 2]) / 2) : null;
}
function presenceMediane() {
  const r = Object.keys(S.d.presence).map(presenceDe).filter(Boolean);
  return { tx: mediane(r.map(x => x.tx)), sol: mediane(r.map(x => x.sol)) };
}
function presseDe(ids) {
  let articles = 0, regional = 0, total = 0; const medias = {};
  ids.forEach(id => {
    const p = S.d.presse[id]; if (!p) return;
    Object.entries(p.mois).forEach(([m, n]) => { if (dansMois(m)) articles += n; });
    total += p.total; regional += p.regional;
    Object.entries(p.medias).forEach(([k, n]) => medias[k] = (medias[k] || 0) + n);
  });
  return { articles, regional, total, medias };
}
function postsDe(ids) {
  let n = 0;
  ids.forEach(id => Object.entries(S.d.reseaux[id]?.mois || {}).forEach(([m, x]) => { if (dansMois(m)) n += x; }));
  return n;
}
function themesDe(ids) {
  const t = {};
  ids.forEach(id => Object.entries(S.d.themes[id] || {}).forEach(([so, th]) => Object.entries(th).forEach(([k, n]) => {
    const x = t[k] = t[k] || { total: 0, seance: 0, reseaux: 0, presse: 0 };
    x.total += n; x[so] += n;
  })));
  return Object.entries(t).sort((a, b) => b[1].total - a[1].total);
}
const NOMS_RESEAUX = { x: 'X', bluesky: 'Bluesky', mastodon: 'Mastodon', youtube: 'YouTube', facebook: 'Facebook', instagram: 'Instagram', tiktok: 'TikTok', telegram: 'Telegram' };
function nbCourt(n) {
  if (n >= 1e6) return (n / 1e6).toLocaleString('fr-FR', { maximumFractionDigits: 1 }) + ' M';
  if (n >= 1e4) return Math.round(n / 1e3).toLocaleString('fr-FR') + ' k';
  return n.toLocaleString('fr-FR');
}
function abonnesDe(ids) {
  const par = {}, pers = []; let total = 0, plusAncien = null;
  ids.forEach(id => {
    let t = 0;
    Object.entries(S.d.abonnes[id] || {}).forEach(([r, x]) => {
      par[r] = (par[r] || 0) + x.n; t += x.n;
      if (!plusAncien || x.date < plusAncien) plusAncien = x.date;
    });
    total += t; if (t) pers.push([id, t]);
  });
  return { total, par, pers: pers.sort((a, b) => b[1] - a[1]), plusAncien };
}
function blocPortee(ids, seul) {
  const a = abonnesDe(ids);
  if (!a.total) return '<p class="muet">Aucun nombre d\'abonnés connu.</p>';
  const reseaux = Object.entries(a.par).sort((x, y) => y[1] - x[1]);
  const detail = seul ? S.d.abonnes[ids[0]] || {} : null;
  return `<div class="chiffres" style="margin:10px 0">
      <div class="chiffre"><b>${nbCourt(a.total)}</b><span>abonnés cumulés</span></div>
      ${seul ? '' : `<div class="chiffre"><b>${a.pers.length}</b><span>comptes mesurés</span></div>`}
    </div>
    ${barres(reseaux.map(([r, n]) => ({
      nom: NOMS_RESEAUX[r] || r, val: n,
      label: nbCourt(n) + (detail && detail[r].source === 'Wikidata' ? ' · ' + detail[r].date.slice(0, 4) : ''),
      tip: detail ? `<b>${NOMS_RESEAUX[r] || r}</b> : ${n.toLocaleString('fr-FR')}<br>${esc(detail[r].source)}, ${fdate(detail[r].date)}` : `<b>${NOMS_RESEAUX[r] || r}</b> : ${n.toLocaleString('fr-FR')} abonnés cumulés`,
    })), reseaux[0][1])}
    ${seul ? '' : `<h4>Comptes les plus suivis</h4>${barres(a.pers.slice(0, 5).map(([id, n]) => ({ nom: S.pers[id].nom, val: n, label: nbCourt(n) })), a.pers[0][1])}`}
    <p class="mention">${seul ? '' : 'Somme des abonnés des membres : une même personne peut suivre plusieurs comptes. '}Bluesky, Mastodon, Telegram : relevés du jour. X et YouTube : derniers chiffres connus de Wikidata${a.plusAncien ? ` (le plus ancien date de ${fdate(a.plusAncien.slice(0, 7))})` : ''}, YouTube à jour si une clé Google est enregistrée.</p>`;
}
// Répétitions confirmées : [personne, affirmation, date, source, maintenue malgré le démenti, parti]
function faussetesDe(filtre) {
  const lignes = S.d.faussetes.filter(l => dansPeriode(l[2]) && filtre(l));
  const parAff = {};
  lignes.forEach(l => {
    const x = parAff[l[1]] = parAff[l[1]] || { n: 0, apres: 0, personnes: new Set() };
    x.n++; if (l[4]) x.apres++; x.personnes.add(l[0]);
  });
  return { n: lignes.length, apres: lignes.filter(l => l[4]).length, affirmations: Object.entries(parAff).sort((a, b) => b[1].n - a[1].n) };
}
function blocFaussetes(fx, avecPersonnes) {
  if (!fx.n) return `<p class="muet">Aucune répétition confirmée d'une <a href="#/affirmations">affirmation mensongère</a> suivie.</p>`;
  return `<div class="chiffres" style="margin:10px 0">
      <div class="chiffre"><b>${fx.affirmations.length}</b><span>affirmation${fx.affirmations.length > 1 ? 's' : ''} mensongère${fx.affirmations.length > 1 ? 's' : ''}</span></div>
      <div class="chiffre"><b>${fx.n}</b><span>répétition${fx.n > 1 ? 's' : ''}</span></div>
      <div class="chiffre"><b>${fx.apres}</b><span>maintenues malgré le démenti</span></div>
    </div>
    ${fx.affirmations.slice(0, 8).map(([aid, x]) => `<div class="verdict">
      <div><span class="etiquette" style="background:var(--v-faux)">${x.n} fois</span></div>
      <div><a href="#/affirmation/${aid}" class="citation">${esc(S.d.registre_noms[aid] || aid)}</a>
        <div class="source">${x.apres ? `dont ${x.apres} maintenue${x.apres > 1 ? 's' : ''} malgré le démenti` : 'corrigée ou antérieure au démenti'}${avecPersonnes ? ` · ${x.personnes.size} personnalité${x.personnes.size > 1 ? 's' : ''}` : ''}</div></div><span></span>
    </div>`).join('')}`;
}

function aucunVerdict() {
  if (STATIQUE) return '<p class="muet">Aucun propos vérifié pour l\'instant.</p>';
  const n = S.d.a_qualifier.length;
  return `<p class="muet">Aucun propos vérifié pour l'instant.</p>
    <p class="mention">Les verdicts arrivent par la clé Google Fact Check (<a href="#/atelier/collectes">Atelier, collectes</a>)${n ? ` et par les <a href="#/atelier">${n} articles à qualifier</a>` : ''}.</p>`;
}

function barres(items, max) {
  return `<div class="barres">${items.map(it => `<div class="barre-ligne" data-tip="${esc(it.tip || '')}">
    <span class="lib">${esc(it.nom)}</span><span class="piste"><i style="width:${Math.max(2, 100 * it.val / max)}%"></i></span><span class="val">${esc(it.label)}</span></div>`).join('')}</div>`;
}
// Nuage des thèmes : taille selon la part des mentions, pourcentage et détail au survol.
function blocThemes(ids, n = 21) {
  const tous = themesDe(ids);
  if (!tous.length) return '<p class="muet">Pas encore de thème repéré.</p>';
  const tot = tous.reduce((s, [, x]) => s + x.total, 0);
  const th = tous.slice(0, n), max = th[0][1].total;
  // Les plus grands au centre : on place alternativement à gauche et à droite.
  const ordre = [];
  th.forEach((t, i) => (i % 2 ? ordre.push(t) : ordre.unshift(t)));
  return `<div class="nuage">${ordre.map(([k, x]) => {
    const rang = th.findIndex(t => t[0] === k);
    const taille = Math.round(14 + 28 * Math.sqrt(x.total / max));
    const nom = S.d.theme_noms[k] || k;
    const court = nom.split(',')[0];  // « Budget, impôts, dette » → « Budget » ; le nom complet au survol
    const tip = `<b>${esc(nom)}</b> · ${pct(x.total, tot)} % des mentions<br>Séance ${x.seance} · Réseaux ${x.reseaux} · Presse ${x.presse}`;
    return `<span class="mot${rang < 3 ? ' fort' : rang > 9 ? ' faible' : ''}" style="font-size:${taille}px" data-tip="${esc(tip)}">${esc(court)}</span>`;
  }).join('')}</div>
  <p class="mention">Taille selon la part des mentions (séance, réseaux, titres de presse), toutes périodes. Survoler un thème pour le détail.</p>`;
}
function blocMedias(ids) {
  const md = mediasDe(ids), pr = presseDe(ids);
  const chaines = Object.entries(md.ch).sort((a, b) => b[1] - a[1]).slice(0, 8);
  const journaux = Object.entries(pr.medias).sort((a, b) => b[1] - a[1]).slice(0, 8);
  return `
    <div class="chiffres" style="margin:10px 0">
      <div class="chiffre"><b>${md.total ? heures(md.total) : '–'}</b><span>télé et radio</span></div>
      <div class="chiffre"><b>${pr.articles}</b><span>articles de presse</span></div>
      <div class="chiffre"><b>${pr.total ? pct(pr.regional, pr.total) + ' %' : '–'}</b><span>en presse régionale</span></div>
    </div>
    ${chaines.length ? `<h4>Temps de parole par chaîne</h4>${barres(chaines.map(([c, sec]) => ({ nom: c, val: sec, label: heures(sec) })), chaines[0][1])}` : ''}
    ${journaux.length ? `<h4>Journaux qui en parlent le plus</h4>${barres(journaux.map(([c, n]) => ({ nom: c, val: n, label: n + ' art.' })), journaux[0][1])}` : ''}
    <p class="mention">Télé et radio : relevés de l'Arcom${S.d.medias_mois.length ? ` (jusqu'à ${fdate(S.d.medias_mois.at(-1))})` : ''}. Presse : Google Actualités, articles des 4 derniers mois, journaux depuis le début de la collecte.</p>`;
}
// Moyenne des parts de chaque personnalité : une figure très vérifiée ne pèse pas plus qu'une autre.
function moyenneParPersonne(vs) {
  const parP = {};
  vs.forEach(v => (parP[v.personne] = parP[v.personne] || []).push(v));
  const listes = Object.values(parP);
  const c = { n: listes.length };
  VERDICTS.forEach(v => c[v.id] = listes.length ? listes.reduce((s, l) => s + l.filter(x => x.verdict === v.id).length / l.length, 0) / listes.length : 0);
  return c;
}

// ---------- Graphiques ----------
function empile(c, cles, total, libelle) {
  const tot = total ?? cles.reduce((s, k) => s + c[k.id], 0);
  if (!tot) return '<div class="empile vide"></div>';
  return `<div class="empile">${cles.filter(k => c[k.id] > 0).map(k => {
    const part = c[k.id] / tot;
    const val = Number.isInteger(c[k.id]) ? `${c[k.id]} sur ${tot}` : `moyenne`;
    return `<div class="seg" style="flex:${part};background:${couleur(k.c)}" data-tip="${esc(`<b>${k.nom}</b> · ${Math.round(part * 100)} %<br>${val}${libelle ? ' ' + libelle : ''}`)}"></div>`;
  }).join('')}</div>`;
}
function legende(cles) {
  return `<div class="legende">${cles.map(k => `<span><i style="background:${couleur(k.c)}"></i>${k.nom}</span>`).join('')}</div>`;
}
function colonnesMois(vs) {
  const dates = vs.map(v => v.date).filter(Boolean).sort();
  if (!dates.length) return '<p class="muet petit">Aucun propos daté.</p>';
  const fin = new Date(); let d = new Date(dates[0].slice(0, 7) + '-01');
  const debutMin = new Date(fin.getFullYear() - 2, fin.getMonth(), 1);
  if (d < debutMin) d = debutMin;
  const mois = [];
  while (d <= fin) { mois.push(d.toISOString().slice(0, 7)); d = new Date(d.getFullYear(), d.getMonth() + 1, 1); }
  const parM = Object.fromEntries(mois.map(m => [m, compter(vs.filter(v => (v.date || '').startsWith(m)))]));
  const max = Math.max(1, ...mois.map(m => parM[m].n));
  const pas = Math.ceil(mois.length / 8);
  return `<div class="colonnes">${mois.map(m => {
    const c = parM[m];
    const tip = `<b>${fdate(m)}</b> · ${c.n} propos<br>` + VERDICTS.filter(v => c[v.id]).map(v => `${v.nom} : ${c[v.id]}`).join('<br>');
    return `<div class="col" data-tip="${esc(tip)}">${VERDICTS.filter(v => c[v.id]).map(v => `<div class="seg" style="height:${100 * c[v.id] / max}%;background:${couleur(v.c)}"></div>`).join('')}</div>`;
  }).join('')}</div><div class="axe-x">${mois.map((m, i) => `<span>${i % pas === 0 ? MOIS[+m.slice(5) - 1] + ' ' + m.slice(2, 4) : ''}</span>`).join('')}</div>`;
}

// ---------- Vues ----------
const VUES = {
  accueil: vueAccueil, posts: vuePosts, affirmations: vueAffirmationsPub, affirmation: vueAffirmationPub,
  personnalites: vuePersonnalites, p: vuePersonne, partis: vuePartis, parti: vueParti,
  medias: vueMedias, media: vueParti,
  methode: vueMethode, atelier: vueAtelier, mentions: vueMentions,
};
// Onglet de navigation allumé pour chaque vue.
const NAV = { accueil: 'accueil', posts: 'posts', affirmations: 'affirmations', affirmation: 'affirmations', personnalites: 'personnalites',
  p: 'personnalites', partis: 'partis', parti: 'partis', medias: 'medias', media: 'medias', methode: 'methode', atelier: 'atelier' };

function route() {
  if (S.aRecharger && !location.hash.startsWith('#/atelier/intervenants')) { S.aRecharger = false; recharger(); return; }
  const [chemin, requete] = location.hash.replace(/^#\/?/, '').split('?');
  const parts = chemin.split('/').map(decodeURIComponent);
  const vue = VUES[parts[0]] && !(STATIQUE && parts[0] === 'atelier') ? parts[0] : 'accueil';
  S.requete = new URLSearchParams(requete || '');
  const nav = vue === 'p' && S.d && estMedia(parts[1]) ? 'medias' : NAV[vue];
  document.querySelectorAll('[data-nav]').forEach(a => a.classList.toggle('actif', a.dataset.nav === nav));
  document.body.dataset.onglet = nav;
  const v = $('#vue');
  if (!S.d) { v.innerHTML = '<p class="vide-etat">Chargement…</p>'; return; }
  VUES[vue](v, parts[1] || '', parts[2] || '');
  window.scrollTo(0, 0);
}

// ---------- Onglets de page et indicateurs ----------
function ongletsPage(cle, liste) {
  if (!liste.some(([k]) => k === S[cle])) S[cle] = liste[0][0];
  return `<div class="onglets-page" data-onglets="${cle}">${liste.map(([k, n]) => `<button data-tab="${k}" class="${S[cle] === k ? 'actif' : ''}">${n}</button>`).join('')}</div>`;
}
function brancherOnglets(v, cle) {
  const appliquer = () => {
    v.querySelectorAll('[data-section]').forEach(x => { x.hidden = x.dataset.section !== S[cle]; });
    v.querySelectorAll(`[data-onglets="${cle}"] button`).forEach(b => b.classList.toggle('actif', b.dataset.tab === S[cle]));
  };
  v.querySelectorAll(`[data-onglets="${cle}"] button`).forEach(b => b.onclick = () => { S[cle] = b.dataset.tab; ecrireLocal(cle, S[cle]); appliquer(); });
  appliquer();
}
function indicateurs(items) {
  return `<div class="indicateurs">${items.map(x => `<div class="indicateur${x.choc ? ' choc' : ''}"><b>${x.val}</b><span>${x.lib}</span></div>`).join('')}</div>`;
}
// Calcule sur toute la période, quel que soit le filtre choisi (accueil).
function surTout(f) {
  const avant = S.periode; S.periode = 'tout';
  try { return f(); } finally { S.periode = avant; }
}

function filtresPeriode() {
  return `<div class="segments" data-groupe="periode">${PERIODES.map(p => `<button data-val="${p.id}" class="${S.periode === p.id ? 'actif' : ''}">${p.nom}</button>`).join('')}</div>`;
}
function filtresSource() {
  return `<div class="segments" data-groupe="source">${SOURCES.map(p => `<button data-val="${p.id}" class="${S.source === p.id ? 'actif' : ''}">${p.nom}</button>`).join('')}</div>`;
}
function brancherFiltres(v) {
  v.querySelectorAll('.segments[data-groupe] button').forEach(b => b.onclick = () => {
    const g = b.parentElement.dataset.groupe;
    S[g] = b.dataset.val; ecrireLocal(g, S[g]); route();
  });
}

function statsParti(id, vs, ps, ls) {
  const ens = membresDe(id);
  const membres = S.d.personnes.filter(p => ens.includes(p.parti));
  const vp = vs.filter(v => ens.includes(v.parti));
  const pp = ps.filter(p => ens.includes(p.parti));
  return { membres, vp, c: compter(vp), m: moyenneParPersonne(vp), f: compterPhrases(pp, ls.filter(l => ens.includes(l[2]))) };
}

function vuePartis(v) {
  const vs = verdicts(), ps = propos(), ls = lignesPhrases();
  const lignes = S.d.partis.map(p => ({ p, ...statsParti(p.id, vs, ps, ls) })).filter(x => x.membres.length || x.c.n);
  lignes.forEach(x => {
    const ids = x.membres.map(m => m.id);
    x.md = mediasDe(ids); x.pr = presseDe(ids); x.ab = abonnesDe(ids).total;
    x.posts = postsDe(ids); x.fiab = fiabiliteEns(ids);
    x.fx = faussetesDe(l => l[5] === x.p.id);
    x.pres = mediane(ids.map(presenceDe).filter(Boolean).map(r => r.sol));
  });
  lignes.sort((a, b) => b.posts - a.posts || b.membres.length - a.membres.length);  // les plus gros d'abord
  const total = lignes.reduce((n, x) => n + x.posts, 0);
  let corps;
  if (!S.d.personnes.length) {
    corps = '<p class="vide-etat">Première mise à jour en cours…</p>';
  } else if (S.affichage === 'tableau') {
    corps = tableauPartis(lignes);
  } else {
    corps = `<div class="grille">${lignes.map(carteParti).join('')}</div>`;
  }
  v.innerHTML = `
    <div class="entete">
      <div><h1>Partis</h1><div class="muet petit">${total.toLocaleString('fr-FR')} posts · ${S.d.personnes.filter(x => !estMedia(x.id)).length} personnalités · classés par nombre de posts</div></div>
      <div class="filtres">${filtresPeriode()}${filtresSource()}
        <div class="segments" data-groupe="affichage"><button data-val="cartes" class="${S.affichage === 'cartes' ? 'actif' : ''}">Cartes</button><button data-val="tableau" class="${S.affichage === 'tableau' ? 'actif' : ''}">Tableau</button></div>
      </div>
    </div>
    ${corps}`;
  brancherFiltres(v);
  v.querySelectorAll('th[data-col]').forEach(th => th.onclick = () => {
    S.tri = { col: th.dataset.col, sens: S.tri.col === th.dataset.col ? -S.tri.sens : -1 }; route();
  });
  v.querySelectorAll('tr[data-href]').forEach(tr => tr.onclick = () => location.hash = tr.dataset.href);
}

function carteParti({ p, membres, f, md, pr, ab, fx, posts, fiab }) {
  return `<a class="carte parti" href="#/${estCollectifMedia(p.id) ? 'media' : 'parti'}/${p.id}">
    <span class="liseré" style="background:${p.couleur}"></span>
    <div class="titre"><h2>${esc(p.nom)}</h2>${p.sigle !== p.nom ? `<span class="sigle">${esc(p.sigle)}</span>` : ''}<span class="compte">${membres.length} pers.</span>${pastilleFiab(fiab, 'moyen')}</div>
    <div class="chiffres">
      <div class="chiffre"><b>${posts.toLocaleString('fr-FR')}</b><span>posts</span></div>
      <div class="chiffre"><b class="${fiab.faux ? 'rouge' : ''}">${fiab.n ? `${fiab.faux} / ${fiab.n}` : '–'}</b><span>invalidés / analysés</span></div>
      <div class="chiffre"><b>${ab ? nbCourt(ab) : '–'}</b><span>abonnés cumulés</span></div>
    </div>
    ${fx.n ? `<div class="mention" style="color:var(--v-faux)">${fx.affirmations.length} affirmation${fx.affirmations.length > 1 ? 's' : ''} mensongère${fx.affirmations.length > 1 ? 's' : ''} répétée${fx.affirmations.length > 1 ? 's' : ''} ${fx.n} fois${fx.apres ? `, dont ${fx.apres} malgré le démenti` : ''}</div>` : ''}
    <div class="mention">${[f.n && `${pct(f.opinion, f.n)} % d'opinions`, md.total && `Télé et radio : ${heures(md.total)}`, pr.articles && `${pr.articles} articles de presse`].filter(Boolean).join(' · ')}</div>
    ${fiab.n && fiab.score == null ? `<span class="mention">Score à partir de ${MIN_POSTS_SCORE} posts analysés</span>` : ''}
  </a>`;
}

function tableauPartis(lignes) {
  const cols = [
    ['nom', 'Parti', x => x.p.nom], ['pers', 'Pers.', x => x.membres.length], ['posts', 'Posts', x => x.posts],
    ['fiab', 'Fiabilité', x => x.fiab.score], ['n', 'Vérifiés', x => x.c.n],
    ...VERDICTS.map(v => [v.id, v.nom + ' %', x => x.c.n ? pct(x.c[v.id], x.c.n) : null]),
    ['moy', 'Non fiables moy./pers. %', x => x.c.n ? Math.round(100 * nonFiables(x.m)) : null],
    ['ph', 'Phrases', x => x.f.n], ['op', 'Opinions %', x => x.f.n ? pct(x.f.opinion, x.f.n) : null],
    ['sa', 'Sanctionnés', x => x.f.sanctions],
    ['fx', 'Affirm. mensongères répétées', x => x.fx.n || null],
    ['ab', 'Abonnés', x => x.ab || null],
    ['tv', 'Télé/radio (h)', x => x.md.total ? Math.round(x.md.total / 3600) : null],
    ['ar', 'Articles', x => x.pr.articles || null],
    ['pr', 'Vote solennel méd. %', x => x.pres != null ? Math.round(100 * x.pres) : null],
  ];
  const col = cols.find(c => c[0] === S.tri.col);
  if (col) lignes = [...lignes].sort((a, b) => ((col[2](a) ?? -1) > (col[2](b) ?? -1) ? 1 : -1) * S.tri.sens);
  return `<div class="carte" style="overflow-x:auto"><table>
    <thead><tr>${cols.map(([k, t], i) => `<th data-col="${k}" class="${i ? 'n' : ''}">${t}${S.tri.col === k ? (S.tri.sens > 0 ? ' ↑' : ' ↓') : ''}</th>`).join('')}</tr></thead>
    <tbody>${lignes.map(x => `<tr class="clic" data-href="#/parti/${x.p.id}">${cols.map(([k, , f], i) => {
      const val = f(x);
      const grise = i >= 5 && i <= 9 && x.c.n < SEUIL ? ' muet' : '';
      const aff = k === 'ab' && val ? nbCourt(val) : val;
      return `<td class="${i ? 'n' : ''}${grise}">${i ? (aff ?? '–') : `<span class="badge"><i style="background:${x.p.couleur}"></i>${esc(val)}</span>`}</td>`;
    }).join('')}</tr>`).join('')}</tbody></table>
    <p class="muet petit">Grisé : moins de ${SEUIL} propos vérifiés. F+T moy./pers. : part de faux et trompeurs calculée pour chaque personnalité, puis moyennée. Vote solennel méd. : participation médiane des députés du parti aux scrutins solennels.</p></div>`;
}

function vueParti(v, id) {
  const p = S.partis[id];
  if (!p) return vuePartis(v);
  const vs = verdicts(), ps = propos(), ls = lignesPhrases();
  const { membres, vp, c, m, f } = statsParti(id, vs, ps, ls);
  const ens = membresDe(id), media = estCollectifMedia(id);
  const idsMembres = membres.map(x => x.id);
  const presences = idsMembres.map(i => [i, presenceDe(i)]).filter(x => x[1]);
  const med = presenceMediane();
  const suivis = idsMembres.filter(i => S.d.reseaux[i]?.collectes.length).length;
  const ids = new Set([...membres.map(x => x.id), ...vp.map(x => x.personne), ...ls.filter(l => ens.includes(l[2])).map(l => l[0])]);
  const lignes = [...ids].map(i => S.pers[i]).map(pe => {
    const mine = vp.filter(x => x.personne === pe.id);
    return { pe, c: compter(mine), fx: faussetesDe(l => l[0] === pe.id && ens.includes(l[5])).n, ab: abonnesDe([pe.id]).total, pres: presenceDe(pe.id), md: mediasDe([pe.id]).total, f: compterPhrases(ps.filter(x => x.personne === pe.id && ens.includes(x.parti)), ls.filter(l => l[0] === pe.id && ens.includes(l[2]))), ancien: !ens.includes(pe.parti) };
  }).sort((a, b) => b.fx - a.fx || b.c.n - a.c.n || b.ab - a.ab || a.pe.nom_famille.localeCompare(b.pe.nom_famille));
  const peu = c.n < SEUIL;
  const fx = faussetesDe(l => ens.includes(l[5]));
  const abP = abonnesDe(idsMembres).total;
  const groupe = media && S.groupesMedias[p.groupe];
  const solMed = mediane(presences.map(x => x[1].sol));
  v.innerHTML = `
    <div class="entete">
      <div><div class="muet petit">${media ? `<a href="#/medias">Médias</a>${groupe ? ` · <a href="#/media/${groupe.id}">${esc(groupe.nom)}</a>` : ''}` : '<a href="#/partis">Partis</a>'}</div>
        <div class="rangee" style="align-items:center;justify-content:flex-start;gap:14px"><h1 style="flex:none">${media ? '' : `<span class="badge" style="font-size:15px;vertical-align:4px"><i style="background:${p.couleur}"></i>${esc(p.sigle)}</span> `}${esc(p.nom)}</h1>${pastilleFiab(fiabiliteEns(idsMembres), 'grand')}</div>
        <div class="muet petit">${membres.length} ${media ? 'intervenants suivis' : 'personnalités suivies'} · ${c.n} propos vérifiés${S.groupesMedias[id] ? ` · ${ens.length} rédaction${ens.length > 1 ? 's' : ''}` : ''}${p.source ? ` · <a href="${esc(p.source)}" target="_blank" rel="noopener">propriétaire : source</a>` : ''}</div></div>
      <div class="filtres">${filtresPeriode()}${filtresSource()}</div>
    </div>
    ${indicateurs([
      { val: postsDe(idsMembres).toLocaleString('fr-FR'), lib: 'posts' },
      (() => { const fi = fiabiliteEns(idsMembres); return { val: fi.n ? `<a href="#/posts?${media ? 'media' : 'parti'}=${id}&statut=faux">${fi.faux} / ${fi.n}</a>` : '–', lib: 'posts analysés avec une fausse information', choc: fi.faux > 0 }; })(),
      { val: abP ? nbCourt(abP) : '–', lib: 'abonnés cumulés' },
      media ? { val: f.n ? pct(f.opinion, f.n) + ' %' : '–', lib: "d'opinions dans leurs propos" } : { val: solMed != null ? pct(solMed, 1) + ' %' : '–', lib: 'votes solennels (médiane des députés)' },
    ])}
    ${ongletsPage('ongletParti', [['fiabilite', 'Fiabilité'], ['membres', media ? 'Intervenants' : 'Membres'], ['medias', media ? 'Portée' : 'Médias et présence'], ['themes', 'Thèmes']])}
    <section data-section="fiabilite">
      <div class="carte" style="margin-bottom:14px"><h3>Affirmations mensongères répétées</h3>${blocFaussetes(fx, true)}</div>
      <div class="carte" style="margin-bottom:14px">
        <h3>Verdicts des fact-checkers</h3>
        ${c.n ? `
        <div class="chiffres" style="margin:10px 0">${VERDICTS.map(x => `<div class="chiffre ${peu ? 'insuffisant' : ''}"><b>${pct(c[x.id], c.n)} %</b><span>${x.nom.toLowerCase()} (${c[x.id]})</span></div>`).join('')}</div>
        <div class="ligne-barre"><span>Tous propos</span><div class="${peu ? 'insuffisant' : ''}">${empile(c, VERDICTS, c.n, 'propos')}</div></div>
        <div class="ligne-barre" style="margin-top:8px"><span>Moy./pers.</span><div class="${peu ? 'insuffisant' : ''}">${empile(m, VERDICTS, 1)}</div></div>
        <p class="mention">${peu ? `Échantillon insuffisant (moins de ${SEUIL} propos). ` : ''}Moy./pers. : chaque personnalité compte autant (${m.n} concernées).</p>
        <h4>Propos vérifiés par mois</h4>${colonnesMois(vp)}` : aucunVerdict()}
      </div>
      <div class="carte" style="margin-bottom:14px">
        <h3>Faits et opinions</h3>
        ${f.n ? `
        <div class="chiffres" style="margin:10px 0">
          <div class="chiffre"><b>${pct(f.fait, f.n)} %</b><span>faits énoncés</span></div>
          <div class="chiffre"><b>${pct(f.opinion, f.n)} %</b><span>opinions</span></div>
          <div class="chiffre"><b>${f.sanctions}</b><span>propos sanctionnés</span></div>
        </div>
        <div class="ligne-barre"><span>Phrases</span>${empile(f, TYPES, f.n, 'phrases')}</div>
        <p class="mention">${detailPhrases(f)}</p>` : '<p class="muet">Aucun propos sur la période.</p>'}
      </div>
    </section>
    <section data-section="membres">
      <div class="carte" style="overflow-x:auto"><table>
      <thead><tr><th>Personnalité</th><th>Fonction</th><th class="n">Mensongères</th><th class="n">Vérifiés</th><th style="width:18%">Verdicts</th><th class="n">Abonnés</th><th class="n">Vote sol. %</th><th class="n">Télé/radio</th></tr></thead>
      <tbody>${lignes.map(l => `<tr class="clic" data-href="#/p/${l.pe.id}">
        <td>${esc(l.pe.nom)}${l.ancien ? ` <span class="muet petit">(aujourd'hui ${esc(S.partis[l.pe.parti]?.sigle || '')})</span>` : ''}</td>
        <td class="muet petit">${esc(l.pe.fonction || '')}</td>
        <td class="n${l.fx ? ' rouge' : ''}">${l.fx || ''}</td>
        <td class="n">${l.c.n || ''}</td>
        <td>${l.c.n ? empile(l.c, VERDICTS, l.c.n, 'propos') : ''}</td>
        <td class="n">${l.ab ? nbCourt(l.ab) : ''}</td>
        <td class="n">${l.pres?.sol != null ? pct(l.pres.sol, 1) : ''}</td>
        <td class="n">${l.md ? heures(l.md) : ''}</td></tr>`).join('')}</tbody></table></div>
    </section>
    <section data-section="medias">
      ${media ? `<div class="carte"><h3>Portée sur les réseaux</h3>${blocPortee(idsMembres)}</div>` : ''}
      <div class="deux" ${media ? 'hidden' : ''}>
        <div class="carte"><h3>Médias</h3>${blocMedias(idsMembres)}</div>
        <div class="carte"><h3>Portée sur les réseaux</h3>${blocPortee(idsMembres)}</div>
      </div>
      <div class="deux" ${media ? 'hidden' : ''}>
        <div class="carte"><h3>Présence à l'Assemblée</h3>${presences.length ? `
          <div class="chiffres" style="margin:10px 0">
            <div class="chiffre"><b>${pct(solMed, 1)} %</b><span>votes solennels (médiane)</span></div>
            <div class="chiffre"><b>${pct(mediane(presences.map(x => x[1].tx)), 1)} %</b><span>tous scrutins (médiane)</span></div>
          </div>
          <p class="mention">${presences.length} députés. Médiane de l'Assemblée : ${pct(med.sol, 1)} % des votes solennels, ${pct(med.tx, 1)} % de tous les scrutins.</p>` : '<p class="muet">Aucun député.</p>'}</div>
        <div class="carte"><h3>Réseaux sociaux</h3>
          <div class="chiffres" style="margin:10px 0">
            <div class="chiffre"><b>${suivis} / ${idsMembres.length}</b><span>membres suivis</span></div>
            <div class="chiffre"><b>${postsDe(idsMembres)}</b><span>posts collectés</span></div>
          </div>
          <p class="mention">Collectés : Bluesky, Mastodon, YouTube et Telegram automatiquement ; X et Instagram par l'extension de navigateur, au fil des profils visités. Facebook et TikTok ne sont pas collectés.</p></div>
      </div>
    </section>
    <section data-section="themes"><div class="carte"><h3>Thèmes principaux</h3>${blocThemes(idsMembres, 14)}</div></section>`;
  brancherOnglets(v, 'ongletParti');
  brancherFiltres(v);
  v.querySelectorAll('tr[data-href]').forEach(tr => tr.onclick = () => location.hash = tr.dataset.href);
}

function detailPhrases(f) {
  const nb = n => n.toLocaleString('fr-FR');
  const x = f.src;
  return [x.seance && `${nb(x.seance.phrases)} phrases en séance (${nb(x.seance.nb)} interventions)`,
    x.reseaux && `${nb(x.reseaux.phrases)} sur les réseaux (${nb(x.reseaux.nb)} posts)`,
    x.presse && `${nb(x.presse.phrases)} citées par la presse (${nb(x.presse.nb)} citations)`,
    f.propos && `${f.propos} propos saisis`].filter(Boolean).join(' · ') + '.';
}

function badgeParti(id, suffixe = '') {
  const p = S.partis[id] || S.partis.autres;
  return `<a class="badge" href="#/${estCollectifMedia(p.id) ? 'media' : 'parti'}/${p.id}"><i style="background:${p.couleur}"></i>${esc(p.nom)}${suffixe}</a>`;
}
function initiales(p) { return (p.prenom[0] || '') + (p.nom_famille[0] || ''); }

function vuePersonne(v, id) {
  const p = S.pers[id];
  if (!p) { v.innerHTML = '<p class="vide-etat">Personnalité introuvable.</p>'; return; }
  const vs = S.d.verdicts.filter(x => x.personne === id).sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  const ps = S.d.propos.filter(x => x.personne === id).sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  const c = compter(vs), f = compterPhrases(ps.filter(x => dansPeriode(x.date) && ['tout', 'saisis'].includes(S.source)), lignesPhrases().filter(l => l[0] === id));
  const pres = presenceDe(id), med = presenceMediane();
  const fxP = faussetesDe(l => l[0] === id), abT = abonnesDe([id]).total, tv = mediasDe([id]).total;
  const rs = S.d.reseaux[id] || { collectes: [], erreurs: {} };
  const ab = S.d.abonnes[id] || {};
  const URLS = {
    x: h => 'https://x.com/' + h, bluesky: h => 'https://bsky.app/profile/' + h, youtube: h => 'https://www.youtube.com/channel/' + h,
    facebook: h => 'https://www.facebook.com/' + h, instagram: h => 'https://www.instagram.com/' + h,
    tiktok: h => 'https://www.tiktok.com/@' + h, telegram: h => 'https://t.me/' + h,
    mastodon: h => { const [u, i] = h.replace(/^@/, '').split('@'); return i ? `https://${i}/@${u}` : '#'; },
  };
  const comptes = { ...(p.comptes || {}) };
  if (!comptes.bluesky && rs.bluesky) comptes.bluesky = rs.bluesky.handle;
  const collecte = { bluesky: 'Bluesky', mastodon: 'Mastodon', youtube: 'YouTube', telegram: 'Telegram', x: 'X', instagram: 'Instagram' };
  const statut = r => {
    if (r === 'x' || r === 'instagram') return rs.releve?.[r] ? `relevé le ${fdate(rs.releve[r])} (extension)` : 'via l\'extension, pas encore relevé';
    if (!collecte[r]) return 'non collecté';
    if (!rs.collectes.includes(collecte[r])) return 'non suivi';
    return rs.erreurs[collecte[r]] ? 'erreur de collecte' : 'suivi';
  };
  const a = age(p.naissance?.date);
  const cv = p.cv || { mandats: [], partis: [], formation: [], professions: [] };
  const groupe = p.categorie === 'media' ? (S.partis[S.partis[p.parti]?.groupe] ? ` · propriétaire : <a href="#/media/${S.partis[p.parti].groupe}">${esc(S.partis[S.partis[p.parti].groupe].nom)}</a>` : '')
    : p.groupe && p.groupe.sigle !== S.partis[p.parti]?.sigle ? ` · groupe ${esc(p.groupe.sigle)}` : '';
  const liens = [
    p.an && `<a href="${p.an}" target="_blank" rel="noopener">Assemblée nationale</a>`,
    p.hatvp && `<a href="${p.hatvp}" target="_blank" rel="noopener">Déclarations HATVP</a>`,
    p.wikipedia && `<a href="${p.wikipedia}" target="_blank" rel="noopener">Wikipédia</a>`,
    p.wikidata && `<a href="https://www.wikidata.org/wiki/${p.wikidata}" target="_blank" rel="noopener">Wikidata</a>`,
  ].filter(Boolean).join('');
  v.innerHTML = `
    <div class="fiche-tete">
      ${p.image ? `<figure class="photo-cadre"><img class="photo" src="${esc(p.image)}" alt="" loading="lazy"><figcaption><a href="${esc(p.image.split('?')[0].replace('Special:FilePath/', 'File:'))}" target="_blank" rel="noopener">Photo : Wikimedia Commons</a></figcaption></figure>` : `<div class="photo vide">${esc(initiales(p))}</div>`}
      <div style="flex:1">
        <div class="rangee" style="align-items:center;justify-content:flex-start;gap:14px"><h1 style="flex:none">${esc(p.nom)}</h1>${pastilleScore(id, true)}</div>
        <div style="margin:6px 0">${badgeParti(p.parti)}<span class="muet petit">${groupe}${p.parti_a_verifier ? ` · Wikidata indique : ${esc(p.parti_a_verifier)}` : ''}</span></div>
        <div>${esc(p.fonction || '')}</div>
        <div class="muet petit">${[
          p.naissance?.date && `Né${p.femme ? 'e' : p.femme === false ? '' : '·e'} le ${fdate(p.naissance.date)}${p.naissance.lieu ? ' à ' + esc(p.naissance.lieu) : ''}${a ? ` (${a} ans)` : ''}`,
          p.profession && `Profession déclarée : ${esc(p.profession)}`,
        ].filter(Boolean).join(' · ')}</div>
        <div class="liens">${liens}${p.categorie === 'media' && !STATIQUE ? `<a class="edition" href="#/atelier/intervenants?q=${encodeURIComponent(p.nom)}&qid=${p.wikidata}">Modifier le média</a>` : ''}</div>
      </div>
    </div>
    <div class="filtres" style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:14px">${filtresPeriode()}${filtresSource()}</div>
    ${indicateurs([
      (() => { const f = fiabiliteDe(id); return { val: f.n ? `<a href="#/posts?personne=${id}&statut=faux">${f.faux} / ${f.n}</a>` : '–', lib: 'posts analysés contenant une fausse information', choc: f.faux > 0 }; })(),
      { val: c.n ? `${nonFiables(c)} / ${c.n}` : '–', lib: 'propos vérifiés non fiables (faux, trompeurs, non étayés)' },
      { val: abT ? nbCourt(abT) : '–', lib: 'abonnés, portée' },
      pres ? { val: pct(pres.sol, 1) + ' %', lib: 'votes solennels' } : { val: tv ? heures(tv) : '–', lib: 'de télé et radio' },
    ])}
    ${ongletsPage('ongletFiche', [['fiabilite', 'Fiabilité'], ['propos', 'Propos'], ['medias', 'Médias et présence'], ['parcours', 'Parcours']])}
    <section data-section="fiabilite">
      <div class="carte" style="margin-bottom:14px"><h3>Affirmations mensongères répétées</h3>${blocFaussetes(fxP)}</div>
      <div class="carte" style="margin-bottom:14px">
        <div class="rangee" style="justify-content:space-between"><h3 style="flex:none">Verdicts des fact-checkers</h3><button id="aj-verdict" class="edition" style="flex:none">Ajouter</button></div>
        ${c.n ? `<div class="chiffres" style="margin:10px 0">${VERDICTS.map(x => `<div class="chiffre"><b>${c[x.id]}</b><span>${x.nom.toLowerCase()}</span></div>`).join('')}</div>
        ${empile(c, VERDICTS, c.n, 'propos')}${c.n < SEUIL ? `<p class="mention">${c.n} propos vérifiés : trop peu pour en tirer un taux.</p>` : ''}` : aucunVerdict()}
        <div id="form-verdict" hidden>${formVerdict()}</div>
        ${vs.map(x => ligneVerdict(x, p)).join('')}
      </div>
      <div class="carte" style="margin-bottom:14px"><h3>Faits et opinions</h3>
        ${f.n ? `<div class="chiffres" style="margin:10px 0"><div class="chiffre"><b>${pct(f.fait, f.n)} %</b><span>faits</span></div><div class="chiffre"><b>${pct(f.opinion, f.n)} %</b><span>opinions</span></div><div class="chiffre"><b>${f.sanctions}</b><span>sanctionnés</span></div></div>
        ${empile(f, TYPES, f.n, 'phrases')}<p class="mention">${detailPhrases(f)}</p>` : '<p class="muet">Aucun propos.</p>'}
        ${S.d.opinions_faits?.[id] ? `<p class="petit"><b>${S.d.opinions_faits[id]}</b> jugement${S.d.opinions_faits[id] > 1 ? 's' : ''} présenté${S.d.opinions_faits[id] > 1 ? 's' : ''} comme ${S.d.opinions_faits[id] > 1 ? 'des faits' : 'un fait'} (relevé par Beau Discours).</p>` : ''}
      </div>
      <div class="carte">
        <div class="rangee" style="justify-content:space-between"><h3 style="flex:none">Propos saisis</h3><button id="aj-propos" class="edition" style="flex:none">Ajouter</button></div>
        <div id="form-propos" hidden>${formPropos()}</div>
        ${ps.map(x => lignePropos(x, p)).join('') || '<p class="muet">Aucun.</p>'}
      </div>
    </section>
    <section data-section="propos">
      <div class="carte" style="margin-bottom:14px"><h3>Thèmes principaux</h3>${blocThemes([id])}</div>
      <div class="carte" id="contenus">
        <div class="rangee" style="justify-content:space-between"><h3 style="flex:none">Ce qu'il ou elle dit</h3>
          <div class="segments" style="flex:none" id="onglets">${[['reseaux', 'Réseaux'], ['presse', 'Presse'], ['seance', 'Séance']].map(([k, n]) => `<button data-onglet="${k}" class="${S.onglet === k ? 'actif' : ''}">${n}</button>`).join('')}</div></div>
        <div id="contenu-onglet"><p class="muet petit">Chargement…</p></div>
      </div>
    </section>
    <section data-section="medias">
      <div class="deux">
        <div class="carte"><h3>Médias</h3>${blocMedias([id])}</div>
        <div class="carte"><h3>Portée sur les réseaux</h3>${blocPortee([id], true)}</div>
      </div>
      <div class="deux">
        <div class="carte"><h3>Présence</h3>
          ${pres ? `<div class="chiffres" style="margin:10px 0">
            <div class="chiffre"><b>${pct(pres.sol, 1)} %</b><span>votes solennels</span></div>
            <div class="chiffre"><b>${pct(pres.tx, 1)} %</b><span>tous scrutins</span></div>
            <div class="chiffre"><b>${pct(pres.deleg, 1)} %</b><span>par délégation</span></div>
          </div>
          <p class="mention">${pres.scrutins.toLocaleString('fr-FR')} scrutins publics à l'Assemblée sur la période, dont ${pres.solennels} solennels. Médiane des députés : ${pct(med.sol, 1)} % des votes solennels, ${pct(med.tx, 1)} % de tous les scrutins.</p>`
          : `<p class="muet">${id.startsWith('PA') ? 'Aucun scrutin sur la période.' : 'Pas de mandat de député : présence non mesurée (Sénat et Parlement européen pas encore suivis).'}</p>`}
          ${f.src.seance ? `<p class="mention">${f.src.seance.nb.toLocaleString('fr-FR')} interventions en séance sur la période.</p>` : ''}
          <p class="mention">Terrain : aucune donnée publique (agendas non publiés). La part d'articles en presse régionale, dans « Médias », en donne un indice.</p>
        </div>
        <div class="carte"><h3>Réseaux sociaux</h3>
          <div class="comptes">${Object.entries(comptes).map(([r, h]) => `<div class="compte">
            <a href="${esc(URLS[r] ? URLS[r](h) : '#')}" target="_blank" rel="noopener">${NOMS_RESEAUX[r] || r}</a>
            ${ab[r] ? `<span class="petit" data-tip="${esc(`${ab[r].source}, ${fdate(ab[r].date)}`)}">${nbCourt(ab[r].n)} abonnés</span>` : ''}
            <span class="muet petit" style="margin-left:auto">${statut(r)}</span></div>`).join('') || '<p class="muet">Aucun compte connu.</p>'}</div>
          ${rs.bluesky?.source === 'recherche' ? '<p class="mention">Compte Bluesky trouvé par recherche du nom (non déclaré dans Wikidata).</p>' : ''}
          <p class="mention">${postsDe([id])} posts collectés sur la période.</p>
        </div>
      </div>
    </section>
    <section data-section="parcours">
      <div class="deux">
        <div class="carte"><h3>Parcours</h3>
          <div class="frise">${cv.mandats.length ? [...cv.mandats].reverse().map(m => `
            <div class="an"><span class="dates">${m.debut ? m.debut.slice(0, 4) : '?'} – ${m.fin ? m.fin.slice(0, 4) : '<span class="actuel">…</span>'}</span>
            <span class="${m.fin ? '' : 'actuel'}">${esc(m.label)}${m.lieu ? ` <span class="muet">· ${esc(m.lieu)}</span>` : ''}</span></div>`).join('') : '<p class="muet">Aucun mandat renseigné dans Wikidata.</p>'}</div>
        </div>
        <div class="carte" style="display:grid;gap:16px;align-content:start">
          <div><h3>Partis successifs</h3><div class="frise">${cv.partis.length ? [...cv.partis].reverse().map(m => `
            <div class="an"><span class="dates">${m.debut ? m.debut.slice(0, 4) : '?'} – ${m.fin ? m.fin.slice(0, 4) : '…'}</span><span>${esc(m.label)}</span></div>`).join('') : '<p class="muet">Non renseigné.</p>'}</div></div>
          <div><h3>Formation</h3><div class="puces" style="margin-top:8px">${cv.formation.map(x => `<span class="puce">${esc(x)}</span>`).join('') || '<span class="muet">Non renseignée.</span>'}</div></div>
          <div><h3>Métiers</h3><div class="puces" style="margin-top:8px">${cv.professions.map(x => `<span class="puce">${esc(x)}</span>`).join('') || '<span class="muet">Non renseignés.</span>'}</div></div>
        </div>
      </div>
    </section>`;

  brancherOnglets(v, 'ongletFiche');
  brancherFiltres(v);
  $('#aj-verdict').onclick = () => { $('#form-verdict').hidden = !$('#form-verdict').hidden; };
  $('#aj-propos').onclick = () => { $('#form-propos').hidden = !$('#form-propos').hidden; };
  brancherChoixVerdict(v);
  $('#form-verdict form').onsubmit = async e => {
    e.preventDefault();
    const fd = new FormData(e.target), verdict = e.target.dataset.verdict;
    if (!verdict) return alert('Choisis un verdict.');
    await api('/api/verdict', { personne: id, verdict, ...Object.fromEntries(fd) });
    await recharger();
  };
  $('#form-propos form').onsubmit = async e => {
    e.preventDefault();
    const fd = Object.fromEntries(new FormData(e.target));
    const sanction = fd.sanction_motif || fd.sanction_url ? { motif: fd.sanction_motif, url: fd.sanction_url } : null;
    await api('/api/propos', { personne: id, texte: fd.texte, date: fd.date, source: fd.source, sanction });
    await recharger();
  };
  v.querySelectorAll('[data-suppr-verdict]').forEach(b => b.onclick = async () => {
    if (!confirm('Retirer ce verdict des calculs ?')) return;
    await api('/api/verdict/supprimer', { id: b.dataset.supprVerdict }); await recharger();
  });
  v.querySelectorAll('[data-suppr-propos]').forEach(b => b.onclick = async () => {
    if (!confirm('Supprimer ce propos ?')) return;
    await api('/api/propos/supprimer', { id: b.dataset.supprPropos }); await recharger();
  });
  chargerFiche(id);
  v.querySelectorAll('.phrase[data-propos]').forEach(s => s.onclick = async () => {
    const pr = S.d.propos.find(x => x.id === s.dataset.propos);
    const ph = pr.phrases[+s.dataset.i];
    ph.type = { fait: 'opinion', opinion: 'autre', autre: 'fait' }[ph.type];
    await api('/api/propos', { id: pr.id, personne: pr.personne, texte: pr.texte, date: pr.date, source: pr.source, sanction: pr.sanction, phrases: pr.phrases });
    await recharger();
  });
}

const NOM_TYPE = { fait: 'Fait énoncé', opinion: 'Opinion', autre: 'Question ou procédure' };
const phrasesHtml = phs => phs.map(ph => `<span class="phrase ${ph.type}" ${ph.type === 'fait' && !STATIQUE ? `data-registre="${esc(ph.phrase)}"` : ''} data-tip="${NOM_TYPE[ph.type]}${ph.type === 'fait' && !STATIQUE ? ' · cliquer pour l\'ajouter au registre' : ''}">${esc(ph.phrase)}</span>`).join(' ');
async function chargerFiche(id) {
  const d = await api('/api/fiche/' + encodeURIComponent(id));
  const zone = $('#contenu-onglet');
  if (!zone) return;
  const rendus = {
    reseaux: () => d.posts.map(e => `<div class="verdict">
      <div class="source">${fdate(e.date)}<br>${esc(e.reseau)}</div>
      <div>${e.phrases.length ? phrasesHtml(e.phrases) : esc(e.texte)}${e.themes?.length ? `<div class="puces" style="margin-top:6px">${e.themes.map(t => `<span class="puce">${esc(S.d.theme_noms[t])}</span>`).join('')}</div>` : ''}</div>
      <a class="source" href="${esc(e.url)}" target="_blank" rel="noopener">Voir</a></div>`).join('') || '<p class="muet">Aucun post collecté.</p>',
    presse: () => (d.citations.length ? `<h4>Citations dans les titres</h4>${d.citations.map(e => `<div class="verdict">
      <div class="source">${fdate(e.date)}</div><div><div class="citation">${phrasesHtml(e.phrases)}</div></div>
      <a class="source" href="${esc(e.url)}" target="_blank" rel="noopener">${esc(e.source)}</a></div>`).join('')}` : '')
      + `<h4>Derniers articles</h4>${d.articles.map(a => `<div class="verdict"><div class="source">${fdate(a.date)}</div>
      <div><a href="${esc(a.url)}" target="_blank" rel="noopener">${esc(a.titre)}</a></div><span class="source">${esc(a.source)}</span></div>`).join('') || '<p class="muet">Aucun article récent.</p>'}`,
    seance: () => d.seances.map(e => `<div class="verdict">
      <div class="source">${fdate(e.date)}</div>
      <div>${e.debat ? `<div class="source" style="margin-bottom:4px">${esc(e.debat)}</div>` : ''}${phrasesHtml(e.phrases)}</div>
      <a class="source" href="${esc(e.url)}" target="_blank" rel="noopener">Compte rendu</a></div>`).join('') || '<p class="muet">Aucune intervention en séance.</p>',
  };
  const afficher = () => {
    zone.innerHTML = rendus[S.onglet]();
    if (!STATIQUE) zone.querySelectorAll('[data-registre]').forEach(sp => sp.onclick = () => {
      if (confirm('Ajouter cette affirmation au registre des affirmations mensongères ?\n\n« ' + sp.dataset.registre + ' »'))
        location.hash = '#/atelier/registre/nouveau?texte=' + encodeURIComponent(sp.dataset.registre);
    });
    document.querySelectorAll('#onglets button').forEach(b => b.classList.toggle('actif', b.dataset.onglet === S.onglet));
  };
  document.querySelectorAll('#onglets button').forEach(b => b.onclick = () => { S.onglet = b.dataset.onglet; ecrireLocal('onglet', S.onglet); afficher(); });
  afficher();
}

function ligneVerdict(x, p) {
  const V = VERDICTS.find(k => k.id === x.verdict);
  if (x.origine === 'beaudiscours') {
    const alors = x.parti !== p.parti ? ` · alors ${esc(S.partis[x.parti]?.sigle || '')}` : '';
    return `<div class="verdict">
      <div><span class="etiquette" style="background:${couleur(V.c)}">${V.nom}</span></div>
      <div><div class="citation">${esc(x.texte)}</div>
        ${x.note ? `<div class="petit" style="margin-top:4px">${esc(x.note)}</div>` : ''}
        <div class="source">${fdate(x.date)}${alors} · vérifié par Beau Discours${x.url && x.url !== x.propos_url ? ` · <a href="${esc(x.url)}" target="_blank" rel="noopener">source</a>` : ''}${x.propos_url ? ` · <a href="${esc(x.propos_url)}" target="_blank" rel="noopener">propos</a>` : ''}</div></div>
      <span></span></div>`;
  }
  const alors = x.parti !== p.parti ? ` · alors ${esc(S.partis[x.parti]?.sigle || '')}` : '';
  return `<div class="verdict">
    <div><span class="etiquette" style="background:${couleur(V.c)}">${V.nom}</span>${x.note && norm(x.note) !== norm(V.nom) ? `<div class="source" style="margin-top:4px">« ${esc(x.note.slice(0, 60))} »</div>` : ''}</div>
    <div>${x.texte ? `<div class="citation">${esc(x.texte)}</div>` : ''}
      <div class="source">${fdate(x.date)}${alors} · ${x.url ? `<a href="${esc(x.url)}" target="_blank" rel="noopener">${esc(x.editeur || 'source')}</a>` : esc(x.editeur)}${x.origine === 'manuel' ? ' · qualifié à la main' : ''}</div></div>
    <button class="discret edition" data-suppr-verdict="${x.id}" title="Retirer">Retirer</button>
  </div>`;
}
function lignePropos(x, p) {
  const alors = x.parti !== p.parti ? ` · alors ${esc(S.partis[x.parti]?.sigle || '')}` : '';
  return `<div class="verdict">
    <div class="source">${fdate(x.date)}${alors}</div>
    <div><div>${x.phrases.map((ph, i) => `<span class="phrase ${ph.type}" data-propos="${x.id}" data-i="${i}" data-tip="${NOM_TYPE[ph.type]} · cliquer pour changer">${esc(ph.phrase)}</span>`).join(' ')}</div>
      ${x.sanction ? `<div class="sanction">Sanctionné : ${x.sanction.url ? `<a href="${esc(x.sanction.url)}" target="_blank" rel="noopener">${esc(x.sanction.motif || 'source')}</a>` : esc(x.sanction.motif)}</div>` : ''}
      ${x.source ? `<div class="source"><a href="${esc(x.source)}" target="_blank" rel="noopener">Source</a></div>` : ''}</div>
    <button class="discret edition" data-suppr-propos="${x.id}">Supprimer</button>
  </div>`;
}

function boutonsVerdict(sel) {
  return `<div class="choix-verdict">${VERDICTS.map(v => `<button type="button" data-v="${v.id}" data-c="${v.c}" class="${sel === v.id ? 'actif' : ''}" style="${sel === v.id ? `background:${couleur(v.c)}` : ''}">${v.nom}</button>`).join('')}</div>`;
}
function brancherChoixVerdict(racine) {
  racine.querySelectorAll('.choix-verdict').forEach(g => {
    const form = g.closest('form');
    const actif = g.querySelector('.actif');
    if (actif) form.dataset.verdict = actif.dataset.v;
    g.querySelectorAll('button').forEach(b => b.onclick = () => {
      g.querySelectorAll('button').forEach(x => { x.classList.remove('actif'); x.style.background = ''; });
      b.classList.add('actif'); b.style.background = couleur(b.dataset.c);
      form.dataset.verdict = b.dataset.v;
    });
  });
}
function formVerdict() {
  return `<form class="grille-form" style="margin:10px 0 16px">
    <textarea name="texte" placeholder="Propos vérifié" required></textarea>
    <div class="rangee"><input name="date" type="date" required><input name="editeur" placeholder="Fact-checker (ex. AFP Factuel)" required><input name="url" type="url" placeholder="Lien de l'article" required></div>
    ${boutonsVerdict()}
    <div><button class="principal">Enregistrer</button></div></form>`;
}
function formPropos() {
  return `<form class="grille-form" style="margin:10px 0 16px">
    <textarea name="texte" placeholder="Propos tel que prononcé ou écrit" required></textarea>
    <div class="rangee"><input name="date" type="date" required><input name="source" type="url" placeholder="Lien vers la source (vidéo, compte rendu, post)" required></div>
    <details><summary class="petit muet">Propos sanctionné</summary>
      <div class="rangee" style="margin-top:8px"><input name="sanction_motif" placeholder="Ex. rappel à l'ordre, condamnation définitive"><input name="sanction_url" type="url" placeholder="Lien vers la décision ou l'article"></div></details>
    <div><button class="principal">Analyser et enregistrer</button></div></form>`;
}

function vueQualifier(v) {
  const arts = S.d.a_qualifier;
  const tri = S.d.personnes.map(p => p.nom).sort((a, b) => a.localeCompare(b));
  v.innerHTML = `
    <div class="entete"><div><h1>À qualifier</h1><div class="muet petit">${arts.length} articles de vérification citent une personnalité suivie</div></div></div>
    <datalist id="tous-noms">${tri.map(n => `<option value="${esc(n)}">`).join('')}</datalist>
    ${arts.map((a, i) => `<form class="carte article" data-url="${esc(a.url)}" data-i="${i}">
      <div class="tete"><h3><a href="${esc(a.url)}" target="_blank" rel="noopener">${esc(a.titre)}</a></h3><span class="muet petit">${esc(a.source)} · ${fdate(a.date)}</span></div>
      ${a.resume ? `<div class="muet petit">${esc(a.resume)}</div>` : ''}
      <div class="rangee">
        <select name="personne">${a.personnes.map(id => `<option value="${id}">${esc(S.pers[id]?.nom || id)}</option>`).join('')}<option value="">Autre…</option></select>
        <input name="autre" list="tous-noms" placeholder="Nom de l'auteur du propos" hidden>
        <input name="date" type="date" value="${esc(a.date)}" title="Date du propos">
      </div>
      <textarea name="texte" placeholder="Propos vérifié (citation)"></textarea>
      ${boutonsVerdict(a.verdict_suggere)}
      <div class="rangee" style="justify-content:flex-start"><button class="principal" style="flex:none">Retenir</button><button type="button" class="discret" data-ecarter style="flex:none">Écarter</button></div>
    </form>`).join('') || '<p class="vide-etat">Rien à qualifier.</p>'}`;
  brancherChoixVerdict(v);
  v.querySelectorAll('form.article').forEach(f => {
    const a = arts[+f.dataset.i];
    f.personne.onchange = () => { f.autre.hidden = !!f.personne.value; };
    f.querySelector('[data-ecarter]').onclick = async () => { await api('/api/article/ecarter', { url: a.url }); await recharger(); };
    f.onsubmit = async e => {
      e.preventDefault();
      let personne = f.personne.value;
      if (!personne) personne = S.d.personnes.find(p => norm(p.nom) === norm(f.autre.value))?.id;
      if (!personne) return alert('Personnalité introuvable.');
      if (!f.dataset.verdict) return alert('Choisis un verdict.');
      await api('/api/verdict', { personne, verdict: f.dataset.verdict, texte: f.texte.value, date: f.date.value,
        editeur: a.source, url: a.url, titre: a.titre, article: a.url });
      await recharger();
    };
  });
}

// ---------- Registre des affirmations fausses ----------
const NOM_SOURCE = { seance: 'Séance', reseaux: 'Réseaux', presse: 'Presse', saisi: 'Saisi' };
function groupesTexte(g) { return (g || []).map(x => x.join(' | ')).join('\n'); }
function texteGroupes(t) { return t.split('\n').map(l => l.split('|').map(x => x.trim()).filter(Boolean)).filter(g => g.length); }

async function vueRegistre(v, arg) {
  if (arg) return vueAffirmation(v, arg);
  v.innerHTML = '<p class="vide-etat">Chargement…</p>';
  const liste = await api('/api/registre');
  const onglet = S.requete.get('vue') || 'service';
  const vis = liste.filter(a => onglet === 'service' ? a.actif : !a.actif);
  v.innerHTML = `
    <div class="entete">
      <div><h1>Registre</h1><div class="muet petit">Affirmations mensongères, leurs sources et leurs répétitions${liste.some(a => a.signalements) ? ` · <b>${liste.reduce((n, a) => n + a.signalements, 0)} signalement(s) à examiner</b>` : ''}</div></div>
      <div class="filtres">
        <div class="segments"><a class="${onglet === 'service' ? 'actif' : ''}" href="#/atelier/registre?vue=service">En service (${liste.filter(a => a.actif).length})</a><a class="${onglet === 'brouillons' ? 'actif' : ''}" href="#/atelier/registre?vue=brouillons">Brouillons (${liste.filter(a => !a.actif).length})</a></div>
        <a class="bouton principal" href="#/atelier/registre/nouveau">Nouvelle affirmation</a>
      </div>
    </div>
    ${vis.map(a => `<a class="carte affirmation" href="#/atelier/registre/${a.id}">
      <div class="citation">${esc(a.affirmation)}</div>
      ${a.realite ? `<div class="petit"><b>En réalité :</b> ${esc(a.realite)}</div>` : ''}
      ${a.nature === 'estimations' ? '<div class="petit muet">Fondé sur des estimations</div>' : ''}
      ${a.signalements ? `<div class="petit rouge">${a.signalements} signalement${a.signalements > 1 ? 's' : ''} à examiner</div>` : ''}
      <div class="mention">${[a.compte.confirme && `<b style="color:var(--v-faux)">${a.compte.confirme} répétitions confirmées</b>`,
        a.compte.a_confirmer && `${a.compte.a_confirmer} à confirmer`, a.compte.rejete && `${a.compte.rejete} écartées`,
        esc(a.origine), a.dementi && `démenti du ${fdate(a.dementi)}`].filter(Boolean).join(' · ')}</div>
    </a>`).join('') || `<p class="vide-etat">${onglet === 'service' ? 'Aucune affirmation en service. Les brouillons venant des fact-checks attendent dans l\'onglet Brouillons.' : 'Aucun brouillon.'}</p>`}`;
}

// Fausse information non corrigée : répétée après le démenti, ou postée avant et laissée en ligne.
const maintenue = (a, c) => !!a.dementi && (c.date > a.dementi || (c.source === 'reseaux' && c.statut === 'confirme'));

// Indices repérés automatiquement pour aider à trier une phrase : jamais une décision.
function aideTri(aide) {
  if (!aide || !aide.raison) return '';
  let h = `<div class="petit" style="color:var(--v-trompeur)">À vérifier : ${esc(aide.raison)}`;
  if (aide.citation) {
    const noms = (aide.cite || []).map(x => `<a href="#/p/${x.id}">${esc(x.nom)}</a>`).join(', ');
    h += noms ? ` · personne citée : ${noms}` : ' · personne citée non identifiée';
    const o = aide.original;
    h += o ? `</div><div class="petit">Propos d'origine retrouvé : <a href="#/p/${o.personne}">${esc(o.nom)}</a>, ${fdate(o.date)} (${NOM_SOURCE[o.source] || o.source}) : « ${esc(o.texte)} » <a href="${esc(o.url)}" target="_blank" rel="noopener">source</a>`
      : (noms ? `</div><div class="petit muet">Propos d'origine non retrouvé dans ce que Beau Discours a collecté : à vérifier (citation exacte, déformée ou inventée ?)` : '');
  }
  return h + '</div>';
}

async function vueAffirmation(v, aid, publique = false) {
  const nouveau = aid === 'nouveau';
  const a = nouveau ? { affirmation: S.requete.get('texte') || '', realite: '', preuves: [], dementi: '', groupes: [], exclusions: [], actif: true, correspondances: [], nature: 'etabli', estimations: [], fourchettes: {}, signalements: [] }
    : await api('/api/registre/' + aid);
  // Le site public ne reçoit ni mots-clés ni exclusions.
  a.groupes = a.groupes || []; a.exclusions = a.exclusions || [];
  const corr = a.correspondances;
  const ordre = { a_confirmer: 0, confirme: 1, corrige: 1, rejete: 2 };
  // À confirmer d'abord, et parmi elles celles sans marque de citation ou de contestation.
  corr.sort((x, y) => ordre[x.statut] - ordre[y.statut] || (!!x.aide.raison - !!y.aide.raison) || y.date.localeCompare(x.date));
  const motsCles = a.groupes.flat();
  const surligner = t => {
    let h = esc(t);
    motsCles.forEach(m => {
      const rx = new RegExp('(' + m.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
        .split(/\s+/).map(w => w.split('').map(c => /[a-z]/i.test(c) ? `[${c}${c.toUpperCase()}\u00C0-\u017F]` : c).join('')).join('\\W+') + ')', 'g');
      h = h.replace(rx, '<mark>$1</mark>');
    });
    return h;
  };
  const ligne = c => {
    const p = S.pers[c.personne];
    return `<div class="verdict" data-cle="${c.cle}">
      <div class="source">${fdate(c.date)}<br>${NOM_SOURCE[c.source] || c.source}${c.type !== 'fait' ? `<br>(${NOM_TYPE[c.type].toLowerCase()})` : ''}</div>
      <div><div>${surligner(c.texte)}</div>
        ${c.statut === 'a_confirmer' ? aideTri(c.aide) : ''}
        <div class="source">${p ? `<a href="#/p/${p.id}">${esc(p.nom)}</a> · ${esc((S.partis[p.parti] || {}).sigle || '')}` : esc(c.personne)}${maintenue(a, c) ? ' · maintenue malgré le démenti' : ''} · <a href="${esc(c.url)}" target="_blank" rel="noopener">source</a></div></div>
      <div class="choix">${c.statut === 'a_confirmer'
        ? '<button data-s="confirme" class="principal">Confirmer</button><button data-s="rejete">Écarter</button>'
        : `<span class="petit ${c.statut === 'confirme' ? 'rouge' : 'muet'}">${{ confirme: 'Confirmée', corrige: 'Retirée ou corrigée par l\'auteur', rejete: 'Écartée' }[c.statut]}</span>
           ${c.statut === 'confirme' && c.source === 'reseaux' ? '<button class="discret" data-s="corrige">Retirée par l\'auteur</button>' : ''}
           <button class="discret" data-s="a_confirmer">Annuler</button>`}</div>
    </div>`;
  };
  const nombreFr = n => n == null ? '' : n.toLocaleString('fr-FR');
  const parObjet = {};
  (a.estimations || []).forEach(e => (parObjet[e.objet] = parObjet[e.objet] || []).push(e));
  const signaux = (a.signalements || []).filter(x => x.statut === 'a_examiner');
  const fiche = nouveau ? '' : `
    <div class="carte" style="margin-bottom:14px">
      <div class="etiquette" style="background:var(--v-faux)">Affirmation mensongère</div>
      <h2 style="margin:10px 0 6px">« ${esc(a.affirmation)} »</h2>
      ${a.realite ? `<p><b>En réalité :</b> ${esc(a.realite)}</p>` : ''}
      ${a.nature === 'estimations' ? `
        <h4>Estimations publiées (fourchette la plus large)</h4>
        ${Object.entries(a.fourchettes).map(([o, [lo, hi, u, n]]) => `<p class="petit"><b>${esc(o)} :</b> ${lo === hi ? nombreFr(lo) : `de ${nombreFr(lo)} à ${nombreFr(hi)}`} ${esc(u)} <span class="muet">(${n} source${n > 1 ? 's' : ''})</span></p>`).join('')}
        <table class="petit"><tbody>${Object.entries(parObjet).map(([o, es]) => es.map(e => `<tr>
          <td>${esc(o)}</td><td class="n">${nombreFr(e.min)}${e.max != null && e.max !== e.min ? ' à ' + nombreFr(e.max) : ''} ${esc(e.unite || '')}</td>
          <td>${e.url ? `<a href="${esc(e.url)}" target="_blank" rel="noopener">${esc(e.source)}</a>` : esc(e.source)}${e.annee ? ` (${esc(e.annee)})` : ''}${e.note ? `<div class="muet">${esc(e.note)}</div>` : ''}</td>
          <td><button class="discret" data-signaler-source="${esc(e.url || e.source)}">Signaler</button></td></tr>`).join('')).join('')}</tbody></table>
        <p class="mention">Ces chiffres sont des estimations : aucun ne mesure la réalité exactement. L'affirmation reste contredite par l'ensemble des estimations publiées.</p>` : ''}
      ${a.preuves.length ? `<h4>Sources</h4>${a.preuves.map(u => `<div class="compte"><a href="${esc(u)}" target="_blank" rel="noopener">${esc(u.replace(/^https?:\/\/(www\.)?/, '').slice(0, 70))}</a><button class="discret" style="margin-left:auto" data-signaler-source="${esc(u)}">Signaler</button></div>`).join('')}` : ''}
      <p class="mention">${esc(a.origine || '')}${a.dementi ? ` · démenti public depuis le ${fdate(a.dementi)}` : ''} · <button class="discret" id="signaler">Signaler une erreur</button></p>
      ${signaux.length && !publique ? `<h4>Signalements à examiner</h4>${signaux.map(x => `<div class="verdict">
        <div class="source">${esc(x.date.slice(0, 10))}<br>${x.cible === 'source' ? 'Source' : 'Affirmation'}</div>
        <div>${esc(x.commentaire) || '<span class="muet">Sans commentaire</span>'}${x.url ? `<div class="source">${esc(x.url)}</div>` : ''}</div>
        <div class="choix"><button data-signal="${x.id}" data-st="retenu">Retenu</button><button class="discret" data-signal="${x.id}" data-st="ecarte">Écarté</button></div></div>`).join('')}` : ''}
    </div>`;
  const estimTexte = (a.estimations || []).map(e => [e.objet, e.min ?? '', e.max ?? '', e.unite || '', e.source, e.annee || '', e.url || '', e.note || ''].join(' | ')).join('\n');
  v.innerHTML = `
    <div class="entete"><div><div class="muet petit"><a href="${publique ? '#/affirmations' : '#/atelier/registre'}">${publique ? 'Affirmations' : 'Registre'}</a></div><h1>${nouveau ? 'Nouvelle affirmation' : 'Affirmation'}</h1></div></div>
    ${fiche}
    ${publique ? listePublique(a) : ''}
    <details ${nouveau ? 'open' : ''} ${publique ? 'hidden' : ''} style="margin-bottom:14px"><summary class="petit muet" style="cursor:pointer;margin-bottom:8px">Modifier</summary>
    <form class="carte grille-form" id="f-aff">
      <label class="petit muet">Affirmation fausse<textarea name="affirmation" required style="min-height:60px">${esc(a.affirmation)}</textarea></label>
      <label class="petit muet">Ce qui est vrai<textarea name="realite" style="min-height:50px">${esc(a.realite)}</textarea></label>
      <div class="rangee">
        <label class="petit muet">Preuves (un lien par ligne)<textarea name="preuves" style="min-height:50px">${esc(a.preuves.join('\n'))}</textarea></label>
        <label class="petit muet" style="flex:none">Démenti public depuis le<input type="date" name="dementi" value="${esc(a.dementi)}"></label>
      </div>
      <div class="rangee">
        <label class="petit muet">Mots-clés : une ligne par élément obligatoire, variantes séparées par |
          <textarea name="groupes" placeholder="révolution française | révolution de 1789&#10;1515" style="min-height:70px">${esc(groupesTexte(a.groupes))}</textarea></label>
        <label class="petit muet">Exclusions (une par ligne)<textarea name="exclusions" placeholder="pas en 1515&#10;contrairement" style="min-height:70px">${esc(a.exclusions.join('\n'))}</textarea></label>
      </div>
      <label class="petit muet">Nature
        <select name="nature"><option value="etabli" ${a.nature !== 'estimations' ? 'selected' : ''}>Fait établi</option><option value="estimations" ${a.nature === 'estimations' ? 'selected' : ''}>Fondé sur des estimations</option></select></label>
      <label class="petit muet">Estimations, une par ligne : objet | min | max | unité | source | année | lien | note
        <textarea name="estimations" style="min-height:80px" placeholder="Fraude fiscale | 80 | 100 | Md€ par an | Solidaires Finances publiques | 2018 | https://… | estimation syndicale">${esc(estimTexte)}</textarea></label>
      <label class="petit"><input type="checkbox" name="ordre" ${a.ordre ? 'checked' : ''}> Mots-clés dans cet ordre (pour une comparaison : « A … plus que … B »)</label>
      <label class="petit"><input type="checkbox" name="actif" ${a.actif ? 'checked' : ''}> En service (cherche les répétitions)</label>
      <div class="rangee" style="justify-content:flex-start">
        <button class="principal">Enregistrer</button><button type="button" id="tester">Tester les mots-clés</button>
        ${nouveau ? '' : '<button type="button" class="discret" id="suppr">Supprimer</button>'}
      </div>
      <div id="test" class="petit"></div>
    </form></details>
    ${nouveau || publique ? '' : `<div class="carte">
      <h3>Phrases trouvées</h3>
      <p class="mention">Confirmer seulement si la personne affirme bien la chose comme un fait (pas si elle la cite, la dément ou s'interroge). Les mentions « À vérifier » sont des indices repérés automatiquement (tournures comme « je cite », « selon M. X », « comme l'a dit », guillemets), pas des décisions. Quand une personne citée est identifiée, Beau Discours cherche son propos d'origine dans tout ce qui a été collecté : s'il est retrouvé, c'est à elle que la répétition peut être attribuée.</p>
      ${corr.map(ligne).join('') || '<p class="muet">Aucune phrase trouvée avec ces mots-clés.</p>'}</div>`}`;
  const lireForm = f => ({
    id: nouveau ? undefined : aid, affirmation: f.affirmation.value, realite: f.realite.value,
    preuves: f.preuves.value.split('\n'), dementi: f.dementi.value,
    groupes: texteGroupes(f.groupes.value), exclusions: f.exclusions.value.split('\n'), actif: f.actif.checked,
    origine: nouveau ? 'Saisie' : undefined, nature: f.nature.value, ordre: f.ordre.checked,
    estimations: f.estimations.value.split('\n').map(l => l.split('|').map(x => x.trim())).filter(c => c.length >= 5 && c[4]).map(c => {
      const nb = x => x === '' || x == null ? null : parseFloat(x.replace(/\s/g, '').replace(',', '.'));
      return { objet: c[0], min: nb(c[1]), max: nb(c[2]), unite: c[3], source: c[4], annee: c[5] || '', url: c[6] || '', note: c[7] || '' };
    }),
  });
  const f = $('#f-aff');
  f.onsubmit = async e => {
    e.preventDefault();
    const r = await api('/api/registre/enregistrer', lireForm(f));
    await charger();
    if (nouveau) location.hash = '#/atelier/registre/' + r.id; else vueAffirmation(v, aid);
  };
  $('#tester').onclick = async () => {
    const x = lireForm(f);
    if (!x.groupes.length) { $('#test').textContent = 'Ajoute au moins un mot-clé.'; return; }
    const r = await api('/api/registre/tester', x);
    $('#test').innerHTML = `<b>${r.n}</b> phrase${r.n > 1 ? 's' : ''} correspondante${r.n > 1 ? 's' : ''}${r.n ? ' :' : '.'}`
      + r.exemples.map(c => `<div class="source">${fdate(c.date)} · ${esc(S.pers[c.personne]?.nom || '')} · ${esc(c.texte.slice(0, 160))}</div>`).join('');
  };
  if (!nouveau) $('#suppr').onclick = async () => {
    if (!confirm('Supprimer cette affirmation et ses correspondances ?')) return;
    await api('/api/registre/supprimer', { id: aid }); await charger(); location.hash = '#/atelier/registre';
  };
  const signaler = async (cible, url) => {
    if (STATIQUE) {  // site public : le signalement part par courriel, rien n'est stocké en ligne
      const corps = `Affirmation : ${a.affirmation}\nPage : ${location.href}\n${url ? 'Source contestée : ' + url + '\n' : ''}\nCe qui est erroné (source à l'appui si possible) :\n`;
      location.href = `mailto:${CONTACT}?subject=${encodeURIComponent('Signalement : ' + a.affirmation.slice(0, 80))}&body=${encodeURIComponent(corps)}`;
      return;
    }
    const c = prompt(cible === 'source' ? 'Qu\'est-ce qui est erroné dans cette source ?' : 'Qu\'est-ce qui est erroné ? (source à l\'appui si possible)');
    if (c === null) return;
    await api('/api/registre/signaler', { affirmation: aid, cible, url, commentaire: c });
    await charger(); vueAffirmation(v, aid, publique);
  };
  if (!nouveau) {
    $('#signaler').onclick = () => signaler('affirmation', '');
    v.querySelectorAll('[data-signaler-source]').forEach(b => b.onclick = () => signaler('source', b.dataset.signalerSource));
    v.querySelectorAll('[data-signal]').forEach(b => b.onclick = async () => {
      await api('/api/registre/signalement', { id: b.dataset.signal, statut: b.dataset.st });
      await charger(); vueAffirmation(v, aid);
    });
  }
  v.querySelectorAll('[data-cle] [data-s]').forEach(b => b.onclick = async () => {
    await api('/api/registre/statut', { cle: b.closest('[data-cle]').dataset.cle, statut: b.dataset.s });
    await charger(); vueAffirmation(v, aid);
  });
}

// Répétitions confirmées d'une affirmation, pour le public.
function listePublique(a) {
  const conf = a.correspondances.filter(c => ['confirme', 'corrige'].includes(c.statut)).sort((x, y) => y.date.localeCompare(x.date));
  const elus = new Set(conf.map(c => c.personne));
  const apres = conf.filter(c => maintenue(a, c)).length;
  return `<div class="carte" style="margin-bottom:14px">
    <h3>Qui l'a répétée</h3>
    ${conf.length ? `<p class="petit"><b class="rouge">${conf.length} fois</b> par ${elus.size} personnalité${elus.size > 1 ? 's' : ''}${apres ? `, dont ${apres} maintenue${apres > 1 ? 's' : ''} malgré le démenti (répétée après lui, ou laissée en ligne sans correction)` : ''}.</p>
    ${conf.map(c => {
      const p = S.pers[c.personne];
      return `<div class="verdict"><div class="source">${fdate(c.date)}<br>${NOM_SOURCE[c.source] || c.source}</div>
        <div><div class="citation">${esc(c.texte)}</div>
        <div class="source">${p ? `<a href="#/p/${p.id}">${esc(p.nom)}</a> · ${esc((S.partis[p.parti] || {}).sigle || '')}` : ''}${maintenue(a, c) ? ' · <span class="rouge">maintenue malgré le démenti</span>' : ''}${c.statut === 'corrige' ? ' · retirée ou corrigée par son auteur' : ''}</div></div>
        <a class="source" href="${esc(c.url)}" target="_blank" rel="noopener">source</a></div>`;
    }).join('')}` : '<p class="muet">Aucune répétition confirmée pour l\'instant.</p>'}
  </div>`;
}

function vueAffirmationPub(v, aid) { return vueAffirmation(v, aid, true); }

async function vueAffirmationsPub(v) {
  v.innerHTML = '<p class="vide-etat">Chargement…</p>';
  const liste = (await api('/api/registre')).filter(a => a.actif);
  const parAff = {};
  S.d.faussetes.forEach(l => {
    const x = parAff[l[1]] = parAff[l[1]] || { n: 0, apres: 0, elus: new Set() };
    x.n++; if (l[4]) x.apres++; x.elus.add(l[0]);
  });
  liste.sort((a, b) => (parAff[b.id]?.n || 0) - (parAff[a.id]?.n || 0));
  v.innerHTML = `
    <div class="entete"><div><h1>Affirmations mensongères</h1>
      <div class="muet petit">Affirmations contredites par les sources, et les personnalités qui les répètent</div></div></div>
    ${liste.map(a => {
      const x = parAff[a.id];
      return `<a class="carte affirmation" href="#/affirmation/${a.id}">
        <div class="rangee" style="align-items:flex-start">
          <div style="flex:1"><div class="citation" style="font-size:17px">${esc(a.affirmation)}</div>
            ${a.realite ? `<div class="petit" style="margin-top:6px"><b>En réalité :</b> ${esc(a.realite)}</div>` : ''}</div>
          <div class="compteur" style="flex:none">${x ? `<b>${x.n}</b><span>répétition${x.n > 1 ? 's' : ''}<br>${x.elus.size} élu${x.elus.size > 1 ? 's' : ''}${x.apres ? `, ${x.apres} malgré le démenti` : ''}</span>` : '<b>0</b><span>répétition confirmée</span>'}</div>
        </div>
        ${a.nature === 'estimations' ? '<div class="mention">Fondé sur des estimations</div>' : ''}
      </a>`;
    }).join('') || '<p class="vide-etat">Aucune affirmation en service.</p>'}`;
}

function vuePersonnalites(v) {
  const q = S.requete;
  const filtre = { texte: q.get('q') || '', parti: q.get('parti') || '', type: q.get('type') || '', tri: q.get('tri') || 'mensonges' };
  const lignes = surTout(() => S.d.personnes.filter(p => p.categorie !== 'media').map(p => ({
    p, fx: faussetesDe(l => l[0] === p.id).n, ab: abonnesDe([p.id]).total, tv: mediasDe([p.id]).total,
    pres: presenceDe(p.id), c: compter(S.d.verdicts.filter(x => x.personne === p.id)),
  })));
  const vis = lignes.filter(l => (!filtre.texte || norm(l.p.nom).includes(norm(filtre.texte)))
    && (!filtre.parti || l.p.parti === filtre.parti)
    && (!filtre.type || (filtre.type === 'deputes') === l.p.id.startsWith('PA')));
  const tris = {
    mensonges: (a, b) => b.fx - a.fx || nonFiables(b.c) - nonFiables(a.c) || b.ab - a.ab,
    abonnes: (a, b) => b.ab - a.ab, antenne: (a, b) => b.tv - a.tv,
    absences: (a, b) => (a.pres?.sol ?? 2) - (b.pres?.sol ?? 2), nom: (a, b) => a.p.nom_famille.localeCompare(b.p.nom_famille),
  };
  vis.sort(tris[filtre.tri] || tris.mensonges);
  v.innerHTML = `
    <div class="entete"><div><h1>Personnalités</h1><div class="muet petit">${vis.length} sur ${lignes.length}</div></div></div>
    <form class="rangee filtres-liste" id="f-liste" style="margin-bottom:14px">
      <input name="q" type="search" placeholder="Nom" value="${esc(filtre.texte)}">
      <select name="parti"><option value="">Tous les partis</option>${S.d.partis.map(p => `<option value="${p.id}" ${filtre.parti === p.id ? 'selected' : ''}>${esc(p.nom)}</option>`).join('')}</select>
      <select name="type"><option value="">Toutes fonctions</option><option value="deputes" ${filtre.type === 'deputes' ? 'selected' : ''}>Députés</option><option value="autres" ${filtre.type === 'autres' ? 'selected' : ''}>Hors Assemblée</option></select>
      <select name="tri">${[['mensonges', 'Trier : affirmations mensongères'], ['abonnes', 'Trier : abonnés'], ['antenne', 'Trier : télé et radio'], ['absences', 'Trier : absences aux votes'], ['nom', 'Trier : nom']].map(([k, n]) => `<option value="${k}" ${filtre.tri === k ? 'selected' : ''}>${n}</option>`).join('')}</select>
    </form>
    <div class="carte" style="overflow-x:auto"><table>
      <thead><tr><th>Personnalité</th><th>Parti</th><th class="n">Mensongères</th><th class="n">Non fiables</th><th class="n">Abonnés</th><th class="n">Télé/radio</th><th class="n">Votes sol.</th></tr></thead>
      <tbody>${vis.slice(0, 300).map(l => `<tr class="clic" data-href="#/p/${l.p.id}">
        <td>${esc(l.p.nom)}<div class="muet petit">${esc(l.p.fonction || '')}</div></td>
        <td><span class="badge"><i style="background:${(S.partis[l.p.parti] || S.partis.autres).couleur}"></i>${esc((S.partis[l.p.parti] || S.partis.autres).sigle)}</span></td>
        <td class="n${l.fx ? ' rouge' : ''}">${l.fx || ''}</td>
        <td class="n">${l.c.n ? `${nonFiables(l.c)} / ${l.c.n}` : ''}</td>
        <td class="n">${l.ab ? nbCourt(l.ab) : ''}</td>
        <td class="n">${l.tv ? heures(l.tv) : ''}</td>
        <td class="n">${l.pres?.sol != null ? pct(l.pres.sol, 1) + ' %' : ''}</td></tr>`).join('')}</tbody></table>
      ${vis.length > 300 ? '<p class="mention">300 premières lignes : affine la recherche.</p>' : ''}</div>`;
  const f = $('#f-liste');
  const appliquer = () => {
    const p = new URLSearchParams([...new FormData(f)].filter(([, x]) => x));
    location.hash = '#/personnalites' + (p.toString() ? '?' + p : '');
  };
  f.onchange = appliquer;
  f.onsubmit = e => { e.preventDefault(); appliquer(); };
  v.querySelectorAll('tr[data-href]').forEach(tr => tr.onclick = () => location.hash = tr.dataset.href);
}

// ---------- Médias : groupes propriétaires, rédactions, intervenants ----------
function vueMedias(v) {
  const vs = verdicts(), ps = propos(), ls = lignesPhrases();
  const stats = id => {
    const x = { p: S.partis[id], ...statsParti(id, vs, ps, ls) };
    const ids = x.membres.map(m => m.id);
    x.md = { total: 0 }; x.pr = presseDe(ids); x.ab = abonnesDe(ids).total;
    x.posts = postsDe(ids); x.fiab = fiabiliteEns(ids);
    x.fx = faussetesDe(l => membresDe(id).includes(l[5]));
    return x;
  };
  // Les plus gros d'abord : groupes, puis rédactions dans chaque groupe, par posts cumulés.
  const groupes = (S.d.groupes_medias || []).map(g => ({ g, x: stats(g.id), red: g.medias.map(stats).sort((a, b) => b.posts - a.posts || b.membres.length - a.membres.length) }))
    .sort((a, b) => /non renseign/i.test(a.g.nom) - /non renseign/i.test(b.g.nom) || b.x.posts - a.x.posts || b.x.membres.length - a.x.membres.length);  // « non renseigné » en dernier
  const n = S.d.personnes.filter(p => p.categorie === 'media').length;
  v.innerHTML = `
    <div class="entete">
      <div><h1>Médias</h1><div class="muet petit">${n} journalistes, éditorialistes et chroniqueurs suivis · par groupe propriétaire et par rédaction</div></div>
      <div class="filtres">${filtresPeriode()}${filtresSource()}</div>
    </div>
    ${!groupes.length ? '<p class="vide-etat">Aucun intervenant retenu pour l\'instant.</p>' : groupes.map(({ g, x, red }) => `<section class="groupe-media">
        <div class="rangee" style="justify-content:space-between;align-items:center">
          <h2 style="flex:none"><a href="#/media/${g.id}"><span class="badge"><i style="background:${g.couleur}"></i>${esc(g.nom)}</span></a></h2>
          <span class="muet petit" style="flex:none">${x.membres.length} intervenant${x.membres.length > 1 ? 's' : ''} · ${x.posts.toLocaleString('fr-FR')} posts${x.fiab.n ? ` · ${x.fiab.faux} / ${x.fiab.n} analysés avec une fausse information` : ''}${x.ab ? ` · ${nbCourt(x.ab)} abonnés` : ''}</span>
          ${pastilleFiab(x.fiab, 'moyen')}
        </div>
        <div class="grille">${red.map(carteParti).join('')}</div>
      </section>`).join('')}
    <p class="mention">Le média retenu est celui où l'intervenant s'exprime principalement aujourd'hui ; le propriétaire est celui qui contrôle le média (sources en lien sur chaque groupe). Les statistiques des médias ne sont jamais mêlées à celles des partis.</p>`;
  brancherFiltres(v);
}

async function vueIntervenants(v) {
  v.innerHTML = '<p class="vide-etat">Chargement…</p>';
  const d = await api('/api/intervenants');
  const etat = S.triInter = S.triInter || { vue: Object.values(d.tri).some(t => t.statut === 'propose') ? 'propose' : '', q: '', politique: true, page: 0 };
  if (S.requete.get('q')) Object.assign(etat, { q: S.requete.get('q'), vue: d.tri[S.requete.get('qid')]?.statut ?? etat.vue, page: 0 });
  const etapes = t => t.parcours || [{ media: t.media, depuis: null }];
  const parcoursHtml = t => {
    const e = etapes(t);
    return `<div class="petit">Média : <b>${esc(e.at(-1).media || 'non renseigné')}</b>${e.at(-1).depuis ? ` depuis le ${fdate(e.at(-1).depuis)}` : ''}${e.length > 1 ? ` · avant : ${e.slice(0, -1).reverse().map(x => `${esc(x.media || 'non renseigné')}${x.depuis ? ` (depuis le ${fdate(x.depuis)})` : ''}`).join(', ')}` : ''}</div>`;
  };
  const statut = c => d.tri[c.wikidata]?.statut || '';
  const suggere = c => c.suggestion || '';  // seulement un média connu (pas une université)
  const rendre = () => {
    const liste = d.candidats.filter(c => statut(c) === etat.vue && (!etat.politique || etat.vue || c.politique)
      && (!etat.q || norm(c.nom).includes(norm(etat.q))));
    const page = liste.slice(etat.page * 40, etat.page * 40 + 40);
    const nb = s => d.candidats.filter(c => statut(c) === s).length;
    v.innerHTML = `
      <p class="muet petit">Pré-liste Wikidata (${d.candidats.length} personnes, mise à jour du ${fdate((d.maj || '').slice(0, 10))}) : journalistes, chroniqueurs, animateurs et essayistes ayant un compte X ou Bluesky. Seuls les intervenants retenus sont suivis et publiés. Indique le média où chacun s'exprime aujourd'hui : Wikidata n'en propose qu'une piste, souvent datée.</p>
      <div class="rangee" style="margin:10px 0">
        <div class="segments" id="iv-vue">${[['propose', 'Proposés', nb('propose')], ['', 'À trier', nb('')], ['garde', 'Retenus', nb('garde')], ['ecarte', 'Écartés', nb('ecarte')]].filter(([k, , x]) => k !== 'propose' || x).map(([k, n, x]) => `<button data-val="${k}" class="${etat.vue === k ? 'actif' : ''}">${n} (${x})</button>`).join('')}</div>
        <input id="iv-q" type="search" placeholder="Nom" value="${esc(etat.q)}" style="max-width:220px">
        ${etat.vue ? '' : `<label class="petit"><input type="checkbox" id="iv-pol" ${etat.politique ? 'checked' : ''}> profil politique d'abord (éditorialistes, chroniqueurs, polémistes…)</label>`}
      </div>
      <form id="iv-ajout" class="rangee" style="margin:0 0 12px">
        <input name="nom" placeholder="Ajouter : nom ou QID Wikidata" required style="max-width:240px">
        <input name="media" list="iv-medias" placeholder="Média principal" style="max-width:180px">
        <input name="x" placeholder="Compte X (si absent de Wikidata)" style="max-width:220px">
        <button>Ajouter</button><span id="iv-ajout-msg" class="petit"></span>
      </form>
      <datalist id="iv-medias">${d.medias.map(m => `<option value="${esc(m)}">`).join('')}</datalist>
      <div class="carte">${page.map(c => `
        <div class="iv-ligne" data-q="${c.wikidata}">
          ${c.image ? `<img src="${esc(c.image)}" alt="" loading="lazy">` : `<span class="ini">${esc(c.nom.split(' ').map(x => x[0]).join('').slice(0, 2))}</span>`}
          <div class="iv-texte"><b>${esc(c.nom)}</b> <span class="muet petit">${c.suivis ? nbCourt(c.suivis) + ' abonnés' : ''}</span>
            <div class="muet petit">${esc(c.description || '')} · ${esc(c.professions.join(', '))}</div>
            ${statut(c) === 'garde' ? parcoursHtml(d.tri[c.wikidata]) : ''}
            ${d.tri[c.wikidata]?.note ? `<div class="petit${d.tri[c.wikidata].note.startsWith('à vérifier') ? ' rouge' : ''}">${esc(d.tri[c.wikidata].note)}</div>` : ''}
            <div class="muet petit">${c.employeurs.length ? 'Wikidata : ' + c.employeurs.slice(0, 4).map(e => esc(e.nom) + (e.fin ? ` (jusqu'en ${e.fin.slice(0, 4)})` : '')).join(', ') : ''}
              ${c.wikipedia ? ` · <a href="${esc(c.wikipedia)}" target="_blank" rel="noopener">Wikipédia</a>` : ''}</div></div>
          <input class="iv-media" list="iv-medias" placeholder="Média principal" value="${esc(statut(c) === 'garde' ? d.tri[c.wikidata].media || '' : d.tri[c.wikidata]?.media || suggere(c))}">
          ${statut(c) === 'garde' ? `<label class="petit iv-date">depuis le <input type="date" class="iv-depuis"></label>` : ''}
          <div class="iv-boutons">
            ${statut(c) !== 'garde' ? '<button data-s="garde" class="principal">Retenir</button><button data-s="garde" data-sans="1">Retenir sans média</button>' : ''}
            ${statut(c) === 'garde' ? '<button data-maj="1" class="principal" title="Avec une date : changement de média, l’ancien reste dans son parcours. Sans date : correction du média actuel.">Enregistrer le média</button>' : ''}
            ${statut(c) !== 'ecarte' ? '<button data-s="ecarte">Écarter</button>' : ''}
            ${statut(c) && statut(c) !== 'propose' ? '<button data-s="">Remettre à trier</button>' : ''}
          </div>
        </div>`).join('') || '<p class="muet">Rien ici.</p>'}</div>
      <div class="rangee" style="margin-top:10px">
        ${etat.page ? '<button id="iv-prec">Précédents</button>' : ''}
        <span class="muet petit">${liste.length ? `${etat.page * 40 + 1}–${etat.page * 40 + page.length} sur ${liste.length}` : ''}</span>
        ${(etat.page + 1) * 40 < liste.length ? '<button id="iv-suiv">Suivants</button>' : ''}
      </div>`;
    $('#iv-ajout', v).onsubmit = async e => {
      e.preventDefault();
      const f = e.target, msg = $('#iv-ajout-msg', v);
      msg.textContent = 'Recherche dans Wikidata…';
      const r = await api('/api/intervenants/ajouter', Object.fromEntries(new FormData(f)));
      if (r.erreur) { msg.textContent = r.erreur; return; }
      d.candidats = [r.candidat, ...d.candidats.filter(c => c.wikidata !== r.candidat.wikidata)];
      if (d.tri[r.candidat.wikidata]?.statut !== 'garde') d.tri[r.candidat.wikidata] = { statut: 'propose', media: f.media.value, note: 'ajouté à la main' };
      etat.vue = d.tri[r.candidat.wikidata].statut; etat.q = r.candidat.nom; etat.page = 0;
      rendre();
    };
    v.querySelectorAll('#iv-vue button').forEach(b => b.onclick = () => { etat.vue = b.dataset.val; etat.page = 0; rendre(); });
    $('#iv-q', v).onchange = e => { etat.q = e.target.value; etat.page = 0; rendre(); };
    if ($('#iv-pol', v)) $('#iv-pol', v).onchange = e => { etat.politique = e.target.checked; etat.page = 0; rendre(); };
    if ($('#iv-prec', v)) $('#iv-prec', v).onclick = () => { etat.page--; rendre(); };
    if ($('#iv-suiv', v)) $('#iv-suiv', v).onclick = () => { etat.page++; rendre(); };
    v.querySelectorAll('.iv-ligne').forEach(l => l.querySelectorAll('button[data-s]').forEach(b => b.onclick = async () => {
      const media = b.dataset.sans ? '' : $('.iv-media', l).value.trim();
      if (b.dataset.s === 'garde' && !media && !b.dataset.sans) { $('.iv-media', l).focus(); return; }
      const r = await api('/api/intervenants/trier', { qid: l.dataset.q, statut: b.dataset.s, media });
      if (b.dataset.s) d.tri[l.dataset.q] = r.tri; else delete d.tri[l.dataset.q];
      l.remove();
      S.aRecharger = true;
    }));
    // Retenus : le média évolue avec la carrière. Une date = changement (l'ancien média garde les
    // propos d'avant) ; sans date = correction du média actuel.
    v.querySelectorAll('.iv-ligne button[data-maj]').forEach(b => b.onclick = async () => {
      const l = b.closest('.iv-ligne');
      const r = await api('/api/intervenants/trier', { qid: l.dataset.q, statut: 'garde', media: $('.iv-media', l).value.trim(), changement: $('.iv-depuis', l).value });
      if (r.erreur) { alert(r.erreur); return; }
      d.tri[l.dataset.q] = r.tri;
      S.aRecharger = true;
      rendre();
    });
  };
  rendre();
}

// ---------- Accueil : les chiffres qui frappent ----------
// ---------- Posts analysés et fiabilité ----------
// S.d.posts_ia : [personne, date, statut, clé, thèmes] ; statut faux, inverifiable, correct ou null
// (rien de vérifiable). Score de fiabilité = 100 − part des posts analysés qui contiennent une
// fausse information.
const STATUT_POST = {
  faux: ['Contient une fausse information', 'rouge'], inverifiable: ['Invérifiable', 'orange'], correct: ['Correct', 'vert'],
};
const MIN_POSTS_SCORE = 10;   // en dessous, pas de score : l'échantillon est trop petit
function fiabiliteEns(ids) {
  const ens = new Set(ids);
  const ps = (S.d.posts_ia || []).filter(l => ens.has(l[0]));
  const faux = ps.filter(l => l[2] === 'faux').length;
  return { n: ps.length, faux, score: ps.length >= MIN_POSTS_SCORE ? Math.round(100 * (1 - faux / ps.length)) : null };
}
const fiabiliteDe = id => fiabiliteEns([id]);
const couleurScore = sc => sc == null ? '' : sc >= 75 ? 'vert' : sc >= 50 ? 'orange' : 'rouge';
// taille : 'grand' (en-tête de fiche), 'moyen' (carte), sinon petit (listes).
function pastilleFiab(f, taille) {
  const grand = taille === 'grand' || taille === true;
  if (f.score == null) return taille ? `<div class="score score-vide${grand ? '' : ' moyen-score'}" title="Moins de ${MIN_POSTS_SCORE} posts analysés"><b>–</b>${grand ? '<span>fiabilité</span>' : ''}</div>` : '';
  return `<div class="score halo-${couleurScore(f.score)}${grand ? '' : taille === 'moyen' ? ' moyen-score' : ' petit-score'}" title="Fiabilité : ${f.faux} post${f.faux > 1 ? 's' : ''} avec une fausse information sur ${f.n} analysés"><b>${f.score}</b>${grand ? '<span>fiabilité</span>' : ''}</div>`;
}
const pastilleScore = (id, taille) => pastilleFiab(fiabiliteDe(id), taille);

function vueAccueil(v) {
  const st = surTout(() => {
    const posts = (S.d.posts_ia || []).filter(l => !estMedia(l[0]));
    const faux = posts.filter(l => l[2] === 'faux');
    const themes = {};
    faux.forEach(l => (l[4] || []).forEach(t => themes[t] = (themes[t] || 0) + 1));
    const theme = Object.entries(themes).sort((x, y) => y[1] - x[1])[0];
    // Temps de parole : toutes les personnalités politiques relevées par l'Arcom, suivies ou non.
    const dernier = S.d.medias_mois.slice(-3);
    const parNom = {};
    dernier.forEach(m => (S.d.medias_tous[m] || []).forEach(([nom, sec]) => { parNom[nom] = (parNom[nom] || 0) + sec; }));
    const index = Object.fromEntries(S.d.personnes.map(p => [norm(p.nom).replace(/-/g, ' ').split(' ').sort().join(' '), p.id]));
    const antenne = Object.entries(parNom).sort((x, y) => y[1] - x[1])
      .map(([nom, sec]) => [index[norm(nom).replace(/-/g, ' ').split(' ').filter(Boolean).sort().join(' ')] || null, sec, nom]);
    // Presse : articles qui citent la personnalité sur les trois derniers mois relevés.
    const moisPresse = [...new Set(Object.values(S.d.presse).flatMap(p => Object.keys(p.mois)))].sort().slice(-3);
    const presse = Object.entries(S.d.presse).filter(([id]) => S.pers[id] && !estMedia(id))
      .map(([id, p]) => [id, moisPresse.reduce((n, m) => n + (p.mois[m] || 0), 0)]).filter(x => x[1]).sort((x, y) => y[1] - x[1]);
    return { posts, faux, theme, antenne, dernier, presse, moisPresse };
  });
  const ligneP = (id, droite) => {
    const p = S.pers[id], pa = S.partis[p.parti] || S.partis.autres;
    return `<a class="ligne-p" href="#/p/${id}">${p.image ? `<img src="${esc(p.image)}" alt="" loading="lazy">` : `<span class="ini">${esc(initiales(p))}</span>`}
      <span class="nom">${esc(p.nom)}<span class="muet petit"> · ${esc(pa.sigle)}</span></span>${pastilleScore(id)}<span class="droite">${droite}</span></a>`;
  };
  const nonSuivi = (nom, droite) => `<div class="ligne-p"><span class="ini">${esc(nom.split(' ').map(x => x[0]).join('').slice(0, 2))}</span><span class="nom">${esc(nom.split(' ').slice(1).join(' ') + ' ' + nom.split(' ')[0].charAt(0) + nom.split(' ')[0].slice(1).toLowerCase())}<span class="muet petit"> · non suivi</span></span><span class="droite">${droite}</span></div>`;
  const periodeArcom = st.dernier.length ? `${fdate(st.dernier[0])} – ${fdate(st.dernier.at(-1))}` : '';
  const nomTheme = st.theme ? (S.d.theme_noms[st.theme[0]] || st.theme[0]) : '';
  v.innerHTML = `
    <section class="presentation">
      <h1>Ce que disent les responsables politiques, vérifié.</h1>
      <p>Beau Discours relève ce que publient et déclarent les personnalités politiques françaises : réseaux sociaux, hémicycle, presse, télévision et radio. Chaque post est découpé en affirmations, et chaque affirmation est confrontée aux sources : chiffres officiels, articles de presse, propos d'origine.</p>
      <p>L'objectif : que chacun puisse savoir, en un coup d'œil, qui dit vrai, qui se trompe et qui désinforme, avec les preuves sous les yeux.</p>
      <p class="muet">Un outil communautaire : quand aucune source fiable ne permet de trancher, c'est au public d'apporter les siennes. Les verdicts sont établis automatiquement à partir des sources citées ; des erreurs sont possibles, et elles sont corrigées dès qu'elles sont signalées.</p>
    </section>
    <div class="chocs">
      <a class="choc-tuile" href="#/posts"><b>${st.posts.length.toLocaleString('fr-FR')}</b><span>posts de personnalités politiques analysés</span></a>
      <a class="choc-tuile choc-rouge" href="#/posts?statut=faux"><b>${st.faux.length.toLocaleString('fr-FR')}</b><span>contiennent une fausse information${st.posts.length ? ` (${pct(st.faux.length, st.posts.length)} %)` : ''}</span></a>
      <a class="choc-tuile" href="${st.theme ? `#/posts?statut=faux&theme=${encodeURIComponent(st.theme[0])}` : '#/posts?statut=faux'}"><b>${esc(nomTheme) || '–'}</b><span>${st.theme ? `le thème le plus touché par la désinformation (${st.theme[1]} post${st.theme[1] > 1 ? 's' : ''})` : 'thème le plus touché par la désinformation'}</span></a>
    </div>
    <h2 class="titre-section">Les plus présents dans les médias</h2>
    <div class="deux">
      <div class="carte"><h3>Télévision et radio</h3>
        ${st.antenne.slice(0, 10).map(([id, sec, nom]) => id ? ligneP(id, `<b>${heures(sec)}</b>`) : nonSuivi(nom, `<b>${heures(sec)}</b>`)).join('')}
        <p class="mention">Temps de parole relevé par l'Arcom${periodeArcom ? `, ${periodeArcom}` : ''}.</p></div>
      <div class="carte"><h3>Presse écrite</h3>
        ${st.presse.slice(0, 10).map(([id, n]) => ligneP(id, `<b>${n}</b><br><span class="muet petit">article${n > 1 ? 's' : ''}</span>`)).join('') || '<p class="muet petit">Pas encore de relevé.</p>'}
        <p class="mention">Articles de presse qui citent la personnalité${st.moisPresse.length ? `, ${fdate(st.moisPresse[0])} – ${fdate(st.moisPresse.at(-1))}` : ''}.</p></div>
    </div>`;
}

// Tous les posts analysés, du plus récent au plus ancien, avec un halo selon le verdict.
const PAR_PAGE_POSTS = 30;
async function vuePosts(v) {
  v.innerHTML = '<p class="vide-etat">Chargement…</p>';
  const tous = S.postsPublics || (S.postsPublics = await api('/api/posts'));
  const q = S.requete;
  const statut = q.get('statut') || '', theme = q.get('theme') || '', qui = q.get('personne') || '';
  const parti = q.get('parti') || '', media = q.get('media') || '';
  const themesPost = Object.fromEntries((S.d.posts_ia || []).map(l => [l[3], l[4] || []]));
  // Parti ou média (rédaction, ou groupe propriétaire et toutes ses rédactions) de l'auteur.
  const dans = (pe, ens) => !!pe && membresDe(ens).includes(pe.parti);
  const filtre = p => (!theme || (themesPost[p.cle] || []).includes(theme)) && (!qui || p.personne === qui)
    && (!parti || dans(S.pers[p.personne], parti)) && (!media || dans(S.pers[p.personne], media));
  const vis = tous.filter(p => (!statut || p.statut === statut) && filtre(p));
  const lien = (k, val) => { const r = new URLSearchParams(q); val ? r.set(k, val) : r.delete(k); r.delete('page'); const t = r.toString(); return '#/posts' + (t ? '?' + t : ''); };
  const nb = st => tous.filter(p => p.statut === st && filtre(p)).length;
  // Listes des filtres : seulement ce qui a des posts analysés.
  const auteurs = [...new Set(tous.map(p => p.personne))].map(i => S.pers[i]).filter(Boolean);
  const themesDispo = [...new Set(tous.flatMap(p => themesPost[p.cle] || []))].sort((a, b) => (S.d.theme_noms[a] || a).localeCompare(S.d.theme_noms[b] || b));
  const partisDispo = S.d.partis.filter(x => !estCollectifMedia(x.id) && auteurs.some(pe => pe.parti === x.id));
  const mediasDispo = (S.d.groupes_medias || []).flatMap(g => [g, ...g.medias.map(m => S.partis[m]).filter(Boolean)])
    .filter(x => auteurs.some(pe => membresDe(x.id).includes(pe.parti)));
  const choix = (k, val, defaut, options) => `<select data-filtre="${k}"><option value="">${defaut}</option>${options.map(([v2, n]) => `<option value="${esc(v2)}"${v2 === val ? ' selected' : ''}>${esc(n)}</option>`).join('')}</select>`;
  const VERDICT = {
    exact: ['Exact', 'vert'], trompeur: ['Trompeur', 'rouge'], mensonger: ['Faux', 'rouge'],
    non_etaye: ['Non étayé', 'orange'], insuffisant: ['Invérifiable', 'orange'],
  };
  const carte = p => {
    const pe = S.pers[p.personne], pa = pe && (S.partis[pe.parti] || S.partis.autres);
    const [nomSt, coul] = STATUT_POST[p.statut];
    return `<article class="post halo-${coul}">
      <div class="post-tete">
        ${pe ? `<a href="#/p/${pe.id}" class="post-auteur">${pe.image ? `<img src="${esc(pe.image)}" alt="" loading="lazy">` : `<span class="ini">${esc(initiales(pe))}</span>`}<b>${esc(pe.nom)}</b></a><span class="muet petit">${esc(pa.sigle)}</span>` : ''}
        <span class="muet petit">${fdate(p.date)} · <a href="${esc(p.url)}" target="_blank" rel="noopener">voir le post</a></span>
        <span class="etiquette-statut ${coul}">${nomSt}</span>
      </div>
      <div class="post-texte">${esc(p.texte)}</div>
      ${p.affirmations.map(a => {
        const [nv, cv] = VERDICT[a.verdict] || VERDICT.insuffisant;
        return `<div class="post-aff">
          <span class="etiquette-statut ${cv}">${nv}</span> <b>${esc(a.affirmation)}</b>${a.public ? ' <span class="muet petit">· source apportée par le public</span>' : a.valide ? ' <span class="muet petit">· vérifié par l\'équipe</span>' : ''}
          ${a.explication ? `<div class="petit">${esc(a.explication.replace(/^Le modèle penchait[^:]*: /, '').replace(/\s*\[[\d,\s\]\[]+\]/g, ''))}</div>` : ''}
          ${a.passage ? `<blockquote class="petit">« ${esc(a.passage)} »</blockquote>` : ''}
          ${a.sources.length ? `<div class="petit muet">Sources : ${a.sources.map(x => `<a href="${esc(x.url)}" target="_blank" rel="noopener">${esc(x.public ? x.titre : x.origine.replace(/^(Presse|Web) · /, ''))}</a>`).join(', ')}</div>` : ''}
          ${a.verdict === 'insuffisant' && !a.valide && CONTRIBUER ? formContribution(p.cle, a.i) : ''}
        </div>`;
      }).join('')}
      ${CONTACT ? `<div class="post-pied"><a class="petit" href="mailto:${esc(CONTACT)}?subject=${encodeURIComponent('Erreur sur un verdict : ' + p.cle)}&body=${encodeURIComponent(p.url + '\n\nCe qui est faux, et la source qui le montre :\n')}">Signaler une erreur</a></div>` : ''}
    </article>`;
  };
  const page = +(q.get('page') || 1);
  v.innerHTML = `
    <div class="entete"><div><h1>Posts</h1>
      <div class="muet petit">Posts des personnalités suivies, découpés en affirmations et confrontés aux sources, du plus récent au plus ancien${qui && S.pers[qui] ? ` · ${esc(S.pers[qui].nom)} <a href="${lien('personne', '')}">(tous)</a>` : ''}</div></div>
      <div class="segments">
        <a class="${!statut ? 'actif' : ''}" href="${lien('statut', '')}">Tous</a>
        <a class="${statut === 'faux' ? 'actif' : ''}" href="${lien('statut', 'faux')}">Invalidés (${nb('faux')})</a>
        <a class="${statut === 'inverifiable' ? 'actif' : ''}" href="${lien('statut', 'inverifiable')}">Invérifiables (${nb('inverifiable')})</a>
        <a class="${statut === 'correct' ? 'actif' : ''}" href="${lien('statut', 'correct')}">Validés (${nb('correct')})</a>
      </div>
    </div>
    <div class="filtres-posts">
      ${choix('theme', theme, 'Tous les thèmes', themesDispo.map(t => [t, S.d.theme_noms[t] || t]))}
      ${choix('parti', parti, 'Tous les partis', partisDispo.map(x => [x.id, x.nom]))}
      ${choix('media', media, 'Tous les médias', mediasDispo.map(x => [x.id, S.groupesMedias?.[x.id] ? 'Groupe ' + x.nom : x.nom]))}
    </div>
    <p class="avertissement">Verdicts établis automatiquement par une intelligence artificielle à partir des sources citées. Des erreurs sont possibles : elles sont corrigées dès qu'elles sont signalées.</p>
    <div class="liste-posts">${vis.slice(0, page * PAR_PAGE_POSTS).map(carte).join('') || '<p class="vide-etat">Aucun post analysé pour ce filtre.</p>'}</div>
    ${vis.length > page * PAR_PAGE_POSTS ? `<p style="text-align:center"><a class="bouton" href="#/posts?${(() => { const r = new URLSearchParams(q); r.set('page', String(page + 1)); return r.toString(); })()}">Voir plus de posts</a></p>` : ''}`;
  v.querySelectorAll('select[data-filtre]').forEach(sel => sel.onchange = () => { location.hash = lien(sel.dataset.filtre, sel.value); });
  brancherContributions(v);
}

// ---------- Contributions sourcées du public ----------
// Sur une affirmation invérifiable, le public peut apporter une source : son verdict, le lien et la
// phrase qui le prouve. Rien n'est publié directement : la source est vérifiée, puis la contribution
// acceptée ou rejetée. En ligne, l'envoi passe par le service Cloudflare (anti-robots Turnstile).
const CONTRIBUER = STATIQUE ? window.CONTRIBUTIONS : { url: '' };
function formContribution(cle, i) {
  return `<details class="contribuer" data-cle="${esc(cle)}" data-i="${i}"><summary>Apporter une source</summary>
    <form>
      <p class="petit muet">Vous connaissez une source fiable qui permet de trancher ? Elle sera vérifiée avant publication.</p>
      <div class="segments" role="radiogroup">${[['exact', 'Exact'], ['faux', 'Faux'], ['trompeur', 'Trompeur']].map(([k, n], j) =>
        `<label><input type="radio" name="verdict" value="${k}"${j ? '' : ' required'}> ${n}</label>`).join('')}</div>
      <input name="url" type="url" required placeholder="Lien de la source (article, document officiel, données…)">
      <textarea name="passage" required minlength="20" rows="3" placeholder="Recopiez la phrase de la source qui le prouve"></textarea>
      <textarea name="commentaire" rows="2" placeholder="Commentaire (facultatif)"></textarea>
      <div class="turnstile"></div>
      <div class="rangee"><button type="submit" class="principal" style="flex:none">Envoyer</button><span class="petit retour"></span></div>
    </form></details>`;
}
let turnstilePret = null;
function chargerTurnstile() {
  return turnstilePret = turnstilePret || new Promise((ok, ko) => {
    const sc = document.createElement('script');
    sc.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
    sc.onload = () => ok(window.turnstile); sc.onerror = ko;
    document.head.appendChild(sc);
  });
}
function brancherContributions(v) {
  v.querySelectorAll('details.contribuer').forEach(det => {
    const form = det.querySelector('form'), retour = det.querySelector('.retour');
    let widget = null;
    det.addEventListener('toggle', async () => {
      if (!det.open || widget !== null || !STATIQUE) return;
      widget = (await chargerTurnstile()).render(det.querySelector('.turnstile'), { sitekey: CONTRIBUER.turnstile, language: 'fr' });
    });
    form.onsubmit = async e => {
      e.preventDefault();
      const f = new FormData(form);
      const corps = { cle: det.dataset.cle, i: +det.dataset.i, verdict: f.get('verdict'), url: f.get('url'),
        passage: f.get('passage'), commentaire: f.get('commentaire') };
      retour.textContent = 'Envoi…';
      try {
        let r;
        if (STATIQUE) {
          corps.jeton = window.turnstile?.getResponse(widget) || '';
          r = await fetch(CONTRIBUER.url.replace(/\/$/, '') + '/contribution', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corps) }).then(x => x.json());
        } else {
          r = await fetch('/api/contribution', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corps) }).then(x => x.json());
        }
        if (r.erreur) throw new Error(r.erreur);
        form.innerHTML = `<p class="petit">${r.deja ? 'Cette source avait déjà été proposée pour cette affirmation.' : 'Merci ! Votre source sera vérifiée avant publication.'}</p>`;
      } catch (err) {
        retour.textContent = 'Échec : ' + err.message;
        if (STATIQUE && widget !== null) window.turnstile?.reset(widget);
      }
    };
  });
}

// ---------- Atelier ----------
async function vueAtelier(v, sous, arg) {
  const n = S.d.a_qualifier.length + S.d.registre_a_confirmer + S.d.registre_signalements;
  v.innerHTML = `
    <div class="entete"><div><h1>Atelier</h1><div class="muet petit">Tri, registre et collectes</div></div></div>
    <div class="onglets-page">
      <a href="#/atelier" class="${!sous ? 'actif' : ''}">À trier${n ? ` (${n})` : ''}</a>
      <a href="#/atelier/verifier" class="${sous === 'verifier' ? 'actif' : ''}">À vérifier</a>
      <a href="#/atelier/contributions" class="${sous === 'contributions' ? 'actif' : ''}">Contributions</a>
      <a href="#/atelier/registre" class="${sous === 'registre' ? 'actif' : ''}">Registre</a>
      <a href="#/atelier/intervenants" class="${sous === 'intervenants' ? 'actif' : ''}">Intervenants médias</a>
      <a href="#/atelier/collectes" class="${sous === 'collectes' ? 'actif' : ''}">Collectes</a>
    </div>
    <div id="atelier"></div>`;
  const zone = $('#atelier');
  if (sous === 'registre') return vueRegistre(zone, arg);
  if (sous === 'verifier') return vueVerifier(zone);
  if (sous === 'contributions') return vueContributions(zone);
  if (sous === 'collectes') return vueReglages(zone);
  if (sous === 'intervenants') return vueIntervenants(zone);
  return vueATrier(zone);
}

// Vérification des faits énoncés dans les posts et citations : sources cherchées automatiquement,
// verdict donné à la main.
const CHOIX_VERIF = [
  ['exact', 'Exact', '--v-vrai'], ['trompeur', 'Trompeur', '--v-trompeur'], ['mensonger', 'Mensonger', '--v-faux'],
  ['non_etaye', 'Non étayé', '--v-non-etaye'], ['opinion', 'Opinion présentée comme un fait', '--t-opinion'],
  ['ignore', 'Rien à vérifier', '--v-inverifiable'],
];
// Résultat du contrôle automatique d'une phrase : citation comparée aux propos d'origine,
// ou chiffre comparé aux valeurs officielles. Renvoie [html, note proposée, source proposée].
const STATUT_CITATION = {
  exacte: ['Citation exacte', '--v-vrai'], deformee: ['Citation déformée', '--v-faux'],
  presse: ['Rapportée par la presse', '--v-inverifiable'], introuvable: ['Propos d\'origine introuvable', '--v-trompeur'],
};
const nbFr = (x, u) => u === 'nombre' ? Math.round(x).toLocaleString('fr-FR')
  : x.toLocaleString('fr-FR', { maximumFractionDigits: 1 }) + (u === '%' ? ' %' : ' ' + u);
function blocControle(c) {
  if (!c) return ['', '', ''];
  if (c.type === 'citation') {
    const x = c.citations.find(y => y.statut === c.statut) || c.citations[0];
    const [nom, coul] = STATUT_CITATION[x.statut];
    const qui = x.cites.map(p => `<a href="#/p/${p.id}">${esc(p.nom)}</a>`).join(', ');
    let h = `<div class="controle" style="border-color:var(${coul})"><span class="etiquette" style="background:var(${coul})">${nom}</span>
      <span class="petit">Mots prêtés à ${qui} : « ${esc(x.passage)} »</span>`;
    const o = x.original;
    if (o) h += `<div class="petit" style="margin-top:6px">Propos d'origine (${fdate(o.date)}, ${NOM_SOURCE[o.source] || o.source}, ${Math.round(x.score * 100)} % des mots) : « ${esc(o.texte)} » <a href="${esc(o.url)}" target="_blank" rel="noopener">source</a></div>`;
    (x.articles || []).forEach(a => { h += `<div class="petit" style="margin-top:4px"><a href="${esc(a.url)}" target="_blank" rel="noopener">${esc(a.titre)}</a> <span class="muet">${esc(a.origine.replace('Presse · ', ''))}</span></div>`; });
    if (x.statut === 'introuvable') h += `<div class="petit muet" style="margin-top:4px">Ni dans ce que Beau Discours collecte (pas de télévision ni de radio), ni dans les titres de presse : à chercher à la main.</div>`;
    const note = x.statut === 'deformee' ? `Les mots prêtés à ${x.cites[0].nom} diffèrent de ses propos du ${fdate(o.date)} : « ${o.texte.slice(0, 300)} »`
      : x.statut === 'exacte' ? `Citation conforme aux propos du ${fdate(o.date)}.` : '';
    return [h + '</div>', note, o ? o.url : (x.articles || [])[0]?.url || ''];
  }
  const x = c.chiffres.find(y => y.statut === c.statut) || c.chiffres[0];
  const coul = x.statut === 'ecart' ? '--v-faux' : '--v-vrai';
  const offi = Object.entries(x.officielles).map(([p, v]) => `${p} : ${nbFr(v, x.unite)}`).join(' · ');
  const h = `<div class="controle" style="border-color:var(${coul})"><span class="etiquette" style="background:var(${coul})">${x.statut === 'ecart' ? 'Chiffre hors tolérance' : 'Chiffre conforme'}</span>
    <span class="petit">${esc(x.nom)} : cité ${x.qualificatif ? esc(x.qualificatif) + ' ' : ''}${nbFr(x.cite, x.unite)}${x.annee ? ` (${x.annee})` : ''}</span>
    <div class="petit" style="margin-top:6px">Valeurs officielles ${x.annee ? 'de ' + x.annee : 'de la période'} : ${offi}</div>
    <div class="petit muet">Source : ${x.sources.map(u => `<a href="${esc(u)}" target="_blank" rel="noopener">Eurostat</a>`).join(', ')}</div></div>`;
  const note = `${x.nom} : ${nbFr(x.cite, x.unite)} cité, ${nbFr(x.plus_proche, x.unite)} selon Eurostat${x.annee ? ' (' + x.annee + ')' : ''}.`;
  return [h, note, x.sources[0]];
}

// Posts analysés par le modèle local : affirmations relevées, sources trouvées, verdict proposé.
// Le verdict retenu est donné à la main, affirmation par affirmation.
const NOM_PROPOSITION = {
  exact: ['Exact', '--v-vrai'], trompeur: ['Trompeur', '--v-trompeur'], mensonger: ['Mensonger', '--v-faux'],
  non_etaye: ['Non étayé', '--v-non-etaye'], insuffisant: ['Sources insuffisantes', '--v-inverifiable'],
};
// Contributions sourcées reçues du public : la source a été ouverte et la phrase cherchée, le modèle a
// relu l'affirmation avec elle ; la décision reste manuelle.
async function vueContributions(v) {
  v.innerHTML = '<p class="vide-etat">Chargement…</p>';
  const liste = await api('/api/contributions');
  const vue = S.requete.get('vue') || 'a_decider';
  const vis = liste.filter(c => vue === 'a_decider' ? ['a_decider', 'a_controler'].includes(c.statut) : c.statut === vue);
  const n = st => liste.filter(c => st.includes(c.statut)).length;
  const oui = (b, t) => `<span class="etiquette-statut ${b ? 'vert' : 'rouge'}">${t}${b ? '' : ' : non'}</span>`;
  v.innerHTML = `
    <div class="rangee" style="margin-bottom:12px">
      <div class="segments" style="flex:none">
        <a class="${vue === 'a_decider' ? 'actif' : ''}" href="#/atelier/contributions">À décider (${n(['a_decider', 'a_controler'])})</a>
        <a class="${vue === 'accepte' ? 'actif' : ''}" href="#/atelier/contributions?vue=accepte">Acceptées (${n(['accepte'])})</a>
        <a class="${vue === 'rejete' ? 'actif' : ''}" href="#/atelier/contributions?vue=rejete">Rejetées (${n(['rejete'])})</a>
      </div>
      <button id="contrib-recup" style="flex:none">Récupérer et contrôler maintenant</button>
    </div>
    ${vis.map(c => {
      const ct = c.controle || {}, pr = ct.proposition;
      const pe = c.post && S.pers[c.post.personne];
      return `<div class="carte" style="margin-bottom:12px" data-id="${esc(c.id)}">
        <div class="source">${pe ? `<a href="#/p/${pe.id}">${esc(pe.nom)}</a> · ` : ''}${c.post ? `${fdate(c.post.date)} · <a href="${esc(c.post.url)}" target="_blank" rel="noopener">voir le post</a> · ` : ''}reçue le ${fdate((c.recu || '').slice(0, 10))}</div>
        ${c.post ? `<div class="petit" style="margin:6px 0">${esc(c.post.texte)}</div><div><b>${esc(c.post.affirmation)}</b></div>` : '<p class="rouge">Post introuvable.</p>'}
        <div style="margin:8px 0">Verdict proposé par le public : <b>${esc(c.verdict)}</b> · <a href="${esc(c.url)}" target="_blank" rel="noopener">${esc(c.url)}</a></div>
        <blockquote class="petit" style="margin:4px 0;padding-left:8px;border-left:2px solid var(--bord)">« ${esc(c.passage)} »</blockquote>
        ${c.commentaire ? `<div class="petit muet">Commentaire : ${esc(c.commentaire)}</div>` : ''}
        <div class="rangee" style="justify-content:flex-start;margin:8px 0">${c.statut === 'a_controler' ? '<span class="muet petit">Contrôle en attente…</span>'
          : `${oui(ct.page_lue, 'Page lue')} ${oui(ct.passage_trouve, 'Phrase trouvée dans la page')}${pr ? ` <span class="petit">Relecture du modèle : <b>${esc(pr.verdict)}</b> (${esc(pr.confiance)}) · ${esc(pr.explication)}</span>` : ''}`}</div>
        ${['a_decider', 'a_controler'].includes(c.statut) ? `<div class="rangee" style="justify-content:flex-start"><button data-decision="accepte" class="principal" style="flex:none">Accepter</button><button data-decision="rejete" style="flex:none">Rejeter</button></div>` : ''}
      </div>`;
    }).join('') || '<p class="vide-etat">Aucune contribution.</p>'}`;
  $('#contrib-recup').onclick = async () => { await api('/api/contributions/recuperer', {}); setTimeout(() => vueContributions(v), 3000); };
  v.querySelectorAll('[data-decision]').forEach(b => b.onclick = async () => {
    const carte = b.closest('[data-id]');
    await api('/api/contributions/decider', { id: carte.dataset.id, decision: b.dataset.decision });
    carte.remove(); S.postsPublics = null; charger();
  });
}

async function vueAnalysesIA(v, qui, lien) {
  const d = await api('/api/ia' + (qui ? '?personne=' + encodeURIComponent(qui) : ''));
  const e = d.etat;
  v.innerHTML = `
    <div class="rangee" style="margin-bottom:12px">
      <div class="segments" style="flex:none"><a class="actif" href="${lien('ia')}">Analyses IA (${d.total.toLocaleString('fr-FR')})</a>${[['citations', 'Citations'], ['chiffres', 'Chiffres'], ['autres', 'Autres']].map(([g, n]) => `<a href="${lien(g)}">${n}</a>`).join('')}</div>
      <input id="verif-qui" list="verif-noms" placeholder="Filtrer par personnalité" value="${esc(S.pers[qui]?.nom || '')}">
      <datalist id="verif-noms">${S.d.personnes.map(p => `<option value="${esc(p.nom)}">`).join('')}</datalist>
    </div>
    <div class="rangee" style="margin-bottom:8px">
      <p class="muet petit" style="flex:2">Le modèle local (${esc(d.modele)}) relève les affirmations vérifiables de chaque post, rassemble des sources et propose un verdict d'après elles seules. À toi de trancher. Les propositions les plus graves d'abord.
        ${!d.disponible ? '<b class="rouge">Ollama ne répond pas.</b>' : e.en_cours ? `<b>Analyse en cours : ${e.fait} / ${e.lot} posts (recharge la page pour suivre).</b>` : e.erreur ? `<b class="rouge">${esc(e.erreur)}</b>` : ''}</p>
      <button id="ia-lancer" style="flex:none" ${e.en_cours || !d.disponible ? 'disabled' : ''}>Analyser 50 posts de plus</button>
    </div>
    ${d.posts.map(p => {
      const pers = S.pers[p.personne];
      return `<div class="carte" style="margin-bottom:12px">
        <div class="source">${pers ? `<a href="#/p/${pers.id}">${esc(pers.nom)}</a> · ${esc((S.partis[pers.parti] || {}).sigle || '')} · ` : ''}${fdate(p.date)} · <a href="${esc(p.url)}" target="_blank" rel="noopener">voir le post</a></div>
        <div style="margin:8px 0">${esc(p.texte)}</div>
        ${p.affirmations.map((a, i) => {
          if (a.traite) return '';
          const [nom, coul] = NOM_PROPOSITION[a.proposition.verdict] || NOM_PROPOSITION.insuffisant;
          const cites = a.proposition.sources.map(n => a.sources_trouvees[n - 1]).filter(Boolean);
          const autres = a.sources_trouvees.filter(s => !cites.includes(s));
          const src = s => `<div class="petit"><span class="puce">${esc(s.origine)}</span> <a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.titre)}</a></div>`;
          return `<div class="controle ia-aff" data-cle="${esc(p.cle)}" data-i="${i}" data-phrase="${a.phrase}" style="border-color:var(${coul})">
            <span class="etiquette" style="background:var(${coul})">${nom}</span><span class="petit muet">confiance ${esc(a.proposition.confiance)} · ${esc(a.type)}</span>
            <div style="margin:6px 0"><b>${esc(a.affirmation)}</b></div>
            <div class="petit">${esc(a.proposition.explication)}</div>
            ${a.proposition.passage && a.proposition.verdict !== 'insuffisant' ? `<blockquote class="petit" style="margin:6px 0;padding-left:8px;border-left:2px solid var(--bord)">« ${esc(a.proposition.passage)} » <span class="muet">[source ${a.proposition.source_passage}]</span></blockquote>` : ''}
            ${cites.map(src).join('')}
            ${autres.length ? `<details class="petit"><summary>${autres.length} autre${autres.length > 1 ? 's' : ''} source${autres.length > 1 ? 's' : ''} lue${autres.length > 1 ? 's' : ''}</summary>${autres.map(src).join('')}</details>` : ''}
            <div class="rangee" style="margin-top:6px">
              <input name="note" value="${esc(a.proposition.verdict === 'insuffisant' ? '' : a.proposition.explication.replace(/\s*\[[\d,\s\]\[]+\]/g, ''))}" placeholder="Justification">
              <input name="source_url" value="${esc(cites[0]?.url || '')}" placeholder="Lien de la source retenue">
            </div>
            <div class="choix-verdict" style="margin-top:6px">${CHOIX_VERIF.map(([k, n, c]) => `<button data-verdict="${k}" style="border-color:var(${c})">${n}</button>`).join('')}</div>
          </div>`;
        }).join('')}
      </div>`;
    }).join('') || `<p class="vide-etat">${e.en_cours ? 'Première analyse en cours…' : 'Aucune analyse en attente. Lance une analyse ci-dessus.'}</p>`}`;
  const champ = $('#verif-qui');
  champ.onchange = () => {
    const p = S.d.personnes.find(x => norm(x.nom) === norm(champ.value));
    location.hash = '#/atelier/verifier?genre=ia' + (p ? '&personne=' + p.id : '');
  };
  $('#ia-lancer').onclick = async () => { await api('/api/ia/lancer', { n: 50 }); vueAnalysesIA(v, qui, lien); };
  v.querySelectorAll('.ia-aff').forEach(bloc => bloc.querySelectorAll('[data-verdict]').forEach(b => b.onclick = async () => {
    const verdict = b.dataset.verdict;
    const note = bloc.querySelector('[name=note]').value, source_url = bloc.querySelector('[name=source_url]').value;
    if (['exact', 'trompeur', 'mensonger'].includes(verdict) && !source_url) return alert('Indique la source qui fonde ce verdict.');
    // Le verdict porte sur la phrase du post qui contient l'affirmation.
    if (verdict !== 'ignore') await api('/api/verifier/juger', { id: bloc.dataset.phrase, verdict, note, source_url });
    await api('/api/ia/traiter', { cle: bloc.dataset.cle, i: +bloc.dataset.i, verdict });
    if (verdict === 'mensonger' && confirm('Ajouter aussi cette affirmation au registre, pour suivre ses répétitions ?'))
      location.hash = '#/atelier/registre/nouveau?texte=' + encodeURIComponent(bloc.querySelector('b').textContent);
    bloc.remove();
    charger();
  }));
}

async function vueVerifier(v) {
  const qui = S.requete.get('personne') || '';
  const genre = S.requete.get('genre') || 'ia';
  v.innerHTML = '<p class="vide-etat">Chargement…</p>';
  const lien = g => '#/atelier/verifier?genre=' + g + (qui ? '&personne=' + qui : '');
  if (genre === 'ia') return vueAnalysesIA(v, qui, lien);
  const d = await api('/api/verifier?genre=' + genre + (qui ? '&personne=' + encodeURIComponent(qui) : ''));
  const explication = {
    citations: 'Mots prêtés entre guillemets à une personnalité suivie, comparés à ses propos d\'origine. Les plus suspects d\'abord.',
    chiffres: 'Chiffres d\'indicateurs officiels (chômage, inflation, dette, déficit, croissance, pauvreté, titres de séjour, asile), comparés aux valeurs Eurostat de la période. Les écarts d\'abord.',
    autres: 'Le reste des affirmations présentées comme des faits, des comptes les plus suivis aux moins suivis.',
  }[genre];
  v.innerHTML = `
    <div class="rangee" style="margin-bottom:12px">
      <div class="segments" style="flex:none"><a href="${lien('ia')}">Analyses IA</a>${[['citations', 'Citations'], ['chiffres', 'Chiffres'], ['autres', 'Autres']].map(([g, n]) =>
        `<a class="${g === genre ? 'actif' : ''}" href="${lien(g)}">${n} (${d.effectifs[g].toLocaleString('fr-FR')})</a>`).join('')}</div>
      <input id="verif-qui" list="verif-noms" placeholder="Filtrer par personnalité" value="${esc(S.pers[qui]?.nom || '')}">
      <datalist id="verif-noms">${S.d.personnes.map(p => `<option value="${esc(p.nom)}">`).join('')}</datalist>
    </div>
    <p class="muet petit">${explication} Posts et citations de presse depuis 2022${d.maj ? ` · contrôles du ${fdate(d.maj.slice(0, 10))}` : ''}.</p>
    ${d.file.map(r => {
      const p = S.pers[r.personne];
      const ctx = esc(r.contexte || r.texte).replace(esc(r.texte), `<mark>${esc(r.texte)}</mark>`);
      const [controle, note, source] = blocControle(r.controle);
      return `<div class="carte verif" data-id="${r.id}" style="margin-bottom:12px">
        <div class="source">${p ? `<a href="#/p/${p.id}">${esc(p.nom)}</a> · ${esc((S.partis[p.parti] || {}).sigle || '')} · ` : ''}${r.portee ? nbCourt(r.portee) + ' abonnés · ' : ''}${fdate(r.date)} · ${NOM_SOURCE[r.source] || r.source} · <a href="${esc(r.url)}" target="_blank" rel="noopener">voir</a></div>
        <div style="margin:8px 0">${ctx}</div>
        ${controle}
        <div class="rangee" style="justify-content:flex-start"><button data-sources style="flex:none">Chercher des sources</button></div>
        <div class="resultats"></div>
        <div class="rangee">
          <input name="note" placeholder="Justification (ce que disent les sources)" value="${esc(note)}">
          <input name="source_url" placeholder="Lien de la source retenue" value="${esc(source)}">
        </div>
        <div class="choix-verdict" style="margin-top:8px">${CHOIX_VERIF.map(([k, n, c]) => `<button data-verdict="${k}" style="border-color:var(${c})">${n}</button>`).join('')}</div>
      </div>`;
    }).join('') || '<p class="vide-etat">Rien à vérifier.</p>'}`;
  const champ = $('#verif-qui');
  champ.onchange = () => {
    const p = S.d.personnes.find(x => norm(x.nom) === norm(champ.value));
    location.hash = '#/atelier/verifier?genre=' + genre + (p ? '&personne=' + p.id : '');
  };
  v.querySelectorAll('.verif').forEach(carte => {
    const id = carte.dataset.id;
    carte.querySelector('[data-sources]').onclick = async e => {
      e.target.textContent = 'Recherche…';
      const r = await api('/api/verifier/sources/' + id);
      e.target.textContent = 'Chercher à nouveau';
      carte.querySelector('.resultats').innerHTML = `<p class="mention">Recherche : ${esc(r.requete)}</p>` + (r.resultats.map(x => `
        <div class="piste-source"><span class="puce">${esc(x.origine)}</span> <a href="${esc(x.url)}" target="_blank" rel="noopener">${esc(x.titre)}</a>
          <button class="discret" data-retenir="${esc(x.url)}">Retenir</button>
          ${x.extrait ? `<div class="petit muet">${esc(x.extrait)}</div>` : ''}</div>`).join('') || '<p class="muet petit">Aucune piste trouvée automatiquement : chercher à la main, ou conclure « non étayé ».</p>');
      carte.querySelectorAll('[data-retenir]').forEach(b => b.onclick = () => { carte.querySelector('[name=source_url]').value = b.dataset.retenir; });
    };
    carte.querySelectorAll('[data-verdict]').forEach(b => b.onclick = async () => {
      const verdict = b.dataset.verdict;
      const note = carte.querySelector('[name=note]').value, source_url = carte.querySelector('[name=source_url]').value;
      if (['exact', 'trompeur', 'mensonger'].includes(verdict) && !source_url) return alert('Indique la source qui fonde ce verdict.');
      await api('/api/verifier/juger', { id, verdict, note, source_url });
      if (verdict === 'mensonger' && confirm('Ajouter aussi cette affirmation au registre, pour suivre ses répétitions ?'))
        location.hash = '#/atelier/registre/nouveau?texte=' + encodeURIComponent(carte.querySelector('mark')?.textContent || '');
      carte.remove();
      charger();
    });
  });
}

async function vueATrier(v) {
  const liste = await api('/api/registre');
  const aConf = liste.filter(a => a.actif && a.compte.a_confirmer);
  const sig = liste.filter(a => a.signalements);
  v.innerHTML = `
    <div class="carte" style="margin-bottom:14px"><h3>Phrases à confirmer</h3>
      ${aConf.map(a => `<a class="ligne-aff" href="#/atelier/registre/${a.id}"><span class="citation">${esc(a.affirmation)}</span><span class="droite"><b>${a.compte.a_confirmer}</b> à confirmer</span></a>`).join('') || '<p class="muet petit">Rien à confirmer.</p>'}</div>
    <div class="carte" style="margin-bottom:14px"><h3>Signalements</h3>
      ${sig.map(a => `<a class="ligne-aff" href="#/atelier/registre/${a.id}"><span class="citation">${esc(a.affirmation)}</span><span class="droite rouge"><b>${a.signalements}</b> à examiner</span></a>`).join('') || '<p class="muet petit">Aucun signalement.</p>'}</div>
    <div id="qualifier"></div>`;
  vueQualifier($('#qualifier'));
}

function vueReglages(v) {
  const m = S.d.maj;
  v.innerHTML = `
    <div class="entete"><h2>Collectes</h2></div>
    <div class="deux">
      <form class="carte grille-form" id="f-cle">
        <h3>Clé Google Fact Check</h3>
        <p class="muet petit" style="margin:0">${S.d.google_cle ? 'Clé enregistrée.' : 'Sans clé, seuls les articles des flux RSS sont collectés.'} <a href="https://console.cloud.google.com/apis/library/factchecktools.googleapis.com" target="_blank" rel="noopener">Activer l'API</a> puis <a href="https://console.cloud.google.com/apis/credentials" target="_blank" rel="noopener">créer une clé</a>.</p>
        <input name="google_key" placeholder="${S.d.google_cle ? 'Remplacer la clé' : 'Coller la clé API'}" autocomplete="off">
        <div><button class="principal">Enregistrer</button></div>
      </form>
      <div class="carte grille-form">
        <h3>Mise à jour</h3>
        <table class="petit"><tbody>${[
          ['Réseaux sociaux', m.reseaux, 'toutes les 6 h'], ['Presse', m.presse, 'toutes les 6 h'],
          ['Articles de fact-checking', m.articles, 'toutes les 6 h'], ['Fact-checks Google', m.google, S.d.google_cle ? 'toutes les 6 h' : 'clé manquante'],
          ['Séances de l\'Assemblée', m.seances, 'chaque jour'], ['Scrutins', m.presence, 'chaque jour'],
          ['Télé et radio (Arcom)', m.arcom, 'chaque jour'], ['X et Instagram (extension)', m.captures, 'pendant la navigation'], ['Élus, groupes, partis, CV', m.elus, 'au lancement et chaque jour'],
        ].map(([n, d, r]) => `<tr><td>${n}</td><td class="n">${esc(d || 'jamais')}</td><td class="muet">${r}</td></tr>`).join('')}</tbody></table>
        <p class="mention" style="margin:0">Mises à jour automatiques tant que Beau Discours est ouvert.</p>
        ${S.d.notes_non_reconnues ? `<div class="petit muet">${S.d.notes_non_reconnues} verdicts Google à la note non reconnue (ignorés).</div>` : ''}
        <div class="rangee" style="justify-content:flex-start">
          <button data-maj="tout" class="principal" style="flex:none">Tout</button>
          <button data-maj="factchecks" style="flex:none">Fact-checks</button>
          <button data-maj="reseaux" style="flex:none">Réseaux</button>
          <button data-maj="presse" style="flex:none">Presse</button>
          <button data-maj="arcom" style="flex:none">Télé/radio</button>
          <button data-maj="seances" style="flex:none">Séances</button>
          <button data-maj="presence" style="flex:none">Scrutins</button>
          <button data-maj="elus" style="flex:none">Élus et CV</button>
        </div>
        <div id="journal" class="journal" hidden></div>
      </div>
    </div>
    <form class="carte grille-form" id="f-publication" style="margin-bottom:14px">
      <h3>Site public (beaudiscours.cloud)</h3>
      <div class="rangee">
        <label class="petit muet">Adresse de contact (signalements, droit de réponse)<input name="contact" type="email" value="${esc(S.d.publication?.contact || '')}" placeholder="contact@exemple.fr"></label>
        <label class="petit muet">Dossier du dépôt GitHub du site<input name="depot" value="${esc(S.d.publication?.depot || '')}" placeholder="C:\\Users\\…\\BeauDiscours"></label>
      </div>
      <label class="petit"><input type="checkbox" name="publication_auto" ${S.d.publication?.publication_auto ? 'checked' : ''}> Publier chaque jour après les collectes</label>
      <div class="rangee" style="justify-content:flex-start">
        <button class="principal" style="flex:none">Enregistrer</button>
        <button type="button" data-maj="publication-maintenant" style="flex:none">Publier maintenant</button>
        <span class="muet petit">Dernière publication : ${esc(m.publication || 'jamais')}</span>
      </div>
    </form>
    ${(() => {
      const av = S.d.personnes.filter(p => p.parti_a_verifier);
      return av.length ? `<div class="carte"><h3>Partis à vérifier</h3>
        <p class="muet petit">Hors Assemblée, le parti vient de personnalites.json. Wikidata indique une adhésion plus récente :</p>
        <table class="petit"><tbody>${av.map(p => `<tr class="clic" data-href="#/p/${p.id}"><td>${esc(p.nom)}</td><td>${esc(S.partis[p.parti]?.nom || p.parti)}</td><td class="muet">Wikidata : ${esc(p.parti_a_verifier)}</td></tr>`).join('')}</tbody></table></div>` : '';
    })()}`;
  v.querySelectorAll('tr[data-href]').forEach(tr => tr.onclick = () => location.hash = tr.dataset.href);
  $('#f-cle').onsubmit = async e => {
    e.preventDefault();
    await api('/api/config', { google_key: e.target.google_key.value });
    await recharger();
  };
  $('#f-publication').onsubmit = async e => {
    e.preventDefault();
    const f = e.target;
    await api('/api/config', { contact: f.contact.value, depot: f.depot.value, publication_auto: f.publication_auto.checked });
    await recharger();
  };
  v.querySelectorAll('[data-maj]').forEach(b => b.onclick = async () => {
    await api('/api/maj', { quoi: b.dataset.maj }); suivreTache();
  });
  afficherJournal();
}

function vueMentions(v) {
  const mail = CONTACT ? `<a href="mailto:${esc(CONTACT)}">${esc(CONTACT)}</a>` : 'l\'adresse de contact du site';
  v.innerHTML = `<div class="methode">
    <h1>Mentions légales</h1>
    <h2>Éditeur</h2>
    <p>Beau Discours est édité à titre non professionnel par une personne physique qui a choisi de rester anonyme, comme le permet l'article 6-III-2 de la loi n° 2004-575 du 21 juin 2004 pour la confiance dans l'économie numérique. Ses coordonnées ont été communiquées à l'hébergeur.</p>
    <p>Contact : ${mail}</p>
    <h2>Hébergeur</h2>
    <p>GitHub Inc. (GitHub Pages), 88 Colin P. Kelly Jr. Street, San Francisco, CA 94107, États-Unis.</p>
    <h2>Droit de réponse</h2>
    <p>Toute personne nommée ou désignée sur ce site peut exercer son droit de réponse (article 6-IV de la loi du 21 juin 2004), dans les trois mois suivant la mise en ligne du contenu, en écrivant à ${mail}. La demande indique les références du contenu (lien de la page), les passages contestés et le texte de la réponse. La réponse est publiée gratuitement dans les trois jours suivant sa réception, à la suite du contenu concerné.</p>
    <p>Pour signaler une erreur ou une source erronée sans exercer ce droit, chaque post analysé a un lien « Signaler une erreur ». Chaque signalement est vérifié à la main, et l'erreur corrigée.</p>
    <h2>Verdicts automatiques</h2>
    <p>Les verdicts portés sur les posts sont établis par un traitement automatisé (un modèle de langage) qui confronte une affirmation publique aux sources publiées citées à côté d'elle. Ils peuvent contenir des erreurs. Un verdict qualifie une affirmation au regard de ces sources ; il ne porte aucun jugement sur les intentions de son auteur. La méthode est décrite dans la page <a href="#/methode">Méthode</a>.</p>
    <h2>Données personnelles</h2>
    <p>Le site ne dépose aucun cookie et ne mesure pas l'audience. Le navigateur garde seulement vos préférences d'affichage (période, onglets), sur votre appareil. Les personnalités présentées sont des élus et responsables politiques ; seules des informations publiques liées à leur activité politique sont reprises, avec leur source.</p>
    <h2>Contributions du public</h2>
    <p>Quand vous apportez une source, sont conservés : l'affirmation concernée, le verdict proposé, le lien, la phrase recopiée, votre commentaire éventuel et la date. Aucun nom ni adresse électronique n'est demandé, et l'adresse IP n'est pas conservée : seule une empreinte chiffrée, qui change chaque jour et ne permet pas de remonter à vous, sert à limiter le nombre d'envois par appareil. Ces données servent uniquement à vérifier la source et, si elle est acceptée, à la publier avec le verdict. Les contributions sont reçues par un service hébergé par Cloudflare, Inc. (101 Townsend Street, San Francisco, CA 94107, États-Unis).</p>
    <p>Pour bloquer les robots, le formulaire charge, quand vous l'ouvrez, le service Turnstile de Cloudflare, qui analyse des signaux techniques de votre navigateur (voir la politique de confidentialité de Cloudflare). Il n'est chargé que si vous ouvrez le formulaire. Pour faire supprimer une contribution, écrivez à ${mail} en indiquant le post et le lien de la source.</p>
    <h2>Sources et licences</h2>
    <ul>
      <li>Assemblée nationale : données ouvertes (députés, comptes rendus de séance, scrutins), Licence Ouverte.</li>
      <li>Wikidata (parcours, partis, formation, comptes) : CC0.</li>
      <li>Arcom : relevés publics du temps de parole des personnalités politiques.</li>
      <li>Eurostat : statistiques officielles, réutilisation libre avec mention de la source.</li>
      <li>Posts des personnalités : reproduits pour en permettre la vérification, avec un lien vers la publication d'origine.</li>
      <li>Extraits d'articles de presse et de pages web : courtes citations à des fins d'information et de vérification (article L. 122-5 du code de la propriété intellectuelle), avec le nom de la source et un lien vers l'original.</li>
      <li>Photos : Wikimedia Commons, sous la licence indiquée sur la page de chaque fichier (lien sous chaque photo).</li>
      <li>Articles et vérifications : liens vers les publications d'origine (presse, fact-checkers), qui restent la propriété de leurs auteurs.</li>
    </ul>
    <p>La méthode de calcul est décrite dans la page <a href="#/methode">Méthode</a>.</p>
  </div>`;
}

function vueMethode(v) {
  v.innerHTML = `<div class="methode">
    <h1>Méthode</h1>
    <h2>Comment un post est vérifié</h2>
    <ol>
      <li><b>Collecte.</b> Les posts des personnalités suivies sont relevés sur les réseaux sociaux (voir plus bas). Ceux qui ne sont pas des prises de parole (agenda, annonces de passages dans les médias, appels à partager, remerciements, vœux) sont écartés : ils ne sont ni comptés ni analysés.</li>
      <li><b>Découpage.</b> Chaque post est découpé en affirmations vérifiables : un chiffre, un fait, un événement, des mots prêtés à quelqu'un, ou une position prêtée à une autre personne (« X veut supprimer… »). Une opinion ne se vérifie pas, mais les faits sur lesquels elle s'appuie oui : dans « ce budget est une saignée : 4 milliards de coupes », seuls les 4 milliards sont vérifiés. Quand l'auteur donne sa propre estimation comme un fait, c'est la fiabilité de cette estimation qui est vérifiée. Quand il prête une position à quelqu'un, c'est le fait que cette personne l'ait réellement exprimée qui est vérifié, pas la justesse de son idée.</li>
      <li><b>Recherche des sources.</b> Pour chaque affirmation : valeurs officielles (Eurostat) quand elle porte sur un chiffre suivi, propos d'origine de la personne citée dans tout ce que Beau Discours a collecté, articles de presse et pages web dont le texte est lu, Wikipédia.</li>
      <li><b>Verdict.</b> Un modèle de langage, qui fonctionne sur un ordinateur de Beau Discours sans service extérieur, compare l'affirmation aux sources trouvées, et à elles seules. Pour conclure, il doit recopier mot pour mot le passage de la source qui fonde son verdict ; un programme vérifie que ce passage existe bien dans la source. Sans passage valable, l'affirmation est déclarée invérifiable. Qu'une source ne parle pas d'une affirmation n'en fait jamais une fausse information.</li>
      <li><b>Relecture.</b> Les verdicts peuvent être relus et corrigés à la main ; ils portent alors la mention « vérifié par l'équipe ».</li>
    </ol>
    <h2>Les verdicts</h2>
    <ul>
      <li><b>Exact</b> : une source confirme l'affirmation.</li>
      <li><b>Faux</b> : une source la contredit explicitement.</li>
      <li><b>Trompeur</b> : vraie en partie, exagérée, ou présentée de façon à induire en erreur.</li>
      <li><b>Non étayé</b> : présentée comme certaine, alors que les sources montrent qu'elle n'est pas établie.</li>
      <li><b>Invérifiable</b> : aucune source fiable trouvée ne permet de trancher.</li>
    </ul>
    <p>Un post est <b>invalidé</b> (halo rouge) s'il contient au moins une affirmation fausse ou trompeuse, <b>validé</b> (halo vert) si toutes ses affirmations sont exactes, et <b>invérifiable</b> (halo orange) sinon. Un post qui ne contient que des opinions n'a pas de verdict.</p>
    <p><b>Des erreurs sont possibles</b> : le modèle peut mal lire un post ou une source. Chaque post a un lien « Signaler une erreur » ; une erreur signalée est vérifiée et corrigée. </p>
    <h2>Les sources apportées par le public</h2>
    <p>Quand aucune source fiable ne permet de trancher, chacun peut en apporter une : sous l'affirmation invérifiable, « Apporter une source » permet de proposer un verdict (exact, faux ou trompeur), le lien de la source et la phrase de cette source qui le prouve. Ce n'est pas un vote : le nombre de contributions ne compte pas, seule la source compte.</p>
    <p>Chaque contribution est contrôlée : la page est ouverte pour vérifier que la phrase recopiée s'y trouve, et le modèle relit l'affirmation avec cette source. Elle est ensuite acceptée ou rejetée à la main. Une contribution acceptée donne son verdict à l'affirmation, avec la mention « source apportée par le public », et le site de la source est ensuite interrogé en priorité lors des vérifications suivantes. Une même source proposée plusieurs fois pour une même affirmation ne compte qu'une fois, et le nombre d'envois par appareil et par jour est limité.</p>
    <h2>Score de fiabilité</h2>
    <p>Le score d'une personnalité vaut 100 moins la part de ses posts analysés qui contiennent une fausse information : si 24 % de ses posts analysés sont invalidés, son score est de 76. Halo vert de 75 à 100, orange de 50 à 75, rouge en dessous de 50. Il n'est affiché qu'à partir de ${MIN_POSTS_SCORE} posts analysés.</p>
    <p>Le score d'un parti, d'une rédaction ou d'un groupe de médias porte sur l'ensemble des posts analysés de ses membres. Partis et médias sont présentés du plus grand nombre de posts au plus petit.</p>
    <p>Le score décrit les posts analysés, pas tout ce que dit une personne : les interventions à la télévision et à la radio, notamment, ne sont pas encore vérifiées.</p>
    <h2>Verdicts des fact-checkers</h2>
    <p>Les verdicts publiés par les fact-checkers professionnels (AFP Factuel, Les Décodeurs, CheckNews, franceinfo…) sont repris sur les fiches, avec un lien vers l'article. Leurs notes libres sont ramenées à : <b>vrai</b>, <b>trompeur</b> (exagéré, manque de contexte, plus compliqué), <b>faux</b> (infondé, inexact, intox) et <b>invérifiable</b>. La note d'origine reste affichée.</p>
    <h2>Affirmations mensongères répétées</h2>
    <p>Le <a href="#/affirmations">registre</a> rassemble des affirmations mensongères (« La Révolution française a eu lieu en 1515 »), avec ce qui est vrai, des preuves et la date à laquelle le démenti est public. Il se remplit à la main, depuis une phrase de n'importe quel propos, et automatiquement à partir des verdicts « faux » et « trompeur » des fact-checkers.</p>
    <p>Pour chaque affirmation en service, Beau Discours cherche dans tout ce qui a été collecté (séance, réseaux, presse, propos saisis) les phrases qui contiennent ses mots-clés. <b>Aucune ne compte avant d'être confirmée à la main</b> : il faut que la personne affirme la chose fausse comme un fait, et non qu'elle la cite ou la dénonce. Pour aider au tri, Beau Discours repère les tournures de citation (« je cite », « selon M. X », « comme l'a dit », guillemets), identifie la personne citée et cherche son propos d'origine dans tout ce qui a été collecté. Ce ne sont que des indices : la décision reste manuelle. Une même phrase republiée le même jour compte une fois.</p>
    <p>Beau Discours compte toutes les répétitions, et parmi elles celles <b>maintenues malgré le démenti</b> : répétées après sa publication, ou publiées avant sur un réseau social et laissées en ligne sans retrait ni correction. Un post retiré ou corrigé par son auteur reste compté comme répétition, mais plus comme maintenu. Une affirmation présentée comme un fait alors qu'elle est contredite par les sources est qualifiée de <b>mensongère</b>.</p>
    <p>Quand la réalité n'est connue que par des <b>estimations</b> (fraude fiscale, coût d'une mesure…), Beau Discours cite toutes les estimations publiées qu'il connaît, donne la fourchette la plus large pour chaque chiffre et précise qu'il s'agit d'estimations. L'affirmation n'est qualifiée de mensongère que si elle est contredite par l'ensemble de ces estimations.</p>
    <p>Les affirmations proposées avec leurs sources sont en service d'emblée. Chacun peut <b>signaler</b> une source ou une conclusion erronée, à la manière des notes de la communauté : le signalement est examiné à la main, il n'a aucun effet automatique.</p>
    <h2>Vérifications de Beau Discours</h2>
    <p>En plus des fact-checkers, Beau Discours vérifie lui-même les phrases présentées comme des faits dans les posts et les citations de presse, des comptes les plus suivis aux moins suivis. Pour chacune, des pistes sont cherchées automatiquement (Wikipédia, données publiques de data.gouv.fr, fact-checks existants, registre), puis le verdict est donné à la main, avec la source qui le fonde :</p>
    <ul>
      <li><b>exact</b> : les sources confirment ;</li>
      <li><b>trompeur</b> : vrai en partie, ou présenté de façon à induire en erreur ;</li>
      <li><b>mensonger</b> : les sources contredisent ;</li>
      <li><b>non étayé</b> : présenté comme une certitude, mais aucune source ne l'établit. Ce n'est pas la preuve d'un mensonge : c'est une affirmation que son auteur ne permet pas de vérifier ;</li>
      <li><b>opinion présentée comme un fait</b> : un jugement formulé comme une évidence (« X est le symbole de… »). Compté à part, il n'entre pas dans les verdicts.</li>
    </ul>
    <p>Faux, trompeurs et non étayés forment ensemble les <b>propos non fiables</b>.</p>
    <h2>Intervenants des médias</h2>
    <p>Journalistes, éditorialistes et chroniqueurs pèsent aussi sur le débat politique. Beau Discours en suit une sélection : une pré-liste est tirée de Wikidata (profession de média, compte X ou Bluesky, article Wikipédia), puis chaque intervenant est retenu ou écarté à la main, avec le média où il s'exprime principalement aujourd'hui. Leurs propos passent par les mêmes collectes et les mêmes vérifications que ceux des politiques.</p>
    <p>Ils sont regroupés par <a href="#/medias">rédaction</a>, et les rédactions par <b>groupe propriétaire</b> (actionnaire de contrôle, source en lien sur chaque groupe). Leurs chiffres ne sont jamais mêlés à ceux des partis ni aux statistiques de l'accueil, qui portent sur les politiques. Un intervenant n'engage que lui-même : le chiffre d'une rédaction résume ses intervenants suivis, pas la ligne du média.</p>
    <h2>Rattachement au parti</h2>
    <ul>
      <li>Députés : parti de rattachement financier déclaré à l'Assemblée ; pour « Ensemble ! » et les non-rattachés, le groupe parlementaire.</li>
      <li>Autres personnalités : parti indiqué dans <code>personnalites.json</code>.</li>
      <li>Un propos compte pour le parti de la personne <b>au moment où il a été tenu</b> (historique Wikidata), pas pour son parti actuel.</li>
    </ul>
    <h2>Limites des taux</h2>
    <ul>
      <li>La couverture dépend des comptes collectés : un compte X peu visité par l'extension compte moins de posts analysés.</li>
      <li>Les fact-checkers vérifient surtout les propos douteux et les figures les plus exposées. Un taux de faux tiré de leurs verdicts décrit les propos <b>vérifiés</b>, pas tout ce que dit une personne ou un parti.</li>
      <li>En dessous de ${SEUIL} propos vérifiés, un taux est grisé : il ne veut rien dire.</li>
      <li>Deux taux par parti : tous propos confondus, et moyenne par personnalité (une figure très vérifiée ne pèse pas plus qu'une autre).</li>
      <li>Les partis ne sont pas classés entre eux.</li>
    </ul>
    <h2>Faits et opinions</h2>
    <p>Quatre sources : les prises de parole en séance publique à l'Assemblée (comptes rendus officiels ; présidence de séance et interruptions exclues), les posts sur les réseaux sociaux, les citations reprises dans les titres de presse, et les propos saisis à la main.</p>
    <p>Chaque propos est découpé en phrases. Une phrase avec un jugement, une volonté ou une injonction (« il faut », « je regrette », « scandaleux ») est une <b>opinion</b>. Une affirmation sans ces marques est un <b>fait énoncé</b>, vrai ou faux : trancher revient aux fact-checkers. Les questions et les formules de procédure (« Avis défavorable », « La parole est à… ») ne comptent ni comme fait ni comme opinion.</p>
    <p>Ce tri en faits et opinions repose sur des indices lexicaux, sans IA : il se trompe phrase par phrase, mais applique la même règle à tous les partis, ce qui rend la comparaison possible. Sur les propos saisis, un clic sur une phrase change son classement.</p>
    <h2>Thèmes</h2>
    <p>Une vingtaine de thèmes (budget, santé, sécurité, immigration, écologie…) repérés par mots-clés : dans le titre du débat et le texte pour les séances, dans le texte des posts et dans les titres de presse. Le classement montre la part de chaque thème dans l'ensemble des mentions.</p>
    <h2>Réseaux sociaux</h2>
    <p>Collectés automatiquement : Bluesky, Mastodon, YouTube (titres et descriptions) et les canaux Telegram publics, depuis les comptes déclarés dans Wikidata (Bluesky : à défaut, compte au nom exact avec au moins 500 abonnés). <b>X et Instagram</b> : relevés par l'extension de navigateur « Beau Discours - relevé », qui lit les profils affichés (posts, nombre d'abonnés), au fil de la navigation ou en tournée des profils. La couverture X dépend donc du nombre de profils visités ; la date du dernier relevé est indiquée sur chaque fiche. Facebook et TikTok ne sont pas collectés.</p>
    <p>Les posts qui ne sont pas des prises de parole ne sont ni comptés ni analysés : agenda et annonces de passages dans les médias (« ce soir à 20 h sur France 2 »), appels à suivre, partager ou adhérer, remerciements, vœux et hommages brefs. Les posts dont le texte a été affiché traduit par le navigateur ou par X sont aussi écartés : seuls comptent les mots réellement publiés.</p>
    <h2>Portée</h2>
    <p>Nombre d'abonnés par réseau : relevé du jour pour Bluesky, Mastodon et Telegram (et YouTube avec une clé Google) ; pour X et YouTube sans clé, dernier chiffre publié dans Wikidata, avec sa date. Pour un parti, les abonnés des membres sont additionnés : c'est un ordre de grandeur de l'audience, pas un nombre de personnes distinctes.</p>
    <h2>Presse</h2>
    <p>Google Actualités : articles des 30 derniers jours qui citent le nom exact, relus toutes les 6 heures. Une citation entre guillemets n'est attribuée que si le titre la rattache explicitement à la personne (« Nom : « … » » ou « « … » : Nom … »). Les homonymes peuvent fausser le compte d'articles.</p>
    <h2>Télé et radio</h2>
    <p>Relevés officiels de l'Arcom (temps de parole des personnalités politiques, chaîne par chaîne), publiés chaque mois avec environ deux mois de retard.</p>
    <h2>Présence</h2>
    <p>Députés : participation aux scrutins publics depuis le début du mandat (vote en personne ; les votes par délégation sont comptés à part). Les scrutins solennels sont le meilleur repère ; les autres ont souvent lieu de nuit avec peu de présents. La présidente de l'Assemblée apparaît présente à tous les scrutins qu'elle préside. Sénat et Parlement européen : pas encore suivis. Terrain : aucune donnée publique ; la part de presse régionale en donne un indice.</p>
    <h2>Propos sanctionnés</h2>
    <p>Un propos n'est marqué « sanctionné » qu'avec une source : rappel à l'ordre ou censure à l'Assemblée, condamnation définitive. Pas de jugement moral.</p>
    <h2>Sources</h2>
    <p>Open data de l'Assemblée nationale (députés, comptes rendus de séance), Wikidata (parcours, partis successifs, formation, photo), HATVP (liens vers les déclarations), Eurostat (chiffres officiels), Arcom (temps de parole), articles de presse et pages web trouvés par Bing Actualités et Bing, Wikipédia, API Google Fact Check, flux RSS des Décodeurs, de CheckNews, de franceinfo et de 20 Minutes. Analyse des posts : modèle de langage ouvert Qwen3, exécuté localement avec Ollama.</p>
  </div>`;
}

// ---------- Tâche de fond ----------
let minuteur = null;
async function suivreTache() {
  clearTimeout(minuteur);
  const t = await api('/api/tache');
  const bandeau = $('#tache');
  bandeau.hidden = !t.en_cours;
  if (t.en_cours) bandeau.textContent = 'Mise à jour… ' + (t.journal.at(-1) || '').slice(9);
  S.tache = t;
  afficherJournal();
  if (t.en_cours) { minuteur = setTimeout(suivreTache, 1500); S.attente = true; }
  else if (S.attente) { S.attente = false; await recharger(); }
}
function afficherJournal() {
  const j = $('#journal');
  if (!j || !S.tache || !S.tache.journal.length) return;
  j.hidden = false; j.textContent = S.tache.journal.join('\n'); j.scrollTop = j.scrollHeight;
}
async function recharger() { await charger(); route(); }

// ---------- Recherche ----------
function brancherRecherche() {
  const inp = $('#recherche'), box = $('#suggestions');
  let res = [];
  inp.oninput = () => {
    const q = norm(inp.value);
    res = q.length < 2 ? [] : S.d.personnes.filter(p => norm(p.nom).includes(q)).slice(0, 10);
    box.hidden = !res.length;
    box.innerHTML = res.map((p, i) => `<a href="#/p/${p.id}" class="${i ? '' : 'sel'}"><span class="badge"><i style="background:${(S.partis[p.parti] || S.partis.autres).couleur}"></i>${esc((S.partis[p.parti] || S.partis.autres).sigle)}</span><span>${esc(p.nom)}<br><span class="muet petit">${esc(p.fonction || '')}</span></span></a>`).join('');
  };
  inp.onkeydown = e => { if (e.key === 'Enter' && res[0]) { location.hash = '#/p/' + res[0].id; fermer(); } if (e.key === 'Escape') fermer(); };
  box.onclick = () => fermer();
  document.addEventListener('click', e => { if (!e.target.closest('.recherche')) box.hidden = true; });
  function fermer() { inp.value = ''; box.hidden = true; inp.blur(); }
}

// ---------- Infobulles ----------
function brancherInfobulles() {
  const tip = $('#infobulle');
  document.addEventListener('mousemove', e => {
    const el = e.target.closest('[data-tip]');
    if (!el) { tip.hidden = true; return; }
    tip.innerHTML = el.dataset.tip;
    tip.hidden = false;
    const r = tip.getBoundingClientRect();
    let x = e.clientX + 14, y = e.clientY + 14;
    if (x + r.width > innerWidth - 8) x = e.clientX - r.width - 14;
    if (y + r.height > innerHeight - 8) y = e.clientY - r.height - 14;
    tip.style.left = x + 'px'; tip.style.top = y + 'px';
  });
}

(async function () {
  if (STATIQUE) document.body.classList.add('statique');
  brancherInfobulles();
  window.addEventListener('hashchange', route);
  route();
  await charger();
  brancherRecherche();
  route();
  if (STATIQUE) return;
  suivreTache();
  // Les collectes automatiques démarrent côté serveur : on les repère pour rafraîchir l'affichage.
  setInterval(() => { if (!S.attente) suivreTache(); }, 60000);
})();
