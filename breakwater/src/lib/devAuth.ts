export function devBypassAllowedFromRequest(req: Request) {
  if (process.env.NODE_ENV === "production") return false;

  const expected = process.env.DEV_BYPASS_KEY;
  if (!expected) return false;

  const provided = req.headers.get("x-dev-bypass");
  return provided === expected;
}
