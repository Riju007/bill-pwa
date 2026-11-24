export type Parsed<T> = { ok: true; value: T } | { ok: false; error: string };

export function json(data: unknown, status = 200): Response {
    return Response.json(data, { status });
}

export function text(v: unknown): string | null {
    return typeof v === "string" && v.trim() !== "" ? v.trim() : null;
}

export async function readJson(request: Request): Promise<Parsed<Record<string, unknown>>> {
    try {
        const body = await request.json();
        if (typeof body !== "object" || body === null || Array.isArray(body)) {
            return { ok: false, error: "Body must be a JSON object" };
        }
        return { ok: true, value: body as Record<string, unknown> };
    } catch {
        return { ok: false, error: "Invalid JSON" };
    }
}
