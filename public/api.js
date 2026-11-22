export class ApiError extends Error {
  constructor(code, status) {
    super(code);
    this.code = code;
    this.status = status;
  }
}

async function request(path, options = {}) {
  let response;
  try {
    response = await fetch(path, {
      ...options,
      headers: options.body ? { "Content-Type": "application/json" } : undefined,
      body: options.body ? JSON.stringify(options.body) : undefined,
    });
  } catch (err) {
    if (err.name === "AbortError") throw err;
    throw new ApiError("offline", 0);
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new ApiError(data.error ?? "server_error", response.status);
  return data;
}

export const api = {
  config: () => request("/api/config"),
  party: (since) => request(`/api/party${since === undefined ? "" : `?since=${since}`}`),
  suggest: (input, sessionToken, signal) => request("/api/places/suggest", { method: "POST", body: { input, sessionToken }, signal }),
  address: (placeId, sessionToken) => request("/api/places/address", { method: "POST", body: { placeId, sessionToken } }),
  join: (fields) => request("/api/join", { method: "POST", body: fields }),
  changeMember: (memberId, change) => request(`/api/members/${memberId}`, { method: "POST", body: change }),
};
