import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

import type { SessionSnapshot } from "../shared/protocol.ts";
import { parseCookies, sessionCookie, TOKEN_COOKIE } from "./auth.ts";
import { badRequest, jsonResponse } from "./http.ts";

export interface StoredUser {
  username: string;
  password: string;
  createdAt: number;
}

export const USER_COOKIE = "herdr_user";

const STATE_DIR = process.env["HERDR_PLUGIN_STATE_DIR"] ?? join(homedir(), ".local", "state", "herdr-web-ui");
const USERS_FILE = join(STATE_DIR, "users.json");
const WORKSPACE_MAP_FILE = join(STATE_DIR, "user-workspaces.json");

function ensureStateDir(): void {
  if (!existsSync(STATE_DIR)) {
    try {
      mkdirSync(STATE_DIR, { recursive: true });
    } catch {}
  }
}

function loadUsers(): Record<string, StoredUser> {
  ensureStateDir();
  try {
    if (existsSync(USERS_FILE)) {
      return JSON.parse(readFileSync(USERS_FILE, "utf8")) as Record<string, StoredUser>;
    }
  } catch {}
  return {};
}

function saveUsers(users: Record<string, StoredUser>): void {
  ensureStateDir();
  try {
    writeFileSync(USERS_FILE, JSON.stringify(users, null, 2), "utf8");
  } catch {}
}

function loadWorkspaceMap(): Record<string, string> {
  ensureStateDir();
  try {
    if (existsSync(WORKSPACE_MAP_FILE)) {
      return JSON.parse(readFileSync(WORKSPACE_MAP_FILE, "utf8")) as Record<string, string>;
    }
  } catch {}
  return {};
}

function saveWorkspaceMap(map: Record<string, string>): void {
  ensureStateDir();
  try {
    writeFileSync(WORKSPACE_MAP_FILE, JSON.stringify(map, null, 2), "utf8");
  } catch {}
}

export function tagWorkspaceOwner(workspaceId: string, username: string): void {
  const map = loadWorkspaceMap();
  map[workspaceId] = username;
  saveWorkspaceMap(map);
}

export function filterSnapshotForUser(snapshot: SessionSnapshot, username: string | null): SessionSnapshot {
  if (!username) {
    // If not logged in, show empty session
    return {
      ...snapshot,
      focused_workspace_id: "" as any,
      focused_tab_id: "" as any,
      focused_pane_id: "" as any,
      workspaces: [],
      tabs: [],
      panes: [],
      agents: [],
      layouts: [],
    };
  }

  const map = loadWorkspaceMap();
  // Any existing workspace without explicit owner belongs to "priyo" (the host owner)
  const userWorkspaces = snapshot.workspaces.filter((w) => {
    const owner = map[w.workspace_id] ?? "priyo";
    return owner === username.toLowerCase().trim();
  });
  const allowedWsIds = new Set(userWorkspaces.map((w) => w.workspace_id));

  const userTabs = snapshot.tabs.filter((t) => allowedWsIds.has(t.workspace_id));
  const allowedTabIds = new Set(userTabs.map((t) => t.tab_id));

  const userPanes = snapshot.panes.filter((p) => allowedTabIds.has(p.tab_id));
  const userAgents = (snapshot.agents ?? []).filter((a) => allowedWsIds.has(a.workspace_id));
  const userLayouts = (snapshot.layouts ?? []).filter((l) => allowedWsIds.has(l.workspace_id));

  const firstWs = userWorkspaces[0];
  const firstTab = userTabs.find((t) => t.workspace_id === firstWs?.workspace_id);
  const firstPane = userPanes.find((p) => p.tab_id === firstTab?.tab_id);

  return {
    ...snapshot,
    focused_workspace_id: allowedWsIds.has(snapshot.focused_workspace_id)
      ? snapshot.focused_workspace_id
      : (firstWs?.workspace_id ?? ("" as any)),
    focused_tab_id: allowedTabIds.has(snapshot.focused_tab_id)
      ? snapshot.focused_tab_id
      : (firstTab?.tab_id ?? ("" as any)),
    focused_pane_id:
      snapshot.focused_pane_id && userPanes.some((p) => p.pane_id === snapshot.focused_pane_id)
        ? snapshot.focused_pane_id
        : (firstPane?.pane_id ?? ("" as any)),
    workspaces: userWorkspaces,
    tabs: userTabs,
    panes: userPanes,
    agents: userAgents,
    layouts: userLayouts,
  };
}

export function getUserFromRequest(request: Request): string | null {
  const cookies = parseCookies(request.headers.get("cookie"));
  const username = cookies.get(USER_COOKIE);
  if (!username) return null;
  const users = loadUsers();
  const matched = users[username.toLowerCase().trim()];
  return matched ? matched.username : null;
}

