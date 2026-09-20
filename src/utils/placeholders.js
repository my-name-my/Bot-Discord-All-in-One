/**
 * Welcome/goodbye/announcement text placeholders:
 *   {user} {username} {server} {memberCount} {mention}
 * Plus any extra key=value pairs passed in `extra`.
 */
function applyPlaceholders(text, data = {}) {
  if (!text) return '';
  const user = data.user || null;
  const guild = data.guild || null;
  let out = String(text);

  const map = {
    '{user}': user ? user.toString() : '',
    '{mention}': user ? user.toString() : '',
    '{username}': user ? user.username : '',
    '{server}': guild ? guild.name : '',
    '{memberCount}': String(guild ? guild.memberCount : (data.memberCount ?? '')),
  };

  for (const [token, value] of Object.entries(map)) {
    out = out.split(token).join(value);
  }

  for (const [key, value] of Object.entries(data.extra || {})) {
    out = out.split(`{${key}}`).join(String(value));
  }

  return out;
}

module.exports = { applyPlaceholders };
