import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  Check,
  CheckCircle2,
  Clock,
  Copy,
  FileCode,
  Play,
  RotateCcw,
  Send,
  Sparkles,
  Trash2,
  X,
  Zap,
} from "lucide-react";

import "./RightSidebar.css";
import { useT } from "../lib/i18n.ts";
import { useSettings } from "../lib/settings.ts";
import { HIGH_PERCENT, meterPercent, meterText, useUsage, windowLabel, formatResetIn } from "../lib/usage.ts";

export interface RightSidebarProps {
  open: boolean;
  onClose: () => void;
  onInsertPrompt: (text: string) => void;
}

type TabMode = "macros" | "swift" | "health";

const SWIFT_FIN_TAG_NAMES: Record<string, string> = {
  ":20:": "Sender's Reference (TRN)",
  ":21:": "Related Reference",
  ":23B:": "Bank Operation Code",
  ":23E:": "Instruction Code",
  ":26T:": "Transaction Type Code",
  ":32A:": "Value Date / CCY / Amount",
  ":33B:": "Instructed Amount",
  ":36:": "Exchange Rate",
  ":50A:": "Ordering Customer (BIC)",
  ":50F:": "Ordering Customer (Structured)",
  ":50K:": "Ordering Customer (Name & Addr)",
  ":52A:": "Ordering Institution",
  ":52D:": "Ordering Institution (Name)",
  ":53A:": "Sender's Correspondent",
  ":53B:": "Sender's Correspondent",
  ":54A:": "Receiver's Correspondent",
  ":56A:": "Intermediary Institution",
  ":57A:": "Account With Institution (BIC)",
  ":57D:": "Account With Institution",
  ":59:": "Beneficiary Customer",
  ":59A:": "Beneficiary Customer (BIC)",
  ":70:": "Remittance Information",
  ":71A:": "Details of Charges (OUR/SHA/BEN)",
  ":71F:": "Sender's Charges",
  ":71G:": "Receiver's Charges",
  ":72:": "Sender to Receiver Info",
  ":77B:": "Regulatory Reporting",
};

const MACROS_LIST = [
  {
    title: "Check SBM Service",
    cmd: "sc query PaymentSafe",
    desc: "Periksa status service PaymentSafe SBM di Windows",
  },
  {
    title: "Check MSMQ Queues (MDD)",
    cmd: "powershell -Command \"Get-MsmqQueue | Select-Object QueueName, MessageCount\"",
    desc: "Cek antrean pesan di queue MSMQ",
  },
  {
    title: "Ping SWIFT Router / pfSense",
    cmd: "ping -n 4 192.168.220.1",
    desc: "Cek konektivitas ke gateway pfSense lab",
  },
  {
    title: "List Sample Messages (MT/MX)",
    cmd: "dir \"D:\\Priyo\\Kerjaan\\sample message\"",
    desc: "Lihat daftar file sample MT/MX RJE",
  },
  {
    title: "Git Status Web UI",
    cmd: "git status -s",
    desc: "Cek status repositori my-herdr-web-ui",
  },
  {
    title: "Restart Herdr Service",
    cmd: "bun scripts/plugin.ts stop && bun scripts/plugin.ts start",
    desc: "Restart service background Herdr Web UI",
  },
];

const SAMPLE_MT103 = `{1:F01BNPAIDJAXXXX0001000001}{2:I103BKTRUS33XXXXN}{4:
:20:TRX20261012001
:23B:CRED
:32A:261012USD1500000,00
:50K:/1234567890
PT VENTURIUM SYSTEM INDONESIA
JAKARTA
:59:/9876543210
BANK SUMUT MEDAN
:70:PAYMENT INVOICE INTEGRATION
:71A:OUR
-}`;

