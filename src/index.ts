// src/index.ts
export default {
    async fetch(request: Request): Promise<Response> {
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

        return Response.json({ error: "Not found" }, { status: 404 });
    },
};