import React, { useState } from "react";
import ChatPanel from "./components/ChatPanel.jsx";
import UploadPanel from "./components/UploadPanel.jsx";

const SIDEBAR_W = 280;

const S = {
  app: {
    display: "flex",
    height: "100vh",
    overflow: "hidden",
    fontFamily: "var(--sans)",
  },

  sidebar: {
    width: `${SIDEBAR_W}px`,
    flexShrink: 0,
    display: "flex",
    flexDirection: "column",
    background: "var(--surface)",
    borderRight: "1px solid var(--border)",
    overflow: "hidden",
    transition: "width 200ms ease, opacity 200ms ease",
  },
  sidebarHidden: {
    width: 0,
    opacity: 0,
    pointerEvents: "none",
  },

  main: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
  },

  topbar: {
    height: "48px",
    flexShrink: 0,
    display: "flex",
    alignItems: "center",
    gap: "12px",
    padding: "0 16px",
    borderBottom: "1px solid var(--border)",
    background: "var(--surface)",
  },

  logo: {
    fontFamily: "var(--mono)",
    fontWeight: 500,
    fontSize: "13px",
    color: "var(--text)",
    letterSpacing: "-.01em",
  },
  logoAccent: { color: "var(--accent)" },

  toggleBtn: {
    height: "28px",
    padding: "0 10px",
    border: "1px solid var(--border)",
    borderRadius: "var(--radius)",
    background: "transparent",
    color: "var(--text-2)",
    fontSize: "12px",
    fontWeight: 500,
    display: "flex",
    alignItems: "center",
    gap: "5px",
  },

  spacer: { flex: 1 },

  statusDot: (ok) => ({
    width: "7px",
    height: "7px",
    borderRadius: "50%",
    background: ok ? "var(--success)" : "var(--danger)",
    flexShrink: 0,
  }),
  statusLabel: {
    fontSize: "11px",
    color: "var(--text-3)",
  },
};

function useServerHealth() {
  const [ok, setOk] = React.useState(null);
  React.useEffect(() => {
    fetch("/api/health")
      .then((r) => setOk(r.ok))
      .catch(() => setOk(false));
  }, []);
  return ok;
}

export default function App() {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [filters, setFilters] = useState({ filetype: "", file: "", since: "", tag: "" });
  const healthy = useServerHealth();

  const activeFilterCount = Object.values(filters).filter(Boolean).length;

  return (
    <div style={S.app}>
      {/* Sidebar — Upload & Index */}
      <div style={{ ...S.sidebar, ...(sidebarOpen ? {} : S.sidebarHidden) }}>
        <UploadPanel />
      </div>

      {/* Main area */}
      <div style={S.main}>
        {/* Topbar */}
        <div style={S.topbar}>
          <button
            style={S.toggleBtn}
            onClick={() => setSidebarOpen((v) => !v)}
            title="Toggle document panel"
          >
            {sidebarOpen ? "← Hide" : "→ Docs"}
          </button>

          <span style={S.logo}>
            <span style={S.logoAccent}>rag</span>
            _poc
          </span>

          {activeFilterCount > 0 && (
            <span style={{ fontSize: "11px", color: "var(--accent)", fontWeight: 500 }}>
              {activeFilterCount} filter{activeFilterCount > 1 ? "s" : ""} active
            </span>
          )}

          <div style={S.spacer} />

          {healthy !== null && (
            <>
              <div style={S.statusDot(healthy)} />
              <span style={S.statusLabel}>{healthy ? "API ready" : "API offline"}</span>
            </>
          )}
        </div>

        {/* Chat */}
        <div style={{ flex: 1, overflow: "hidden" }}>
          <ChatPanel filters={filters} onFiltersChange={setFilters} />
        </div>
      </div>
    </div>
  );
}
