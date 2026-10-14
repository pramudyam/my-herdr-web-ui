import "./AccessGate.css";

import { type FormEvent, useEffect, useRef, useState } from "react";

import { ApiError, authenticate, pairDevice } from "../lib/api.ts";
import { deviceLabel } from "../lib/phone.ts";
import type { AccessRefusal } from "../../shared/protocol.ts";
import { useT } from "../lib/i18n.ts";

export interface AccessGateProps {
  /** why the server refused this browser, when it said */
  reason: AccessRefusal | null;
  /** the code a scanned QR code brought along: submitted at once */
  initialCode: string;
  /** Fires once the server set a cookie: the shell can mount, and every later fetch and the WebSocket carry it. */
  onUnlocked: () => void;
}

export function AccessGate({ reason, initialCode, onUnlocked }: AccessGateProps) {
  const t = useT();
  const codeRef = useRef<HTMLInputElement | null>(null);
  const tokenRef = useRef<HTMLInputElement | null>(null);
  const [code, setCode] = useState(initialCode);
  const [token, setToken] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState<"login" | "code" | "token" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const scanned = useRef(code.length === 6);

  const submitUserLogin = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    if (submitting) return;
    if (!username.trim()) return;
    setSubmitting("login");
    setError(null);
    try {
      const res = await fetch("/api/user/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error?.message || "Login gagal");
      }
      const data = await res.json();
      try {
        localStorage.setItem("herdr-web-ui:current-user", JSON.stringify(data.user));
      } catch {}
      onUnlocked();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setSubmitting(null);
    }
  };

  const pair = async (value: string): Promise<void> => {
    if (submitting) return;
    setSubmitting("code");
    setError(null);
    try {
      await pairDevice(value, deviceLabel(navigator.userAgent, navigator.maxTouchPoints ?? 0));
      onUnlocked();
    } catch (err) {
      setError(err instanceof ApiError && err.status === 401 ? t("That code is wrong, used up or expired. Start a new pairing on the PC.") : err instanceof Error ? err.message : String(err));
      setSubmitting(null);
      codeRef.current?.select();
    }
  };

  // a scanned QR code brings the code along: no typing on the phone
  useEffect(() => { if (scanned.current) { scanned.current = false; void pair(code); } }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const submitCode = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    if (code.length !== 6) { codeRef.current?.focus(); return; }
    void pair(code);
  };

  const submitToken = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    if (submitting) return;
    if (token === "") { tokenRef.current?.focus(); return; }
    setSubmitting("token");
    setError(null);
    try {
      await authenticate(token);
      onUnlocked();
    } catch (err) {
      setError(err instanceof ApiError && err.status === 401 ? t("Token does not match.") : err instanceof Error ? err.message : String(err));
      setSubmitting(null);
      tokenRef.current?.select();
    }
  };

  return (
    <main className="access-gate-screen">
      <div className="access-gate" data-testid="token-gate" style={{ width: "min(100%, 380px)" }}>
        <img src="/icons/icon-192.png?v=ram1" alt="" width="48" height="48" className="access-gate-mark" />
        <h1 id="access-gate-title" className="access-gate-title">
          Vensys AI <span className="brand-sub">Korwil 1</span>
        </h1>
        <p className="access-gate-copy" style={{ marginBottom: "16px" }}>
          Knowledge Base & Technical Assistant Perbankan
        </p>

        {/* Multi-User Login Form */}
        <form onSubmit={(e) => void submitUserLogin(e)} style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          <div>
            <label className="access-gate-label" htmlFor="access-gate-user">Username</label>
            <input
              id="access-gate-user"
              className="access-gate-input"
              type="text"
              placeholder="Masukkan username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoFocus
              required
            />
          </div>

          <div>
            <label className="access-gate-label" htmlFor="access-gate-pass">Password</label>
            <input
              id="access-gate-pass"
              className="access-gate-input"
              type="password"
              placeholder="Masukkan password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
            <p style={{ margin: "6px 0 0", fontSize: "11px", color: "var(--text-dim)", lineHeight: 1.4 }}>
              *Jika username baru, akun akan otomatis dibuat dengan password ini.
            </p>
          </div>

          <button type="submit" className="access-gate-submit" style={{ width: "100%", marginTop: "4px" }} disabled={submitting !== null}>
            {submitting === "login" ? "Memproses…" : "Masuk / Buat Akun"}
          </button>
        </form>

        {error !== null && (
          <p id="access-gate-error" className="access-gate-error" role="alert">{error}</p>
        )}

        {/* Collapsible Alternative Pairing / Token Login */}
        <details className="access-gate-alt" style={{ marginTop: "20px", borderTop: "var(--hairline) solid var(--border)", paddingTop: "12px" }}>
          <summary style={{ fontSize: "11px", color: "var(--text-dim)", cursor: "pointer" }}>Opsi Lain: Pairing Code / Token Herdr</summary>
          <form style={{ marginTop: "10px" }} onSubmit={submitCode}>
            <label className="access-gate-label" htmlFor="access-gate-code">{t("Pairing code")}</label>
            <input
              ref={codeRef}
              id="access-gate-code"
              className="access-gate-input"
              type="text"
              inputMode="numeric"
              maxLength={7}
              placeholder="000 000"
              value={code}
              onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
            />
            <button type="submit" className="access-gate-submit" style={{ width: "100%" }} disabled={submitting !== null}>
              {submitting === "code" ? "Pairing…" : "Pair this device"}
            </button>
          </form>

          <form style={{ marginTop: "10px" }} onSubmit={(event) => void submitToken(event)}>
            <label className="access-gate-label" htmlFor="access-gate-token">{t("Access token")}</label>
            <input
              ref={tokenRef}
              id="access-gate-token"
              className="access-gate-input"
              type="password"
              value={token}
              onChange={(event) => setToken(event.target.value)}
            />
            <button type="submit" className="access-gate-submit" style={{ width: "100%" }} disabled={submitting !== null}>
              {submitting === "token" ? "Unlocking…" : "Unlock with Token"}
            </button>
          </form>
        </details>
      </div>
    </main>
  );
}
