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
  Plus,
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

const SWIFT_MT_NAMES: Record<string, string> = {
  MT101: "Request for Transfer",
  MT103: "Single Customer Credit Transfer",
  MT199: "Free Format Message",
  MT202: "General Financial Institution Transfer",
  MT202COV: "Cover Payment (Bank Transfer)",
  MT299: "Free Format Message",
  MT300: "Foreign Exchange Confirmation",
  MT320: "Fixed Loan/Deposit Confirmation",
  MT700: "Issue of Documentary Credit (LC)",
  MT760: "Demand Guarantee / Standby LC",
  MT900: "Confirmation of Debit",
  MT910: "Confirmation of Credit",
  MT940: "Customer Statement Message",
  MT950: "Statement Message",
  MT999: "Free Format Message",
};

const SWIFT_FIN_TAG_NAMES: Record<string, string> = {
  ":14S:": "Settlement Rate Source",
  ":15A:": "New Sequence A (General Information)",
  ":15B:": "New Sequence B (Transaction Details)",
  ":15C:": "New Sequence C (Optional Amounts)",
  ":17T:": "Block Identifier",
  ":20:": "Sender's Reference (TRN)",
  ":21:": "Related Reference",
  ":22A:": "Type of Operation",
  ":22B:": "Type of Event",
  ":22C:": "Common Reference",
  ":23B:": "Bank Operation Code",
  ":23E:": "Instruction Code",
  ":26T:": "Transaction Type Code",
  ":30T:": "Trade Date",
  ":30V:": "Value Date",
  ":30X:": "Expiry Date",
  ":31C:": "Date of Issue",
  ":31D:": "Date & Place of Expiry",
  ":32A:": "Value Date / CCY / Amount",
  ":32B:": "Currency / Amount Bought",
  ":33B:": "Currency / Amount Sold",
  ":36:": "Exchange Rate",
  ":50A:": "Ordering Customer (BIC)",
  ":50F:": "Ordering Customer (Structured)",
  ":50K:": "Ordering Customer (Name & Addr)",
  ":52A:": "Ordering Institution (BIC)",
  ":52D:": "Ordering Institution (Name)",
  ":53A:": "Sender's Correspondent",
  ":53B:": "Sender's Correspondent",
  ":54A:": "Receiver's Correspondent",
  ":56A:": "Intermediary Institution",
  ":57A:": "Account With Institution (Receiving Agent BIC)",
  ":57D:": "Account With Institution",
  ":58A:": "Beneficiary Institution",
  ":58D:": "Beneficiary Institution",
  ":59:": "Beneficiary Customer",
  ":59A:": "Beneficiary Customer (BIC)",
  ":59F:": "Beneficiary Customer (Structured)",
  ":60F:": "Opening Balance",
  ":61:": "Statement Line",
  ":62F:": "Closing Balance",
  ":64:": "Closing Available Balance",
  ":70:": "Remittance Information",
  ":71A:": "Details of Charges (OUR/SHA/BEN)",
  ":71F:": "Sender's Charges",
  ":71G:": "Receiver's Charges",
  ":72:": "Sender to Receiver Info",
  ":77A:": "Settlement Details",
  ":77B:": "Regulatory Reporting",
  ":77D:": "Terms and Conditions",
  ":82A:": "Party A (BIC)",
  ":82D:": "Party A (Name & Address)",
  ":87A:": "Party B (BIC)",
  ":87D:": "Party B (Name & Address)",
};

interface MacroItem {
  title: string;
  cmd: string;
  desc?: string;
}

