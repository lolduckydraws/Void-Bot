import { SlashCommandBuilder } from 'discord.js';
import { createEmbed } from '../../utils/embeds.js';
import { getEconomyData, setEconomyData } from '../../utils/economy.js';
import { withErrorHandling, createError, ErrorTypes } from '../../utils/errorHandler.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';

const WANDER_COOLDOWN = 20 * 60 * 1000;

const VOID_LOOT = [
    {
        name: 'Void Coins',
        emoji: '🪙',
        rarity: 'common',
        minReward: 250,
        maxReward: 500,
    },
    {
        name: 'Lost Wallet',
        emoji: '👛',
        rarity: 'common',
        minReward: 300,
        maxReward: 500,
    },
    {
        name: 'Forgotten Treasure Chest',
        emoji: '📦',
        rarity: 'uncommon',
        minReward: 400,
        maxReward: 700,
    },
    {
        name: 'Void Crystal',
        emoji: '💎',
        rarity: 'rare',
        minReward: 600,
        maxReward: 900,
    },
    {
        name: 'Ancient Void Key',
        emoji: '🗝️',
        rarity: 'epic',
        minReward: 800,
        maxReward: 1200,
    },
    {
        name: 'Lost Void Relic',
        emoji: '👁️',
        rarity: 'legendary',
        minReward: 1000,
        maxReward: 1500,
    },
];

const WANDER_MESSAGES = [
    'You wander deeper into the endless Void...',
    'You follow a strange light flickering in the distance...',
    'You stumble across something buried beneath the Void...',
    'You hear something moving nearby and decide to investigate...',
    'You wander through a forgotten part of the Void...',
];

const rarityColors = {
    common: '#95A5A6',
    uncommon: '#2ECC71',
    rare: '#3498DB',
    epic: '#9B59B6',
    legendary: '#F1C40F',
};

function getRandomLoot() {
    const rand = Math.random();

    if (rand < 0.50) {
        return VOID_LOOT.filter(item => item.rarity === 'common')[
            Math.floor(Math.random() * 2)
        ];
    }

    if (rand < 0.75) {
        return VOID_LOOT.find(item => item.rarity === 'uncommon');
    }

    if (rand < 0.90) {
        return VOID_LOOT.find(item => item.rarity === 'rare');
    }

    if (rand < 0.98) {
        return VOID_LOOT.find(item => item.rarity === 'epic');
    }

    return VOID_LOOT.find(item => item.rarity === 'legendary');
}

export default {
    data: new SlashCommandBuilder()
        .setName('wander')
        .setDescription('Wander through the Void and search for lost treasures'),

    execute: withErrorHandling(async (interaction, config, client) => {
        const deferred = await InteractionHelper.safeDefer(interaction);
        if (!deferred) return;

        const userId = interaction.user.id;
        const guildId = interaction.guildId;
        const now = Date.now();

        const userData = await getEconomyData(client, guildId, userId);

        const lastWander = userData.lastWander || 0;

        if (now < lastWander + WANDER_COOLDOWN) {
            const remaining = lastWander + WANDER_COOLDOWN - now;

            const minutes = Math.floor(
                remaining / (1000 * 60)
            );

            const seconds = Math.floor(
                (remaining % (1000 * 60)) / 1000
            );

            throw createError(
                'Wandering cooldown active',
                ErrorTypes.RATE_LIMIT,
                `The Void isn't ready to let you wander again. Wait **${minutes}m ${seconds}s** before trying again.`,
                { remaining, cooldownType: 'wander' }
            );
        }

        userData.lastWander = now;

        // 8% chance of getting lost and losing all wallet money.
        if (Math.random() < 0.08) {
            const lostMoney = userData.wallet;

            userData.wallet = 0;

            await setEconomyData(client, guildId, userId, userData);

            const embed = createEmbed({
                title: 'Lost in the Void',
                description:
                    `You wandered too far into the darkness...\n\n` +
                    `🕳️ You became completely lost in the Void.\n\n` +
                    `You lost **$${lostMoney.toLocaleString()}** from your wallet.`,
                color: '#2C2F33',
            })
                .addFields({
                    name: 'New Cash Balance',
                    value: '$0',
                    inline: true,
                })
                .setFooter({
                    text: 'The Void will let you wander again in 20 minutes.',
                });

            await InteractionHelper.safeEditReply(interaction, {
                embeds: [embed],
            });

            return;
        }

        const loot = getRandomLoot();

        const earned = Math.floor(
            Math.random() * (loot.maxReward - loot.minReward + 1)
        ) + loot.minReward;

        userData.wallet += earned;

        await setEconomyData(client, guildId, userId, userData);

        const wanderMessage =
            WANDER_MESSAGES[
                Math.floor(Math.random() * WANDER_MESSAGES.length)
            ];

        const embed = createEmbed({
            title: 'Void Wandering',
            description:
                `${wanderMessage}\n\n` +
                `You discovered a **${loot.emoji} ${loot.name}**!\n\n` +
                `You sold it for **$${earned.toLocaleString()}**!`,
            color: rarityColors[loot.rarity],
        })
            .addFields(
                {
                    name: 'New Cash Balance',
                    value: `$${userData.wallet.toLocaleString()}`,
                    inline: true,
                },
                {
                    name: 'Rarity',
                    value:
                        loot.rarity.charAt(0).toUpperCase() +
                        loot.rarity.slice(1),
                    inline: true,
                }
            )
            .setFooter({
                text: 'You can wander through the Void again in 20 minutes.',
            });

        await InteractionHelper.safeEditReply(interaction, {
            embeds: [embed],
        });
    }, { command: 'wander' }),
};