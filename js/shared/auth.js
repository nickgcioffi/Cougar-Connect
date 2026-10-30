import { initializeSupabase, loadAccount } from "./api.js";

export async function requireAccount() {
  const supabase = await initializeSupabase();
  const { data, error } = await supabase.auth.getSession();
  if (error || !data.session) {
    window.location.replace("/");
    return null;
  }
  try {
    const account = await loadAccount();
    return { account, session: data.session, supabase };
  } catch (requestError) {
    if (/session|sign in/i.test(requestError.message))
      window.location.replace("/");
    throw requestError;
  }
}

export function nextSetupPage(account) {
  if (!account.profile) return "/profile";
  if (account.interests.length < 3) return "/interests";
  return null;
}
