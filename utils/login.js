const authUrl = "https://transport.zone01oujda.ma/api/auth/login";
const headers = {
  "User-Agent":
    "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:131.0) Gecko/20100101 Firefox/131.0",
  Accept: "*/*",
  "Content-Type": "application/json",
};

export const login = async (username, password) => {
  const resp = await fetch(authUrl, {
    headers,
    body: JSON.stringify({ login: username, password, rememberMe: true }),
    method: "POST",
  });

  if (!resp.ok) {
    let detail = "";
    try {
      detail = JSON.stringify(await resp.json());
    } catch {
      detail = String(await resp.text());
    }
    throw new Error(`login failed (${resp.status}): ${detail}`);
  }

  const tokenCookie = resp.headers
    .getSetCookie()
    .find((c) => c.startsWith("__Secure-elgencia.session_token"));

  if (!tokenCookie) {
    throw new Error("login ok but no session token in response");
  }

  return tokenCookie.split("=")[1].split(";")[0];
};
