import { SlashCommandBuilder } from 'discord.js';
import { createEmbed } from '../../utils/embeds.js';
import { getEconomyData, setEconomyData } from '../../utils/economy.js';
import { withErrorHandling, createError, ErrorTypes } from '../../utils/errorHandler.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';

const SLOTS_COOLDOWN = 5 * 60 * 1000;

const SLOT_SYMBOLS = [
    {
        emoji: '🪙',
        name: 'Void Coin',
        multiplier: 2,
    },
    {
        emoji: '🍒',
        name: 'Cherry',
        multiplier: 3,
    },
    {
        emoji: '💎',
        name: 'Void Crystal',
        multiplier: 5,
    },
    {
        emoji: '👁️',
        name: 'Void Eye',
        multiplier: 8,
    },
    {
        emoji: '🕳️',
        name: 'Void Hole',
        multiplier: 15,
    },
    {
        emoji: '👑',
        name: 'Void Crown',
        multiplier: 25,
    },
];

const REEL_COUNT = 5;

function getRandomSymbol() {
    return SLOT_SYMBOLS[
        Math.floor(Math.random() * SLOT_SYMBOLS.length)
    ];
}

function generateReels() {
    return Array.from(
        { length: REEL_COUNT },
        () => getRandomSymbol()
    );
}

function getSlotResult(reels) {
    const counts = new Map();

    for (const symbol of reels) {
        const current = counts.get(symbol.emoji) || 0;

        counts.set(symbol.emoji, current + 1);
    }

    let bestMatch = null;
    let bestCount = 0;

    for (const [emoji, count] of counts.entries()) {
        if (count > bestCount) {
            bestCount = count;
            bestMatch = SLOT_SYMBOLS.find(
                symbol => symbol.emoji === emoji
            );
        }
    }

    if (bestCount >= 3 && bestMatch) {
        return {
            won: true,
            matchCount: bestCount,
            symbol: bestMatch,
            multiplier: bestMatch.multiplier,
        };
    }

    return {
        won: false,
        matchCount: bestCount,
        symbol: bestMatch,
        multiplier: 0,
    };
}

function formatReels(reels) {
    return reels.map(symbol => symbol.emoji).join('  ');
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

export default {
    data: new SlashCommandBuilder()
        .setName('slots')
        .setDescription('Spin the Void Slots and gamble your money')
        .addIntegerOption(option =>
            option
                .setName('amount')
                .setDescription('Amount of cash to bet')
                .setRequired(true)
                .setMinValue(1)
        ),

    execute: withErrorHandling(async (interaction, config, client) => {
        const deferred = await InteractionHelper.safeDefer(interaction);
        if (!deferred) return;

        const userId = interaction.user.id;
        const guildId = interaction.guildId;
        const betAmount = interaction.options.getInteger('amount');
        const now = Date.now();

        const userData = await getEconomyData(
            client,
            guildId,
            userId
        );

        const lastSlots = userData.lastSlots || 0;

        if (now < lastSlots + SLOTS_COOLDOWN) {
            const remaining = lastSlots + SLOTS_COOLDOWN - now;

            const minutes = Math.floor(
                remaining / (1000 * 60)
            );

            const seconds = Math.floor(
                (remaining % (1000 * 60)) / 1000
            );

            throw createError(
                'Slots cooldown active',
                ErrorTypes.RATE_LIMIT,
                `The Void Slots need to cool down. Wait **${minutes}m ${seconds}s** before spinning again.`,
                {
                    remaining,
                    cooldownType: 'slots',
                }
            );
        }

        if (userData.wallet < betAmount) {
            throw createError(
                'Insufficient cash for slots',
                ErrorTypes.VALIDATION,
                `You only have **$${userData.wallet.toLocaleString()}** cash, but you're trying to bet **$${betAmount.toLocaleString()}**.`,
                {
                    required: betAmount,
                    current: userData.wallet,
                }
            );
        }

        /*
         * Set the cooldown before the spin starts.
         * This prevents the command from being spammed
         * while the animation is running.
         */
        userData.lastSlots = now;

        /*
         * Generate the final result before the animation.
         * The animation only reveals the already-determined result.
         */
        const finalReels = generateReels();
        const result = getSlotResult(finalReels);

        /*
         * Initial mystery screen.
         */
        const mysteryEmbed = createEmbed({
            title: '🎰 Void Slots',
            description:
                `The Void stares back at you...\n\n` +
                `**❓  ❓  ❓  ❓  ❓**\n\n` +
                `💰 Bet: **$${betAmount.toLocaleString()}**\n\n` +
                `*The reels are spinning...*`,
            color: '#2C2F33',
        }).setFooter({
            text: 'Good luck...',
        });

        await InteractionHelper.safeEditReply(interaction, {
            embeds: [mysteryEmbed],
        });

        /*
         * Reveal the reels one by one.
         */
        for (let i = 0; i < REEL_COUNT; i++) {
            await sleep(600);

            const visibleReels = finalReels.map(
                (symbol, index) =>
                    index <= i ? symbol : { emoji: '❓' }
            );

            const spinningEmbed = createEmbed({
                title: '🎰 Void Slots',
                description:
                    `The reels are spinning...\n\n` +
                    `**${formatReels(visibleReels)}**\n\n` +
                    `💰 Bet: **$${betAmount.toLocaleString()}**`,
                color: '#2C2F33',
            }).setFooter({
                text: `Reel ${i + 1}/${REEL_COUNT} revealed...`,
            });

            await InteractionHelper.safeEditReply(interaction, {
                embeds: [spinningEmbed],
            });
        }

        /*
         * Calculate the player's final balance.
         *
         * A win gives the full payout.
         * A loss removes the original bet.
         */
        let cashChange = 0;
        let resultTitle;
        let resultDescription;
        let resultColor;

        if (result.won) {
            const payout = betAmount * result.multiplier;

            cashChange = payout - betAmount;

            resultTitle = '🎰 VOID SLOTS — WIN!';
            resultDescription =
                `**${formatReels(finalReels)}**\n\n` +
                `✨ **${result.matchCount} matching symbols!**\n\n` +
                `${result.symbol.emoji} **${result.symbol.name}** pays **${result.multiplier}×**!\n\n` +
                `💰 You won **$${payout.toLocaleString()}**!\n` +
                `📈 Net profit: **+$${cashChange.toLocaleString()}**`;

            resultColor = '#2ECC71';
        } else {
            cashChange = -betAmount;

            resultTitle = '🎰 VOID SLOTS — LOSS';
            resultDescription =
                `**${formatReels(finalReels)}**\n\n` +
                `💔 No matching combination.\n\n` +
                `You lost **$${betAmount.toLocaleString()}**.`;

            resultColor = '#E74C3C';
        }

        userData.wallet = (userData.wallet || 0) + cashChange;

        await setEconomyData(
            client,
            guildId,
            userId,
            userData
        );

        const resultEmbed = createEmbed({
            title: resultTitle,
            description: resultDescription,
            color: resultColor,
        })
            .addFields({
                name: '💰 New Cash Balance',
                value: `$${userData.wallet.toLocaleString()}`,
                inline: true,
            })
            .addFields({
                name: '🎲 Bet',
                value: `$${betAmount.toLocaleString()}`,
                inline: true,
            })
            .setFooter({
                text: 'Next Void Slots spin available in 5 minutes.',
            });

        await InteractionHelper.safeEditReply(interaction, {
            embeds: [resultEmbed],
        });
    }, { command: 'slots' }),
};