export async function handleUserRequest(request: Request, pathname: string, serverToken: string): Promise<Response> {
  // GET /api/user/me
  if (pathname === "/api/user/me" && request.method === "GET") {
    const username = getUserFromRequest(request);
    if (!username) {
      return jsonResponse({ error: { code: "unauthorized", message: "Belum login" } }, 401);
    }
    return jsonResponse({
      user: {
        username,
        name: username.charAt(0).toUpperCase() + username.slice(1),
        isAdmin: username.toLowerCase() === "priyo",
      },
    });
  }

  // GET /api/user/all (Admin only / Team list)
  if (pathname === "/api/user/all" && request.method === "GET") {
    const caller = getUserFromRequest(request);
    const users = loadUsers();
    return jsonResponse({
      users: Object.values(users).map((u) => ({
        username: u.username,
        name: u.username.charAt(0).toUpperCase() + u.username.slice(1),
        createdAt: u.createdAt,
        isAdmin: u.username.toLowerCase() === "priyo",
      })),
      canManage: caller?.toLowerCase() === "priyo",
    });
  }

  // POST /api/user/delete (Admin only)
  if (pathname === "/api/user/delete" && (request.method === "POST" || request.method === "DELETE")) {
    const caller = getUserFromRequest(request);
    if (!caller || caller.toLowerCase() !== "priyo") {
      return jsonResponse({ error: { code: "forbidden", message: "Hanya akun admin (priyo) yang dapat menghapus user!" } }, 403);
    }
    let body: any;
    try {
      body = await request.json();
    } catch {
      return badRequest("invalid_json", "Invalid JSON payload");
    }
    const target = String(body.username || "").toLowerCase().trim();
    if (!target || target === "priyo") {
      return badRequest("cannot_delete_admin", "Akun admin (priyo) tidak dapat dihapus!");
    }
    const users = loadUsers();
    if (!users[target]) {
      return badRequest("not_found", "User tidak ditemukan!");
    }
    delete users[target];
    saveUsers(users);

    // Clean up workspaces owned by this user
    const wsMap = loadWorkspaceMap();
    let modified = false;
    for (const [wsId, owner] of Object.entries(wsMap)) {
      if (owner.toLowerCase() === target) {
        delete wsMap[wsId];
        modified = true;
      }
    }
    if (modified) saveWorkspaceMap(wsMap);

    return jsonResponse({ success: true, message: `Akun ${target} dan datanya berhasil dihapus.` });
  }

  // POST /api/user/login (Auto-Register if user not found, or verify password if exists)
  if (pathname === "/api/user/login" && request.method === "POST") {
    let body: any;
    try {
      body = await request.json();
    } catch {
      return badRequest("invalid_json", "Invalid JSON payload");
    }

    const username = String(body.username || "").toLowerCase().trim();
    const password = String(body.password || "").trim();

    if (!username || username.length < 2) {
      return badRequest("invalid_username", "Username minimal 2 karakter");
    }
    if (!password || password.length < 4) {
      return badRequest("invalid_password", "Password minimal 4 karakter");
    }

    const users = loadUsers();
    let isNew = false;

    if (!users[username]) {
      // Auto-create user account on first login
      users[username] = {
        username,
        password,
        createdAt: Date.now(),
      };
      saveUsers(users);
      isNew = true;
    } else {
      // Verify existing password
      if (users[username].password !== password) {
        return jsonResponse(
          {
            error: {
              code: "invalid_password",
              message: "Password salah untuk akun ini! Harap masukkan password yang sama saat akun ini dibuat.",
            },
          },
          401,
        );
      }
    }

    // Set cookies
    const userCookie = `${USER_COOKIE}=${encodeURIComponent(username)}; Path=/; SameSite=Strict; HttpOnly; Max-Age=31536000`;
    const authCookie = sessionCookie(serverToken, false);

    const headers = new Headers();
    headers.append("Set-Cookie", userCookie);
    headers.append("Set-Cookie", authCookie);
    headers.set("Content-Type", "application/json");

    return new Response(
      JSON.stringify({
        success: true,
        isNew,
        user: {
          username,
          name: username.charAt(0).toUpperCase() + username.slice(1),
        },
      }),
      { status: 200, headers },
    );
  }

  // POST /api/user/logout
  if (pathname === "/api/user/logout" && (request.method === "POST" || request.method === "DELETE")) {
    const headers = new Headers();
    headers.append("Set-Cookie", `${USER_COOKIE}=; Path=/; SameSite=Strict; HttpOnly; Max-Age=0`);
    headers.append("Set-Cookie", `${TOKEN_COOKIE}=; Path=/; SameSite=Strict; HttpOnly; Max-Age=0`);
    headers.append("Set-Cookie", `herdr_web_device=; Path=/; SameSite=Strict; HttpOnly; Max-Age=0`);
    headers.set("Content-Type", "application/json");

    return new Response(JSON.stringify({ success: true }), { status: 200, headers });
  }

  return badRequest("not_found", "User API route not found");
}
