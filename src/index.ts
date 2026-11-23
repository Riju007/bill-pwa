// src/index.ts
interface Env {
    SHOP_NAME: string;
    DEMO_SECRET?: string;
}

export default {
    async fetch(request: Request, env: Env): Promise<Response> {
        const url = new URL(request.url);

        if (request.method === "GET" && url.pathname === "/api/health") {
            return Response.json({ status: "ok" });
        }

        if (request.method === "GET" && url.pathname === "/api/time") {
            const now = new Date();
            const ist = now.toLocaleString("en-IN", {
                timeZone: "Asia/Kolkata",
                timeZoneName: "short",
            });
            return Response.json({ utc: now.toISOString(), ist });
        }

        if (request.method === "GET" && url.pathname === "/api/config") {
            return Response.json({
                shopName: env.SHOP_NAME,
                secretConfigured: Boolean(env.DEMO_SECRET),
            });
        }

        return Response.json({ error: "Not found" }, { status: 404 });
    },
};