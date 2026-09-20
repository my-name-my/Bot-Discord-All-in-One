/**
 * Component handler — routes button / select-menu / modal interactions
 * to feature modules. Custom IDs are namespaced:
 *
 *   "module:action:extra1:extra2"    (buttons & selects)
 *   "modal:module:action:extra1"     (modals)
 *
 * Feature modules register route functions via registerComponent() /
 * registerModal(). Every route receives (interaction, client, params[])
 * and is responsible for its own permission checks + try/catch-free flow —
 * errors bubble to the centralized handler below.
 */
const logger = require('../utils/logger');
const embeds = require('../utils/embeds');
const i18n = require('../services/i18nService');
const guildConfigService = require('../services/guildConfigService');
const permissionService = require('../services/permissionService');

const routes = new Map(); // 'module:action' → { execute, permissions }
const modalRoutes = new Map();

function registerComponent(moduleName, action, handler, options = {}) {
  routes.set(`${moduleName}:${action}`, { execute: handler, ...options });
}

function registerModal(moduleName, action, handler, options = {}) {
  modalRoutes.set(`${moduleName}:${action}`, { execute: handler, ...options });
}

function parseCustomId(customId) {
  const parts = String(customId).split(':');
  const isModal = parts[0] === 'modal';
  const offset = isModal ? 1 : 0;
  return {
    isModal,
    key: parts.length > offset + 1 ? `${parts[offset]}:${parts[offset + 1]}` : parts[offset] || '',
    params: parts.slice(offset + 2),
  };
}

async function dispatch(client, interaction) {
  const customId = interaction.customId;
  if (!customId) return false;
  const { isModal, key, params } = parseCustomId(customId);
  const table = isModal ? modalRoutes : routes;
  const route = table.get(key);
  if (!route) return false;

  try {
    const guildConfig = interaction.guild ? await guildConfigService.get(interaction.guild.id) : null;
    const language = guildConfig?.language || null;
    const t = (k, p) => i18n.translate(language, k, p);

    if (route.tier && interaction.guild) {
      const check = permissionService.checkPermission({
        member: interaction.member,
        userId: interaction.user?.id,
        guildConfig,
        client,
        requiredTier: route.tier,
        t,
      });
      if (!check.ok) {
        await safeReply(interaction, { embeds: [embeds.errorEmbed(t('common.noPermissions'))] }, true);
        return true;
      }
    }

    await route.execute({ interaction, client, params, guildConfig, t });
  } catch (error) {
    logger.error('components', `${customId} failed: ${error.stack || error}`);
    await safeReply(interaction, { embeds: [embeds.errorEmbed(i18n.translate(null, 'common.error'))] }, true);
  }
  return true;
}

async function safeReply(interaction, payload, ephemeral = false) {
  try {
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp({ ...payload, flags: ephemeral ? 64 : undefined });
    } else {
      await interaction.reply({ ...payload, flags: ephemeral ? 64 : undefined });
    }
  } catch {
    /* interaction may have expired — nothing else to do */
  }
}

module.exports = { registerComponent, registerModal, dispatch, parseCustomId };
