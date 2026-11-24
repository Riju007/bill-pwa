import { json } from "./http";
import { handleBills } from "./routes/bills";
import { handleCustomers } from "./routes/customers";
import { handleDashboard } from "./routes/dashboard";
import { handleProducts } from "./routes/products";

export default {
    async fetch(request: Request, env: Env): Promise<Response> {
        const url = new URL(request.url);

        if (request.method === "GET" && url.pathname === "/api/health") {
            return json({ status: "ok" });
        }

        if (request.method === "GET" && url.pathname === "/api/time") {
            const now = new Date();
            const ist = now.toLocaleString("en-IN", {
                timeZone: "Asia/Kolkata",
                timeZoneName: "short",
            });
            return json({ utc: now.toISOString(), ist });
        }

        for (const handler of [handleDashboard, handleBills, handleCustomers, handleProducts]) {
            const response = await handler(request, env);
            if (response) return response;
        }

        return json({ error: "Not found" }, 404);
    },
};
