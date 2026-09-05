export async function readJsonResponse<T extends object>(
  response: Response,
): Promise<Partial<T>> {
  const text = await response.text();
  if (!text) return {};

  try {
    const value: unknown = JSON.parse(text);
    return typeof value === "object" && value !== null && !Array.isArray(value)
      ? (value as Partial<T>)
      : {};
  } catch {
    return {};
  }
}
