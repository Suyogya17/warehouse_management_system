const OFFER_AUDIENCE_EMAIL_LINKS = {
  'prabin.birtamod@nepcha.com': 'ishwor.birtamod@nepcha.com',
  'boss@nepcha.com': 'pramod.kathmandu@nepcha.com',
};

const resolveOfferAudienceUserId = async (user = {}, runQuery) => {
  const role = String(user.role || '').toUpperCase();
  const linkedEmail = OFFER_AUDIENCE_EMAIL_LINKS[String(user.email || '').trim().toLowerCase()];

  if (role !== 'ELDER' || !linkedEmail) return Number(user.id);

  const rows = await runQuery(
    `SELECT id FROM users
     WHERE LOWER(email) = ? AND role = 'USER'
     LIMIT 1`,
    [linkedEmail]
  );

  return Number(rows.rows?.[0]?.id || rows[0]?.id || user.id);
};

module.exports = { resolveOfferAudienceUserId };