const DEFAULT_MACROS: MacroItem[] = [
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

const SAMPLE_MT300 = `{1:F01SPXAIDJAXXXX0000000001}{2:I300SPXAIDJAXXXXN}{3:{108:M300MUR001}{121:8afb3785-bb73-4cfa-a2d2-a373926cb5ee}}{4:
:15A:
:20:MT300BASE01
:22A:NEWT
:22C:SPXA011027SPXA01
:82A:SPXAIDJAXXX
:87A:SPXAIDJAXXX
:15B:
:30T:20260324
:30V:20260325
:36:1,055
:32B:USD1186600,00
:57A:CHASUS33XXX
:33B:EUR1100000,00
:57A:BMRIIDJAXXX
-}`;

export function RightSidebar({ open, onClose, onInsertPrompt }: RightSidebarProps) {
  const t = useT();
  const { settings } = useSettings();
  const [activeTab, setActiveTab] = useState<TabMode>("macros");
  const [copiedCmd, setCopiedCmd] = useState<string | null>(null);

  // Custom Macros State
  const [macros, setMacros] = useState<MacroItem[]>(() => {
    try {
      const stored = localStorage.getItem("herdr-web-ui:custom-macros");
      return stored ? (JSON.parse(stored) as MacroItem[]) : DEFAULT_MACROS;
    } catch {
      return DEFAULT_MACROS;
    }
  });
  const [addingMacro, setAddingMacro] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newCmd, setNewCmd] = useState("");

  const saveNewMacro = () => {
    if (!newTitle.trim() || !newCmd.trim()) return;
    const updated = [{ title: newTitle.trim(), cmd: newCmd.trim() }, ...macros];
    setMacros(updated);
    try {
      localStorage.setItem("herdr-web-ui:custom-macros", JSON.stringify(updated));
    } catch {}
    setNewTitle("");
    setNewCmd("");
    setAddingMacro(false);
  };

  const deleteMacro = (idx: number) => {
    const updated = macros.filter((_, i) => i !== idx);
    setMacros(updated);
    try {
      localStorage.setItem("herdr-web-ui:custom-macros", JSON.stringify(updated));
    } catch {}
  };

  const resetMacros = () => {
    setMacros(DEFAULT_MACROS);
    try {
      localStorage.removeItem("herdr-web-ui:custom-macros");
    } catch {}
  };

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
  const parsedSwiftData = useMemo(() => {
    const raw = swiftRaw.trim();
    if (!raw) return { messageType: null, senderBic: null, receiverBic: null, tags: [] };

    // Detect MT message type from Block 2
    let messageType: string | null = null;
    const mtMatch = raw.match(/\{2:[IO](\d{3})/i);
    if (mtMatch) {
      const code = "MT" + mtMatch[1];
      const name = SWIFT_MT_NAMES[code] ?? "SWIFT Financial Message";
      messageType = `${code} — ${name}`;
    } else if (raw.includes("pacs.008")) {
      messageType = "pacs.008 — FI to FI Customer Credit Transfer";
    } else if (raw.includes("pacs.009")) {
      messageType = "pacs.009 — Financial Institution Credit Transfer";
    } else if (raw.includes("camt.053")) {
      messageType = "camt.053 — Bank-to-Customer Statement";
    }

    // Detect Sender BIC from Block 1
    const senderMatch = raw.match(/\{1:F\d{2}([A-Z0-9]{12})/i);
    const senderBic = senderMatch ? senderMatch[1] : null;

    // Detect Receiver BIC from Block 2
    const receiverMatch = raw.match(/\{2:[IO]\d{3}([A-Z0-9]{12})/i);
    const receiverBic = receiverMatch ? receiverMatch[1] : null;

    // FIN MT Detection: match :XX: or :XXA:
    const tagRegex = /(:\d{2}[A-Z]?:)([\s\S]*?)(?=(:\d{2}[A-Z]?:)|-\}|$)/g;
    const tags: { code: string; name: string; val: string }[] = [];
    let match;

    while ((match = tagRegex.exec(raw)) !== null) {
      const code = match[1]!;
      const val = match[2]!.trim();
      const name = SWIFT_FIN_TAG_NAMES[code] ?? "SWIFT Standard Field";
      tags.push({
        code,
        name,
        val: val.length > 0 ? val : "(Sequence delimiter / Marker)",
      });
    }

    if (tags.length > 0) {
      return { messageType, senderBic, receiverBic, tags };
    }

    // XML / MX Fallback Detection
    const xmlRegex = /<([a-zA-Z0-9]+)>([^<]+)<\/\1>/g;
    let xmlMatch;
    while ((xmlMatch = xmlRegex.exec(raw)) !== null) {
      tags.push({
        code: `<${xmlMatch[1]}>`,
        name: "ISO 20022 Element",
        val: xmlMatch[2]!.trim(),
      });
    }

    return { messageType, senderBic, receiverBic, tags };
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
                <span>⚡ Quick Macros</span>
                <div style={{ display: "flex", gap: "4px", alignItems: "center" }}>
                  <button
                    type="button"
                    className="scratchpad-btn"
                    style={{ padding: "2px 6px", fontSize: "11px" }}
                    onClick={() => setAddingMacro(!addingMacro)}
                    title="Add Custom Macro"
                  >
                    <Plus size={11} />
                    <span>Add</span>
                  </button>
                  <button
                    type="button"
                    className="icon-button"
                    style={{ width: "20px", height: "20px" }}
                    onClick={resetMacros}
                    title="Reset to Defaults"
                  >
                    <RotateCcw size={11} />
                  </button>
                </div>
              </div>

              {addingMacro && (
                <div className="add-macro-form">
                  <input
                    className="macro-input"
                    placeholder="Judul (misal: Ping Server BJB)"
                    value={newTitle}
                    onChange={(e) => setNewTitle(e.target.value)}
                  />
                  <input
                    className="macro-input"
                    placeholder="Command (misal: ping 10.10.20.1)"
                    value={newCmd}
                    onChange={(e) => setNewCmd(e.target.value)}
                    style={{ fontFamily: "var(--font-mono)" }}
                  />
                  <div className="macro-form-actions">
                    <button
                      type="button"
                      className="scratchpad-btn"
                      onClick={() => setAddingMacro(false)}
                    >
                      Batal
                    </button>
                    <button
                      type="button"
                      className="scratchpad-btn scratchpad-btn-primary"
                      onClick={saveNewMacro}
                      disabled={!newTitle.trim() || !newCmd.trim()}
                    >
                      Simpan
                    </button>
                  </div>
                </div>
              )}

              <div className="macro-grid">
                {macros.map((m, idx) => (
                  <div className="macro-card" key={idx} onClick={() => sendMacroToComposer(m.cmd)}>
                    <div className="macro-card-info">
                      <span className="macro-card-title">{m.title}</span>
                      <span className="macro-card-cmd" title={m.cmd}>
                        {m.cmd}
                      </span>
                    </div>
                    <div style={{ display: "flex", gap: "2px", alignItems: "center" }}>
                      <button
                        type="button"
                        className="icon-button macro-card-action"
                        title="Copy Command"
                        onClick={(e) => {
                          e.stopPropagation();
                          copyMacro(m.cmd);
                        }}
                      >
                        {copiedCmd === m.cmd ? <Check size={14} color="#4ade80" /> : <Copy size={13} />}
                      </button>
                      <button
                        type="button"
                        className="icon-button macro-card-action"
                        title="Delete Macro"
                        onClick={(e) => {
                          e.stopPropagation();
                          deleteMacro(idx);
                        }}
                      >
                        <Trash2 size={13} />
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
                        <Play size={13} />
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
                className="icon-button"
                style={{ width: "22px", height: "22px" }}
                onClick={() => setSwiftRaw("")}
                title="Kosongkan Box"
              >
                <Trash2 size={13} />
              </button>
            </div>

            <div style={{ display: "flex", gap: "6px", alignItems: "center", marginBottom: "2px" }}>
              <span style={{ fontSize: "11px", color: "var(--text-dim)" }}>Samples:</span>
              <button
                type="button"
                className="scratchpad-btn"
                style={{ padding: "2px 7px", fontSize: "11px" }}
                onClick={() => setSwiftRaw(SAMPLE_MT103)}
              >
                MT103
              </button>
              <button
                type="button"
                className="scratchpad-btn"
                style={{ padding: "2px 7px", fontSize: "11px" }}
                onClick={() => setSwiftRaw(SAMPLE_MT300)}
              >
                MT300
              </button>
            </div>

            <textarea
              className="swift-textarea"
              placeholder="Paste raw SWIFT FIN MT (MT103, MT300, dll) atau ISO 20022 MX di sini..."
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

            {/* Detected Message Type Header Badge */}
            {parsedSwiftData.messageType && (
              <div
                style={{
                  background: "var(--bg-input)",
                  border: "1px solid var(--accent)",
                  borderRadius: "var(--radius-md)",
                  padding: "8px 10px",
                  display: "flex",
                  flexDirection: "column",
                  gap: "3px",
                }}
              >
                <div style={{ fontSize: "var(--fs-xs)", fontWeight: "bold", color: "var(--accent)" }}>
                  {parsedSwiftData.messageType}
                </div>
                {(parsedSwiftData.senderBic || parsedSwiftData.receiverBic) && (
                  <div style={{ fontSize: "11px", color: "var(--text-dim)", fontFamily: "var(--font-mono)" }}>
                    {parsedSwiftData.senderBic && <span>From: {parsedSwiftData.senderBic} </span>}
                    {parsedSwiftData.receiverBic && <span>→ To: {parsedSwiftData.receiverBic}</span>}
                  </div>
                )}
              </div>
            )}

            <div className="sidebar-section-title" style={{ margin: "4px 0 0" }}>
              <span>Parsed Fields ({parsedSwiftData.tags.length} tags)</span>
            </div>

            <div className="swift-tag-list">
              {parsedSwiftData.tags.length === 0 ? (
                <p style={{ fontSize: "var(--fs-xs)", color: "var(--text-dim)", textAlign: "center", padding: "12px" }}>
                  Paste a SWIFT message above to inspect fields.
                </p>
              ) : (
                parsedSwiftData.tags.map((tag, idx) => (
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
