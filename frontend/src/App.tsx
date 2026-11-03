import { Route, Routes, useLocation } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { Sidebar } from "./components/Sidebar";
import { CapsProvider, useCaps } from "./lib/caps";
import { ModeProvider } from "./lib/mode";
import Overview from "./pages/Overview";
import Scanner from "./pages/Scanner";
import Discovery from "./pages/Discovery";
import Traffic from "./pages/Traffic";
import Monitor from "./pages/Monitor";
import Ports from "./pages/Ports";
import Tools from "./pages/Tools";
import History from "./pages/History";
import Reports from "./pages/Reports";
import Settings from "./pages/Settings";
import Developer from "./pages/Developer";
import { Boot } from "./components/Boot";

function Shell() {
  const { caps, online } = useCaps();
  const location = useLocation();

  if (online === null && !caps) return <Boot state="starting" />;
  if (online === false && !caps) return <Boot state="offline" />;

  return (
    <div className="shell">
      <Sidebar caps={caps} />
      <main className="main">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div key={location.pathname} className="route"
            initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            transition={{ duration: 0.14, ease: [0.22, 0.61, 0.36, 1] }}>
            <Routes location={location}>
              <Route path="/" element={<Overview />} />
              <Route path="/scanner" element={<Scanner />} />
              <Route path="/discovery" element={<Discovery />} />
              <Route path="/traffic" element={<Traffic />} />
              <Route path="/monitor" element={<Monitor />} />
              <Route path="/ports" element={<Ports />} />
              <Route path="/tools" element={<Tools />} />
              <Route path="/history" element={<History />} />
              <Route path="/reports" element={<Reports />} />
              <Route path="/settings" element={<Settings />} />
              <Route path="/developer" element={<Developer />} />
            </Routes>
          </motion.div>
        </AnimatePresence>
      </main>
    </div>
  );
}

export default function App() {
  return (
    <ModeProvider>
      <CapsProvider>
        <Shell />
      </CapsProvider>
    </ModeProvider>
  );
}
