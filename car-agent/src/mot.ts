import { fetchHtml, normaliseReg, visibleText } from "./util.js";

/**
 * MOT history for a UK registration.
 *
 * Preferred: the official DVSA MOT History API (free, needs registration at
 * https://documentation.history.mot.api.gov.uk/). Set DVSA_CLIENT_ID,
 * DVSA_CLIENT_SECRET, DVSA_API_KEY and DVSA_TOKEN_URL (from the DVSA email).
 *
 * Fallback: read the public results page on check-mot.service.gov.uk.
 */
export async function getMotHistory(registration: string): Promise<string> {
  const reg = normaliseReg(registration);
  const { DVSA_CLIENT_ID, DVSA_CLIENT_SECRET, DVSA_API_KEY, DVSA_TOKEN_URL } = process.env;

  if (DVSA_CLIENT_ID && DVSA_CLIENT_SECRET && DVSA_API_KEY && DVSA_TOKEN_URL) {
    const tokenRes = await fetch(DVSA_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "client_credentials",
        client_id: DVSA_CLIENT_ID,
        client_secret: DVSA_CLIENT_SECRET,
        scope: process.env.DVSA_SCOPE ?? "https://tapi.dvsa.gov.uk/.default",
      }),
    });
    if (!tokenRes.ok) throw new Error(`DVSA token request failed: HTTP ${tokenRes.status}`);
    const { access_token } = (await tokenRes.json()) as { access_token: string };

    const res = await fetch(
      `https://history.mot.api.gov.uk/v1/trade/vehicles/registration/${reg}`,
      { headers: { Authorization: `Bearer ${access_token}`, "X-API-Key": DVSA_API_KEY } },
    );
    if (res.status === 404) return `No MOT record found for ${reg}.`;
    if (!res.ok) throw new Error(`DVSA MOT API failed: HTTP ${res.status}`);
    return JSON.stringify(await res.json(), null, 1);
  }

  const html = await fetchHtml(`https://www.check-mot.service.gov.uk/results?registration=${reg}`);
  return visibleText(html, 60000);
}