export function RightSidebar({ open, onClose, onInsertPrompt }: RightSidebarProps) {
  const t = useT();
  const { settings } = useSettings();
  const [activeTab, setActiveTab] = useState<TabMode>("macros");
  const [copiedCmd, setCopiedCmd] = useState<string | null>(null);

  // Scratchpad state
  const [scratchpad, setScratchpad] = useState(() => {
    try {
      return localStorage.getItem("herdr-web-ui:scratchpad") ?? "";
    } catch {
      return "";
    }
  });

  const onScratchpadChange = (val: string) => {
    setScratchpad(val);
    try {
      localStorage.setItem("herdr-web-ui:scratchpad", val);
    } catch {}
  };

  // SWIFT Inspector state
  const [swiftRaw, setSwiftRaw] = useState(SAMPLE_MT103);

  // Parse FIN / MX
  const parsedSwiftTags = useMemo(() => {
    const raw = swiftRaw.trim();
    if (!raw) return [];

    // FIN MT Detection: match :XX: or :XXA:
    const tagRegex = /(:\d{2}[A-Z]?:)([\s\S]*?)(?=(:\d{2}[A-Z]?:)|-\}|$)/g;
    const matches: { code: string; name: string; val: string }[] = [];
    let match;

    while ((match = tagRegex.exec(raw)) !== null) {
      const code = match[1]!;
      const val = match[2]!.trim();
      const name = SWIFT_FIN_TAG_NAMES[code] ?? "SWIFT Standard Field";
      matches.push({ code, name, val });
    }

    if (matches.length > 0) return matches;

    // XML / MX Fallback Detection
    const xmlRegex = /<([a-zA-Z0-9]+)>([^<]+)<\/\1>/g;
    let xmlMatch;
    while ((xmlMatch = xmlRegex.exec(raw)) !== null) {
      matches.push({
        code: `<${xmlMatch[1]}>`,
        name: "ISO 20022 Element",
        val: xmlMatch[2]!.trim(),
      });
    }

    return matches;
  }, [swiftRaw]);

  // Quota & Health
  const { report, refresh } = useUsage(open);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(timer);
  }, []);

  const copyMacro = (cmd: string) => {
    void navigator.clipboard.writeText(cmd);
    setCopiedCmd(cmd);
    setTimeout(() => setCopiedCmd(null), 1500);
  };

  const sendMacroToComposer = (cmd: string) => {
    onInsertPrompt(cmd);
  };

  const sendSwiftToAI = () => {
    const prompt = `Tolong analisa dan validasi struktur pesan SWIFT berikut, cek apakah format tag, field mandatory, dan nilainya valid:\n\n\`\`\`swift\n${swiftRaw}\n\`\`\``;
    onInsertPrompt(prompt);
  };

  const sendRecapPromptToAI = () => {
    const prompt =
      "Tolong buatkan rangkuman komprehensif (Session Recap) dari percakapan kita sampai saat ini untuk disimpan ke `D:\\Obsidian\\Session_Recap.md` sesuai SOP kontinuitas proyek.";
    onInsertPrompt(prompt);
  };

  // Primary quota window
  const primaryProvider = report?.providers?.[0];
  const sessionWindow = primaryProvider?.windows.find((w) => w.kind === "session" && w.scope === null);
  const weeklyWindow = primaryProvider?.windows.find((w) => w.kind === "week" && w.scope === null);
  const sessionUsed = sessionWindow ? sessionWindow.used_percent : 0;

  if (!open) return null;

  return (
    <aside className={`right-sidebar${open ? " is-open" : ""}`} aria-label="Toolbox & Inspector">
      {/* Header & Tabs */}
      <div className="right-sidebar-header">
        <div className="right-sidebar-tabs" role="tablist">
          <button
            type="button"
            className={`right-tab-btn${activeTab === "macros" ? " is-active" : ""}`}
            onClick={() => setActiveTab("macros")}
            title="Macros & Memo Scratchpad"
          >
            <Zap size={14} />
            <span>Macros</span>
          </button>
          <button
            type="button"
            className={`right-tab-btn${activeTab === "swift" ? " is-active" : ""}`}
            onClick={() => setActiveTab("swift")}
            title="SWIFT MT/MX Tag Inspector"
          >
            <FileCode size={14} />
            <span>SWIFT</span>
          </button>
          <button
            type="button"
            className={`right-tab-btn${activeTab === "health" ? " is-active" : ""}`}
            onClick={() => setActiveTab("health")}
            title="Session Health & Context"
          >
            <Activity size={14} />
            <span>Health</span>
          </button>
        </div>

        <button
          type="button"
          className="icon-button"
          onClick={onClose}
          aria-label="Close panel"
          title="Close panel"
        >
          <X size={16} />
        </button>
      </div>

      {/* Content */}
      <div className="right-sidebar-content">
        {/* TAB 1: MACROS & SCRATCHPAD */}
        {activeTab === "macros" && (
          <>
            <section>
              <div className="sidebar-section-title">
                <span>⚡ Quick Command Macros</span>
              </div>
              <div className="macro-grid">
                {MACROS_LIST.map((m, idx) => (
                  <div className="macro-card" key={idx} onClick={() => sendMacroToComposer(m.cmd)}>
                    <div className="macro-card-info">
                      <span className="macro-card-title">{m.title}</span>
                      <span className="macro-card-cmd" title={m.cmd}>
                        {m.cmd}
                      </span>
                    </div>
                    <div style={{ display: "flex", gap: "4px" }}>
                      <button
                        type="button"
                        className="icon-button macro-card-action"
                        title="Copy Command"
                        onClick={(e) => {
                          e.stopPropagation();
                          copyMacro(m.cmd);
                        }}
                      >
                        {copiedCmd === m.cmd ? <Check size={14} color="#4ade80" /> : <Copy size={14} />}
                      </button>
                      <button
                        type="button"
                        className="icon-button macro-card-action"
                        title="Insert into chat"
                        onClick={(e) => {
                          e.stopPropagation();
                          sendMacroToComposer(m.cmd);
                        }}
                      >
                        <Play size={14} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </section>

            <section className="scratchpad-container">
              <div className="sidebar-section-title" style={{ margin: 0 }}>
                <span>📝 Memo Scratchpad</span>
                <button
                  type="button"
                  className="icon-button"
                  style={{ width: "22px", height: "22px" }}
                  onClick={() => onScratchpadChange("")}
                  title="Clear Memo"
                >
                  <Trash2 size={13} />
                </button>
              </div>
              <textarea
                className="scratchpad-textarea"
                placeholder="Tempel catatan sementara, IP address, atau case log di sini (auto-saved)..."
                value={scratchpad}
                onChange={(e) => onScratchpadChange(e.target.value)}
              />
              <div className="scratchpad-actions">
                <button
                  type="button"
                  className="scratchpad-btn"
                  onClick={() => copyMacro(scratchpad)}
                  disabled={!scratchpad.trim()}
                >
                  <Copy size={13} />
                  <span>Copy</span>
                </button>
                <button
                  type="button"
                  className="scratchpad-btn scratchpad-btn-primary"
                  onClick={() => onInsertPrompt(scratchpad)}
                  disabled={!scratchpad.trim()}
                >
                  <Send size={13} />
                  <span>Send to Chat</span>
                </button>
              </div>
            </section>
          </>
        )}

        {/* TAB 2: SWIFT INSPECTOR */}
        {activeTab === "swift" && (
          <div className="swift-inspector-container">
            <div className="sidebar-section-title">
              <span>🏦 SWIFT MT / MX Inspector</span>
              <button
                type="button"
                className="scratchpad-btn"
                style={{ padding: "2px 6px", fontSize: "11px" }}
                onClick={() => setSwiftRaw(SAMPLE_MT103)}
              >
                Sample MT103
              </button>
            </div>

            <textarea
              className="swift-textarea"
              placeholder="Paste raw SWIFT FIN MT / ISO 20022 MX message here..."
              value={swiftRaw}
              onChange={(e) => setSwiftRaw(e.target.value)}
            />

            <div className="swift-controls">
              <button
                type="button"
                className="scratchpad-btn scratchpad-btn-primary"
                style={{ width: "100%", justifyContent: "center" }}
                onClick={sendSwiftToAI}
                disabled={!swiftRaw.trim()}
              >
                <Sparkles size={14} />
                <span>Analyze with Agent</span>
              </button>
            </div>

            <div className="sidebar-section-title" style={{ margin: "4px 0 0" }}>
              <span>Parsed Fields ({parsedSwiftTags.length} tags)</span>
            </div>

            <div className="swift-tag-list">
              {parsedSwiftTags.length === 0 ? (
                <p style={{ fontSize: "var(--fs-xs)", color: "var(--text-dim)", textAlign: "center", padding: "12px" }}>
                  Paste a SWIFT message above to inspect fields.
                </p>
              ) : (
                parsedSwiftTags.map((tag, idx) => (
                  <div className="swift-tag-card" key={idx}>
                    <div className="swift-tag-header">
                      <span className="swift-tag-code">{tag.code}</span>
                      <span className="swift-tag-name" title={tag.name}>
                        {tag.name}
                      </span>
                    </div>
                    <div className="swift-tag-val">{tag.val}</div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {/* TAB 3: HEALTH & RECAP */}
        {activeTab === "health" && (
          <div className="health-context-box">
            <div className="sidebar-section-title">
              <span>📊 Context Window Monitor</span>
            </div>

            <div className="health-gauge-center">
              <p style={{ margin: 0, fontSize: "var(--fs-xs)", color: "var(--text-dim)" }}>
                Active Quota: <strong>{primaryProvider ? primaryProvider.account : "Gemini Antigravity"}</strong>
              </p>
              <p style={{ margin: "4px 0", fontSize: "var(--fs-2xl)", fontWeight: "bold", color: "var(--accent)" }}>
                {sessionWindow ? `${sessionUsed}%` : "—"}
              </p>
              <p style={{ margin: 0, fontSize: "11px", color: "var(--text-dim)" }}>
                {sessionWindow && formatResetIn(sessionWindow.resets_at, now)
                  ? `5-Hour Session resets in ${formatResetIn(sessionWindow.resets_at, now)}`
                  : "Session active"}
              </p>
            </div>

            {/* 90% Threshold Warning Card */}
            <div
              style={{
                padding: "10px",
                borderRadius: "var(--radius-md)",
                background: sessionUsed >= 90 ? "rgba(248, 113, 113, 0.15)" : "var(--bg-input)",
                border: sessionUsed >= 90 ? "1px solid #f87171" : "1px solid var(--border)",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: "11px", marginBottom: "4px" }}>
                <span>Rule 90% Context Safety</span>
                <span>{sessionUsed >= 90 ? "⚠️ Critical" : "✅ Safe"}</span>
              </div>
              <div
                style={{
                  height: "6px",
                  background: "var(--border)",
                  borderRadius: "99px",
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    height: "100%",
                    width: `${Math.min(100, Math.max(10, sessionUsed))}%`,
                    background: sessionUsed >= 90 ? "#f87171" : "var(--accent)",
                  }}
                />
              </div>
              {sessionUsed >= 90 ? (
                <p style={{ margin: "6px 0 0", fontSize: "11px", color: "#f87171", lineHeight: 1.4 }}>
                  Pemakaian token mendekati ambang 90%. Segera recap percakapan agar sesi tidak penuh!
                </p>
              ) : (
                <p style={{ margin: "6px 0 0", fontSize: "11px", color: "var(--text-dim)" }}>
                  Context aman. Tombol di bawah siap dipakai kapan pun lu butuh rekap sesi.
                </p>
              )}
            </div>

            <button type="button" className="health-recap-btn" onClick={sendRecapPromptToAI}>
              <Sparkles size={15} />
              <span>Draft Session Recap to Obsidian</span>
            </button>

            {weeklyWindow && (
              <div style={{ fontSize: "11px", color: "var(--text-dim)", marginTop: "4px" }}>
                Weekly Limit: <strong>{weeklyWindow.used_percent}% used</strong> (Resets in{" "}
                {formatResetIn(weeklyWindow.resets_at, now) ?? "weekly"})
              </div>
            )}
          </div>
        )}
      </div>
    </aside>
  );
}
