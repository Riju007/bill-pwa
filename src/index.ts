export default {
    async fetch(request: Request): Promise<Response> {
        const url = new URL(request.url);

        if (request.method === "GET" && url.pathname === "/api/health") {
            return Response.json({ status: "ok" });
        }

        return Response.json({ error: "Not found" }, { status: 404 });
    },
};