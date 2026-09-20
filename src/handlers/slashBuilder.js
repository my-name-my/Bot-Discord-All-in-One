/**
 * Converts command definitions into Discord ApplicationCommand JSON for
 * registration via REST. Mirrors the shape used by prefixParser so both
 * paths stay in sync.
 *
 * Type mapping: string→3 int→4 bool→5 user→6 channel→7 role→8
 *               (9 = mentionable not needed; duration stays string)
 */
const OPTION_TYPES = { string: 3, int: 4, bool: 5, user: 6, channel: 7, role: 8 };

function optionToJSON(optDef) {
  const json = {
    name: optDef.name,
    description: (optDef.description || '…').slice(0, 100),
    type: OPTION_TYPES[optDef.type] || 3,
    required: Boolean(optDef.required),
  };
  if (Array.isArray(optDef.choices) && optDef.choices.length && json.type === 3) {
    json.choices = optDef.choices.slice(0, 25).map((c) => ({
      name: String(c.name).slice(0, 100),
      value: String(c.value).slice(0, 100),
    }));
  }
  if (optDef.autocomplete) json.autocomplete = true;
  return json;
}

/**
 * @param {object[]} commands canonical command definitions
 * @returns {object[]} REST-ready JSON bodies
 */
function buildSlashCommands(commands) {
  const bodies = [];
  for (const command of commands) {
    if (command.slash === false) continue;
    const body = {
      name: command.name.toLowerCase(),
      description: (command.description || 'No description').slice(0, 100),
      options: [],
      dm_permission: command.guildOnly === false,
      default_member_permissions: undefined,
    };

    if (Array.isArray(command.subcommands) && command.subcommands.length) {
      // Subcommands can't coexist with top-level options in Discord API.
      body.options = command.subcommands.map((sub) => ({
        name: sub.name,
        description: (sub.description || '…').slice(0, 100),
        type: sub.subcommands ? 2 : 1, // 2 = subcommand group
        options: (sub.options || []).map(optionToJSON).concat(
          sub.subcommands
            ? sub.subcommands.map((nested) => ({ ...optionToJSON(nested), type: 1 }))
            : []
        ),
      }));
    } else if (Array.isArray(command.options)) {
      body.options = command.options.map(optionToJSON);
    }

    // Context-menu style extras (user/message commands) are registered
    // separately by commands that define `contextMenu`.
    bodies.push(body);
    if (command.contextMenu) {
      bodies.push({
        name: command.contextMenu.name.slice(0, 32),
        type: command.contextMenu.type === 'message' ? 3 : 2,
        dm_permission: false,
      });
    }
  }
  return bodies;
}

module.exports = { buildSlashCommands, OPTION_TYPES };
