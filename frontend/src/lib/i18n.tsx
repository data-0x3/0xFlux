// Lightweight FR/EN internationalisation for 0xFLUX.
import { createContext, useContext, useState, type ReactNode } from "react";

export type Lang = "fr" | "en";
const KEY = "flux.lang";

function detect(): Lang {
  try {
    const saved = localStorage.getItem(KEY);
    if (saved === "fr" || saved === "en") return saved;
  } catch { /* ignore */ }
  try {
    return navigator.language.toLowerCase().startsWith("fr") ? "fr" : "en";
  } catch {
    return "en";
  }
}

type Dict = Record<string, { fr: string; en: string }>;

// One flat dictionary. Keys are stable; values carry both languages.
export const STR: Dict = {
  // nav
  "nav.overview": { fr: "Vue d'ensemble", en: "Overview" },
  "nav.scanner": { fr: "Scanner réseau", en: "Network Scanner" },
  "nav.discovery": { fr: "Découverte réseau", en: "Network Discovery" },
  "nav.traffic": { fr: "Analyseur de trafic", en: "Traffic Analyzer" },
  "nav.monitor": { fr: "Moniteur réseau", en: "Network Monitor" },
  "nav.ports": { fr: "Explorateur de ports", en: "Port Explorer" },
  "nav.tools": { fr: "Outils DNS & IP", en: "DNS & IP Tools" },
  "nav.history": { fr: "Historique des scans", en: "Scan History" },
  "nav.reports": { fr: "Rapports", en: "Reports" },
  "nav.settings": { fr: "Paramètres", en: "Settings" },
  "nav.developer": { fr: "Développeur", en: "Developer" },

  // boot
  "boot.starting": { fr: "Démarrage du moteur réseau…", en: "Starting the network engine…" },
  "boot.offline.title": { fr: "Le moteur 0xFLUX ne répond pas", en: "The 0xFLUX engine is not responding" },
  "boot.offline.body": { fr: "Il devrait démarrer tout seul. Cet écran se reconnecte automatiquement.", en: "It should start on its own. This screen reconnects automatically." },
  "boot.offline.hint": { fr: "S'il ne vient pas, lancez 0xFLUX en administrateur.", en: "If it doesn't come up, run 0xFLUX as administrator." },
  "boot.retry": { fr: "Réessayer maintenant", en: "Retry now" },

  // common
  "common.mode.simple": { fr: "Simple", en: "Simple" },
  "common.mode.advanced": { fr: "Avancé", en: "Advanced" },
  "common.engine.online": { fr: "Moteur en ligne", en: "Engine online" },
  "common.engine.offline": { fr: "Moteur hors ligne", en: "Engine offline" },
  "common.loading": { fr: "Chargement…", en: "Loading…" },
  "common.run": { fr: "Lancer", en: "Run" },
  "common.cancel": { fr: "Annuler", en: "Cancel" },
  "common.clear": { fr: "Effacer", en: "Clear" },
  "common.search": { fr: "Rechercher", en: "Search" },

  // page headers
  "overview.title": { fr: "Vue d'ensemble", en: "Overview" },
  "overview.sub": { fr: "L'état du réseau en un coup d'œil.", en: "Network status at a glance." },
  "scanner.title": { fr: "Scanner réseau", en: "Network Scanner" },
  "scanner.sub": { fr: "Scannez les réseaux et appareils que vous possédez ou êtes autorisé à évaluer.", en: "Scan networks and devices you own or are authorised to assess." },
  "discovery.title": { fr: "Découverte réseau", en: "Network Discovery" },
  "traffic.title": { fr: "Analyseur de trafic", en: "Traffic Analyzer" },
  "traffic.sub": { fr: "Métadonnées des paquets en direct — le contenu n'est jamais déchiffré ni stocké.", en: "Live packet metadata — payloads are never decrypted or stored." },
  "monitor.title": { fr: "Moniteur réseau", en: "Network Monitor" },
  "ports.title": { fr: "Explorateur de ports", en: "Port Explorer" },
  "ports.sub": { fr: "Ports et services courants, avec ce que vos scans ont détecté.", en: "Common ports and services, with what your scans actually detected." },
  "tools.title": { fr: "Outils DNS & IP", en: "DNS & IP Tools" },
  "tools.sub": { fr: "Utilitaires réseau — chaque outil renvoie un résultat réel.", en: "Network utilities — every tool returns live results." },
  "history.title": { fr: "Historique des scans", en: "Scan History" },
  "history.sub": { fr: "Chaque scan est enregistré localement et consultable.", en: "Every scan is saved locally and searchable." },
  "reports.title": { fr: "Rapports", en: "Reports" },
  "reports.sub": { fr: "Exportez n'importe quel scan terminé.", en: "Export any completed scan." },
  "settings.title": { fr: "Paramètres", en: "Settings" },
  "settings.sub": { fr: "Langue, mode d'interface, capacités de la machine et informations.", en: "Language, interface mode, host capabilities and application info." },
  "settings.language": { fr: "Langue", en: "Language" },
  "developer.title": { fr: "Développeur", en: "Developer" },
  "developer.sub": { fr: "La personne derrière 0xFLUX.", en: "The person behind 0xFLUX." },
  "developer.role": { fr: "Analyste en cybersécurité · Développeur de 0xFLUX", en: "Cybersecurity analyst · Developer of 0xFLUX" },
  "developer.bio": {
    fr: "Analyste en cybersécurité et développeur, 0x3 conçoit des outils réseau et sécurité minimalistes en noir et blanc. 0xFLUX est sa plateforme d'analyse et de surveillance réseau.",
    en: "Cybersecurity analyst and developer, 0x3 builds minimalist black-and-white network and security tools. 0xFLUX is his network intelligence and monitoring platform.",
  },
};

const I18nCtx = createContext<{ lang: Lang; setLang: (l: Lang) => void; t: (k: string) => string }>({
  lang: "en", setLang: () => {}, t: (k) => k,
});
export const useI18n = () => useContext(I18nCtx);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, set] = useState<Lang>(detect);
  const setLang = (l: Lang) => {
    set(l);
    try { localStorage.setItem(KEY, l); } catch { /* ignore */ }
    try { document.documentElement.lang = l; } catch { /* ignore */ }
  };
  const t = (k: string) => STR[k]?.[lang] ?? k;
  return <I18nCtx.Provider value={{ lang, setLang, t }}>{children}</I18nCtx.Provider>;
}
