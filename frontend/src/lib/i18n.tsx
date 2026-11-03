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
    fr: "Analyste en cybersécurité et développeur, 0x3 conçoit des outils de cybersécurité. 0xFLUX est sa plateforme d'analyse et de surveillance réseau.",
    en: "Cybersecurity analyst and developer, 0x3 builds cybersecurity tools. 0xFLUX is his network intelligence and monitoring platform.",
  },

  // ---- Traffic Analyzer (Wireshark-style) ----
  "tf.tab.packets": { fr: "Paquets", en: "Packets" },
  "tf.tab.convos": { fr: "Conversations", en: "Conversations" },
  "tf.tab.endpoints": { fr: "Hôtes", en: "Endpoints" },
  "tf.tab.stats": { fr: "Statistiques", en: "Statistics" },
  "tf.start": { fr: "Démarrer la capture", en: "Start capture" },
  "tf.stop": { fr: "Arrêter la capture", en: "Stop capture" },
  "tf.clear": { fr: "Effacer", en: "Clear" },
  "tf.interface": { fr: "Interface", en: "Interface" },
  "tf.filter": { fr: "Filtre d'affichage", en: "Display filter" },
  "tf.filter.ph": { fr: "ex. tls, dns, ip 192.168., port 443", en: "e.g. tls, dns, ip 192.168., port 443" },
  "tf.bpf": { fr: "Filtre de capture (BPF)", en: "Capture filter (BPF)" },
  "tf.export": { fr: "Exporter", en: "Export" },
  "tf.packets": { fr: "Paquets", en: "Packets" },
  "tf.data": { fr: "Données capturées", en: "Data captured" },
  "tf.rate": { fr: "Débit", en: "Rate" },
  "tf.shown": { fr: "Affichés", en: "Shown" },
  "tf.col.time": { fr: "Temps", en: "Time" },
  "tf.col.source": { fr: "Source", en: "Source" },
  "tf.col.dest": { fr: "Destination", en: "Destination" },
  "tf.col.proto": { fr: "Proto", en: "Proto" },
  "tf.col.len": { fr: "Taille", en: "Len" },
  "tf.col.info": { fr: "Infos", en: "Info" },
  "tf.details": { fr: "Détails du paquet", en: "Packet details" },
  "tf.details.hint": { fr: "Sélectionnez un paquet pour voir ses métadonnées.", en: "Select a packet to inspect its metadata." },
  "tf.waiting": { fr: "En attente de paquets", en: "Waiting for packets" },
  "tf.waiting.body": { fr: "Le trafic correspondant à vos filtres s'affichera ici.", en: "Traffic matching your filters will stream in here." },
  "tf.none": { fr: "Aucun paquet capturé", en: "No packets captured" },
  "tf.none.body": { fr: "Choisissez une interface et démarrez une capture.", en: "Choose an interface and start a capture." },
  "tf.jump": { fr: "Aller au plus récent", en: "Jump to latest" },
  "tf.follow": { fr: "Suivre cette conversation", en: "Follow this conversation" },
  // conversations table
  "tf.cv.explain": { fr: "Qui parle à qui — chaque ligne regroupe tous les paquets entre deux appareils.", en: "Who talks to whom — each row groups all packets between two devices." },
  "tf.cv.a": { fr: "Hôte A", en: "Host A" },
  "tf.cv.b": { fr: "Hôte B", en: "Host B" },
  "tf.cv.proto": { fr: "Protocole", en: "Protocol" },
  "tf.cv.packets": { fr: "Paquets", en: "Packets" },
  "tf.cv.bytes": { fr: "Octets", en: "Bytes" },
  "tf.cv.dir": { fr: "A→B / B→A", en: "A→B / B→A" },
  "tf.cv.dur": { fr: "Durée", en: "Duration" },
  "tf.cv.empty": { fr: "Aucune conversation pour l'instant", en: "No conversations yet" },
  // endpoints table
  "tf.ep.explain": { fr: "Chaque appareil vu dans la capture, avec son volume de trafic.", en: "Every device seen in the capture, with how much traffic it moved." },
  "tf.ep.ip": { fr: "Adresse IP", en: "IP address" },
  "tf.ep.packets": { fr: "Paquets", en: "Packets" },
  "tf.ep.bytes": { fr: "Octets", en: "Bytes" },
  "tf.ep.sent": { fr: "Envoyés", en: "Sent" },
  "tf.ep.recv": { fr: "Reçus", en: "Received" },
  "tf.ep.protos": { fr: "Protocoles", en: "Protocols" },
  "tf.ep.empty": { fr: "Aucun hôte pour l'instant", en: "No endpoints yet" },
  // statistics
  "tf.st.hierarchy": { fr: "Répartition des protocoles", en: "Protocol hierarchy" },
  "tf.st.io": { fr: "Activité dans le temps", en: "I/O over time" },
  "tf.st.io.sub": { fr: "paquets par seconde", en: "packets per second" },
  "tf.st.sizes": { fr: "Distribution des tailles de paquets", en: "Packet size distribution" },
  "tf.st.sizes.sub": { fr: "octets par paquet", en: "bytes per packet" },
  "tf.st.empty": { fr: "Démarrez une capture pour voir les statistiques.", en: "Start a capture to see statistics." },
  // capture unavailable
  "tf.unavail.title": { fr: "La capture n'est pas encore disponible sur cette machine", en: "Capture is not available on this machine yet" },
  "tf.unavail.privacy": { fr: "0xFLUX ne lit que les métadonnées des paquets (adresses, ports, protocoles, tailles, drapeaux, noms DNS, noms de serveurs TLS). Il ne déchiffre jamais le TLS et ne stocke aucun contenu.", en: "0xFLUX only reads packet metadata (addresses, ports, protocols, sizes, flags, DNS names, TLS server names). It never decrypts TLS or stores payloads." },
  "tf.unavail.redetect": { fr: "Re-détecter", en: "Re-detect" },

  // ---- shared data labels ----
  "d.download": { fr: "Téléchargement", en: "Download" },
  "d.upload": { fr: "Envoi", en: "Upload" },
  "d.latency": { fr: "Latence", en: "Latency" },
  "d.netstatus": { fr: "État du réseau", en: "Network status" },
  "d.online": { fr: "en ligne", en: "online" },
  "d.noconn": { fr: "pas de connexion", en: "no connectivity" },
  "d.activeiface": { fr: "Interface active", en: "Active interface" },
  "d.none": { fr: "aucune", en: "none" },
  "d.knowndevices": { fr: "Appareils connus", en: "Known devices" },
  "d.hostsfound": { fr: "Hôtes découverts", en: "Hosts discovered" },
  "d.openfound": { fr: "Ports ouverts trouvés", en: "Open ports found" },
  "d.avglatency": { fr: "Latence moyenne", en: "Average latency" },
  "d.recentscans": { fr: "Scans récents", en: "Recent scans" },
  "d.viewall": { fr: "Voir tout", en: "View all" },
  "d.environment": { fr: "Environnement", en: "Environment" },
  "d.details": { fr: "Détails", en: "Details" },
  "d.target": { fr: "Cible", en: "Target" },
  "d.status": { fr: "Statut", en: "Status" },
  "d.hosts": { fr: "Hôtes", en: "Hosts" },
  "d.open": { fr: "Ouverts", en: "Open" },
  "d.when": { fr: "Quand", en: "When" },
  "d.system": { fr: "Système", en: "System" },
  "d.privileges": { fr: "Privilèges", en: "Privileges" },
  "d.admin": { fr: "administrateur", en: "administrator" },
  "d.stduser": { fr: "utilisateur standard", en: "standard user" },
  "d.scanengine": { fr: "Moteur de scan", en: "Scan engine" },
  "d.capture": { fr: "Capture de paquets", en: "Packet capture" },
  "d.available": { fr: "disponible", en: "available" },
  "d.unavailable": { fr: "indisponible", en: "unavailable" },
  "d.netactivity": { fr: "Activité réseau", en: "Network activity" },
  "d.netactivity.sub": { fr: "débit combiné, 60 dernières s", en: "combined throughput, last 60 s" },
  "d.nothingyet": { fr: "Rien pour l'instant", en: "Nothing yet" },
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
