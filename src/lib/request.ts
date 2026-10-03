export function isSameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  return new URL(origin).host === request.headers.get("host");
}

export function badRequest(message: string, status = 400): Response {
  return Response.json({ error: message }, { status });
}
