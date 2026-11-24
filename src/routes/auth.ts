import { json, readJson, text } from "../http";

type AuthEnv = Env & Partial<Record<"LOGIN_USERNAME" | "LOGIN_PASSWORD" | "LOGIN_SESSION_SECRET", string>>;

const SESSION_COOKIE = "pb_ledger_session";
const SESSION_TTL_SECONDS = 60 * 60 * 12;

function configured(env: AuthEnv): boolean {
    return Boolean(env.LOGIN_USERNAME || env.LOGIN_PASSWORD || env.LOGIN_SESSION_SECRET);
}

function configurationComplete(env: AuthEnv): boolean {
    return Boolean(env.LOGIN_USERNAME && env.LOGIN_PASSWORD && env.LOGIN_SESSION_SECRET);
}

function base64Url(bytes: Uint8Array): string {
    let binary = "";
    bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
    return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

async function sign(value: string, secret: string): Promise<string> {
    const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    return base64Url(new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value))));
}

function cookie(request: Request, name: string): string | null {
    const match = request.headers.get("cookie")?.match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`));
    return match?.[1] ?? null;
}

async function validSession(request: Request, env: AuthEnv): Promise<boolean> {
    if (!configurationComplete(env)) return false;
    const value = cookie(request, SESSION_COOKIE);
    if (!value) return false;
    const separator = value.lastIndexOf(".");
    if (separator < 1) return false;
    const payload = value.slice(0, separator);
    const signature = value.slice(separator + 1);
    if (signature !== await sign(payload, env.LOGIN_SESSION_SECRET!)) return false;
    const expirySeparator = payload.lastIndexOf("|");
    if (expirySeparator < 1) return false;
    const username = payload.slice(0, expirySeparator);
    const expiresAt = payload.slice(expirySeparator + 1);
    return username === env.LOGIN_USERNAME && Number(expiresAt) > Math.floor(Date.now() / 1000);
}

function sessionCookie(value: string, maxAge: number): string {
    return `${SESSION_COOKIE}=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}; Secure`;
}

export async function requireAuthentication(request: Request, env: AuthEnv): Promise<Response | null> {
    if (!configured(env)) return null;
    if (!configurationComplete(env)) return json({ error: "Login configuration is incomplete." }, 503);
    return await validSession(request, env) ? null : json({ error: "Please log in to continue." }, 401);
}

export async function handleAuth(request: Request, env: AuthEnv): Promise<Response | null> {
    const url = new URL(request.url);
    if (!url.pathname.startsWith("/api/auth/")) return null;

    if (url.pathname === "/api/auth/session" && request.method === "GET") {
        if (!configured(env)) return json({ authenticated: true, configured: false });
        if (!configurationComplete(env)) return json({ authenticated: false, configured: true, error: "Login configuration is incomplete." }, 503);
        return json({ authenticated: await validSession(request, env), configured: true });
    }

    if (url.pathname === "/api/auth/login" && request.method === "POST") {
        if (!configurationComplete(env)) return json({ error: "Login is not configured." }, 503);
        const parsed = await readJson(request);
        if (!parsed.ok) return json({ error: parsed.error }, 400);
        const username = text(parsed.value.username);
        const password = text(parsed.value.password);
        if (!username || !password || username !== env.LOGIN_USERNAME || password !== env.LOGIN_PASSWORD) {
            return json({ error: "Invalid username or password." }, 401);
        }
        const expiresAt = Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS;
        const payload = `${env.LOGIN_USERNAME}|${expiresAt}`;
        const response = json({ authenticated: true });
        response.headers.set("Set-Cookie", sessionCookie(`${payload}.${await sign(payload, env.LOGIN_SESSION_SECRET!)}`, SESSION_TTL_SECONDS));
        return response;
    }

    if (url.pathname === "/api/auth/logout" && request.method === "POST") {
        const response = json({ authenticated: false });
        response.headers.set("Set-Cookie", sessionCookie("", 0));
        return response;
    }

    return json({ error: "Not found" }, 404);
}
