// Consulta uma conta do cofre SEM trocar a sessão do navegador.
// Usa uma regra temporária (declarativeNetRequest) que injeta o header Cookie só nas
// requisições marcadas com "_ec=1"; o resto da extensão e o navegador não são afetados.
const RULE_ID = 9001;
const MARK = "_ec=1";

async function setCookieRule(cookie) {
  await chrome.declarativeNetRequest.updateSessionRules({
    removeRuleIds: [RULE_ID],
    addRules: [{
      id: RULE_ID, priority: 1,
      action: { type: "modifyHeaders", requestHeaders: [{ header: "Cookie", operation: "set", value: `.ROBLOSECURITY=${cookie}` }] },
      condition: { urlFilter: MARK, requestDomains: ["roblox.com"], resourceTypes: ["xmlhttprequest"] }
    }]
  });
}
const clearRule = () => chrome.declarativeNetRequest.updateSessionRules({ removeRuleIds: [RULE_ID] }).catch(() => {});

const get = (url) => fetch(url + (url.includes("?") ? "&" : "?") + MARK, { credentials: "omit", cache: "no-store" });
const json = (p) => p.then((r) => (r.ok ? r.json() : null)).catch(() => null);

/** → { status: "valid", user, info } | { status: "expired" } | { status: "error", code } */
export async function inspectAccount(cookie) {
  try {
    await setCookieRule(String(cookie).trim());
    const a = await get("https://users.roblox.com/v1/users/authenticated");
    if (a.status === 401) return { status: "expired" };
    if (!a.ok) return { status: "error", code: a.status };
    const user = await a.json();

    const [cur, prem, fr] = await Promise.all([
      json(get(`https://economy.roblox.com/v1/users/${user.id}/currency`)),
      json(get(`https://premiumfeatures.roblox.com/v1/users/${user.id}/validate-membership`)),
      json(get(`https://friends.roblox.com/v1/users/${user.id}/friends/count`))
    ]);
    return {
      status: "valid", user,
      info: {
        robux: typeof cur?.robux === "number" ? cur.robux : null,
        premium: typeof prem === "boolean" ? prem : null,
        friends: typeof fr?.count === "number" ? fr.count : null,
        checkedAt: Date.now()
      }
    };
  } catch (e) {
    return { status: "error", code: 0 };
  } finally { await clearRule(); }
}
