import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Activity, AlertTriangle, CheckCircle2, Clock, Gauge, RefreshCw, X } from "lucide-react";

import "./UsageDashboardModal.css";
import type { ProviderUsage, UsageWindow } from "../../shared/protocol.ts";
import { useT } from "../lib/i18n.ts";
import { useSettings, type UsageCount } from "../lib/settings.ts";
import {
  formatPercent,
  formatRate,
  formatResetIn,
  formatRunsOut,
  HIGH_PERCENT,
  meterPercent,
  meterText,
  orderProviders,
  PROVIDER_MARK,
  PROVIDER_NAME,
  usageName,
  useUsage,
  windowLabel,
  windowPace,
} from "../lib/usage.ts";
import { AgentMark } from "./AgentMark.tsx";

export interface UsageDashboardModalProps {
  onClose: () => void;
}

export function UsageDashboardModal({ onClose }: UsageDashboardModalProps) {
  const t = useT();
  const { settings } = useSettings();
  const { report, loading, refresh } = useUsage(true);
  const [countMode, setCountMode] = useState<UsageCount>(settings.usageCount || "used");
  const [selectedWinId, setSelectedWinId] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  const providers: ProviderUsage[] = report ? orderProviders(report.providers, settings.usageOrder) : [];

  // Default to Gemini 5-hour session window, or user selected, or tightest
  let primaryWindow: UsageWindow | null = null;
  let primaryProvider: ProviderUsage | null = null;

  for (const prov of providers) {
    for (const win of prov.windows) {
      const winId = `${prov.key}:${win.kind}:${win.scope ?? "default"}`;
      if (selectedWinId && winId === selectedWinId) {
        primaryWindow = win;
        primaryProvider = prov;
        break;
      }
      if (!selectedWinId && win.kind === "session" && win.scope === null) {
        primaryWindow = win;
        primaryProvider = prov;
      }
    }
    if (primaryWindow && (selectedWinId || primaryWindow.kind === "session")) break;
  }

  // Fallback to first available window if none matched
  if (!primaryWindow && providers.length > 0 && providers[0]!.windows.length > 0) {
    primaryProvider = providers[0]!;
    primaryWindow = primaryProvider.windows[0]!;
  }

  const gaugePercent = primaryWindow ? meterPercent(primaryWindow, countMode) : 0;
  const rawUsedPercent = primaryWindow ? primaryWindow.used_percent : 0;

  // Gauge color based on used percent
  const gaugeColor =
    rawUsedPercent >= HIGH_PERCENT
      ? "#f87171"
      : rawUsedPercent >= 50
      ? "#fbbf24"
      : "#34d399";

  const radius = 54;
  const circumference = 2 * Math.PI * radius;
  const strokeOffset = circumference - (circumference * Math.min(100, Math.max(0, gaugePercent))) / 100;

  return createPortal(
    <div
      className="modal-scrim"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="modal usage-dashboard-modal" role="dialog" aria-modal="true" aria-label="Usage Dashboard">
        {/* Header */}
        <header className="usage-dash-header">
          <div className="usage-dash-title-group">
            <Activity size={20} />
            <h2 className="modal-title">Usage & Limit Dashboard</h2>
          </div>
          <div className="usage-dash-header-actions">
            <button
              type="button"
              className="usage-dash-toggle-btn"
              onClick={() => setCountMode((prev) => (prev === "used" ? "left" : "used"))}
              title="Toggle Used vs Remaining"
            >
              Mode: <strong>{countMode === "used" ? "% Used" : "% Left"}</strong>
            </button>
            <button
              type="button"
              className="icon-button"
              disabled={loading}
              onClick={() => void refresh()}
              aria-label="Refresh limits"
              title="Refresh limits"
            >
              <RefreshCw size={16} className={loading ? "spin" : undefined} />
            </button>
            <button type="button" className="icon-button" onClick={onClose} aria-label="Close" title="Close">
              <X size={18} />
            </button>
          </div>
        </header>

        {/* Body */}
        <div className="usage-dash-body">
          {/* Hero Gauge & Context Window */}
          <section className="usage-hero-grid">
            {/* Circular Gauge */}
            <div className="usage-gauge-container">
              <svg className="usage-gauge-svg" viewBox="0 0 140 140">
                <circle className="usage-gauge-bg" cx="70" cy="70" r={radius} />
                <circle
                  className="usage-gauge-fill"
                  cx="70"
                  cy="70"
                  r={radius}
                  stroke={gaugeColor}
                  strokeDasharray={circumference}
                  strokeDashoffset={strokeOffset}
                />
              </svg>
              <div className="usage-gauge-text">
                <span className="usage-gauge-val">{formatPercent(gaugePercent)}</span>
                <span className="usage-gauge-sub">{countMode === "used" ? "USED" : "LEFT"}</span>
              </div>
            </div>

            {/* Hero Details & 90% Context Warning */}
            <div className="usage-hero-details">
              <h3 className="usage-hero-title">
                <Gauge size={18} />
                <span>
                  {primaryProvider ? `${PROVIDER_NAME[primaryProvider.id]} Quota` : "Model Quota Glance"}
                </span>
              </h3>
              <p style={{ margin: 0, fontSize: "var(--fs-xs)", color: "var(--text-dim)" }}>
                {primaryWindow ? (
                  <>
                    Active limit: <strong>{windowLabel(primaryWindow)}</strong> ·{" "}
                    {formatResetIn(primaryWindow.resets_at, now)
                      ? `Resets in ${formatResetIn(primaryWindow.resets_at, now)}`
                      : "Reset time pending"}
                  </>
                ) : (
                  "Checking active provider rate limits…"
                )}
              </p>

              {/* Session Context 90% Safety Card */}
              <div className="usage-context-card">
                <div className="usage-context-header">
                  <span>Context Window Threshold (Rule 90%)</span>
                  <span>Safety Check</span>
                </div>
                <div className="usage-context-bar-wrap">
                  <div
                    className="usage-context-bar-fill"
                    style={{
                      width: `${Math.min(100, Math.max(15, rawUsedPercent))}%`,
                      backgroundColor: gaugeColor,
                    }}
                  />
                </div>
                {rawUsedPercent >= 90 ? (
                  <div className="usage-90-warning">
                    <AlertTriangle size={14} style={{ display: "inline", verticalAlign: "middle", marginRight: 4 }} />
                    <strong>Peringatan 90% Context Window!</strong> Pemakaian token sesi mendekati ambang batas.
                    Disarankan segera summarize/recap percakapan ke <code>D:\Obsidian\Session_Recap.md</code>.
                  </div>
                ) : (
                  <p style={{ margin: "6px 0 0", fontSize: "11px", color: "var(--text-dim)" }}>
                    <CheckCircle2 size={12} style={{ display: "inline", verticalAlign: "middle", marginRight: 4, color: "#4ade80" }} />
                    Context aman. Auto-reminder aktif jika pemakaian token menyentuh 90%.
                  </p>
                )}
              </div>
            </div>
          </section>

          {/* Provider Rate Limits & Multi-Bar Graphs */}
          <section>
            <h4 className="usage-section-heading">Active Providers & Windows</h4>
            {providers.length === 0 ? (
              <div style={{ textAlign: "center", padding: "var(--space-6)", color: "var(--text-dim)", fontSize: "var(--fs-sm)" }}>
                {loading ? "Fetching limits from providers…" : "No provider subscriptions connected."}
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
                {providers.map((prov) => {
                  const pName = PROVIDER_NAME[prov.id];
                  return (
                    <div className="usage-provider-card" key={prov.key}>
                      <div className="usage-card-top">
                        <div className="usage-card-title">
                          <AgentMark agent={PROVIDER_MARK[prov.id]} size={18} />
                          <span>{pName}</span>
                          {prov.account && <span style={{ fontSize: "var(--fs-xs)", color: "var(--text-dim)", fontWeight: "normal" }}>({prov.account})</span>}
                        </div>
                        <div className="usage-card-badges">
                          {prov.plan && <span className="usage-badge">{prov.plan}</span>}
                        </div>
                      </div>

                      {/* Windows Bar Graph */}
                      <div className="usage-graph-container">
                        {prov.windows.length === 0 ? (
                          <div style={{ fontSize: "var(--fs-xs)", color: "var(--text-dim)" }}>No active quota limits reported for this account.</div>
                        ) : (
                          prov.windows.map((win, idx) => {
                            const val = meterPercent(win, countMode);
                            const raw = win.used_percent;
                            const reset = formatResetIn(win.resets_at, now);
                            const pace = windowPace(win, prov.checked_at, now);
                            const runsOut = formatRunsOut(win, prov.checked_at, now);

                            const barColor =
                              raw >= HIGH_PERCENT
                                ? "#f87171"
                                : raw >= 50
                                ? "#fbbf24"
                                : "#34d399";

                            const winKey = `${prov.key}:${win.kind}:${win.scope ?? "default"}`;
                            const isSelected = selectedWinId === winKey || (!selectedWinId && primaryWindow === win);

                            return (
                              <div
                                className={`usage-window-item${isSelected ? " is-active-window" : ""}`}
                                key={idx}
                                style={{
                                  cursor: "pointer",
                                  padding: "6px 8px",
                                  borderRadius: "var(--radius-md)",
                                  background: isSelected ? "var(--bg-hover)" : "transparent",
                                  border: isSelected ? "1px solid var(--accent)" : "1px solid transparent",
                                  transition: "all 0.15s ease",
                                }}
                                onClick={() => setSelectedWinId(winKey)}
                                title="Click to view in circular gauge"
                              >
                                <div className="usage-window-meta">
                                  <span className="usage-window-label">{windowLabel(win)}</span>
                                  <div className="usage-window-stats">
                                    {reset && (
                                      <span>
                                        <Clock size={11} style={{ display: "inline", marginRight: 3, verticalAlign: "middle" }} />
                                        {reset}
                                      </span>
                                    )}
                                    <strong style={{ color: barColor }}>{meterText(win, countMode)}</strong>
                                  </div>
                                </div>

                                <div className="usage-progress-bar">
                                  <div
                                    className="usage-progress-fill"
                                    style={{
                                      width: `${Math.min(100, Math.max(0, val))}%`,
                                      backgroundColor: barColor,
                                    }}
                                  />
                                  {pace && (
                                    <div
                                      className="usage-pace-tick"
                                      style={{
                                        left: `${Math.min(100, Math.max(0, countMode === "left" ? 100 - pace.elapsed * 100 : pace.elapsed * 100))}%`,
                                      }}
                                      title="Pace marker"
                                    />
                                  )}
                                </div>

                                {pace && pace.perHour > 0 && (
                                  <div className="usage-pace-info">
                                    <span>Pace: {formatRate(win, pace)}</span>
                                    {runsOut ? (
                                      <span className="usage-pace-burn is-fast">⚠️ Runs out: {runsOut}</span>
                                    ) : (
                                      <span className="usage-pace-burn is-ok">Pace on track</span>
                                    )}
                                  </div>
                                )}
                              </div>
                            );
                          })
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </div>
      </div>
    </div>,
    document.body,
  );
}
