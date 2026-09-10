export function corsOrigins(): true | string[] {
  const configured = process.env.CORS_ORIGIN?.trim();

  if (!configured) {
    return true;
  }

  const origins = configured
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  return origins.length > 0 ? origins : true;
}
