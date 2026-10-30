let supabase;

export async function initializeSupabase() {
  if (supabase) return supabase;
  const response = await fetch("/api/config");
  if (!response.ok) throw new Error("Run the app using npm start.");
  const config = await response.json();
  supabase = window.createSupabaseClient(config.url, config.key);
  return supabase;
}

export function getSupabase() {
  return supabase;
}

export async function apiRequest(path, body) {
  const { data } = await supabase.auth.getSession();
  const response = await fetch(`/api/${path}`, {
    method: body ? "POST" : "GET",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${data.session?.access_token || ""}`,
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || "Request failed");
  return result;
}

export const loadAccount = () => apiRequest("state");
export const runAction = (action, payload) =>
  apiRequest("action", { action, payload });
