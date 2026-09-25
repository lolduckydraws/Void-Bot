import { SlashCommandBuilder } from 'discord.js';
import { createEmbed } from '../../utils/embeds.js';
import { getEconomyData, setEconomyData } from '../../utils/economy.js';
import { withErrorHandling, createError, ErrorTypes } from '../../utils/errorHandler.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';

const SLOTS_COOLDOWN = 5 * 60 * 1000;
const REEL_COUNT = 5;

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
    const counts = {};

    for (const symbol of reels) {
        counts[symbol.emoji] = (counts[symbol.emoji] || 0) + 1;
    }

    let bestSymbol = null;
    let bestCount = 0;

    for (const symbol of SLOT_SYMBOLS) {
        const count = counts[symbol.emoji] || 0;

        if (count > bestCount) {
            bestCount = count;
            bestSymbol = symbol;
        }
    }

    if (bestCount >= 3) {
        return {
            won: true,
            symbol: bestSymbol,
            count: bestCount,
            multiplier: bestSymbol.multiplier,
        };
    }

    return {
        won: false,
        symbol: bestSymbol,
        count: bestCount,
        multiplier: 0,
    };
}

function formatReels(reels) {
    return reels.map(symbol => symbol.emoji).join('  ');
}

function wait(ms) {
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

        // Cooldown check
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

        // Wallet check
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

        // Generate the result before displaying anything.
        const reels = generateReels();
        const result = getSlotResult(reels);

        /*
         * Show the spinning screen first.
         */
        const spinningEmbed = createEmbed({
            title: '🎰 Void Slots',
            description:
                `The reels are spinning...\n\n` +
                `**❓  ❓  ❓  ❓  ❓**\n\n` +
                `💰 Bet: **$${betAmount.toLocaleString()}**`,
            color: '#2C2F33',
        }).setFooter({
            text: 'The Void is deciding your fate...',
        });

        await InteractionHelper.safeEditReply(interaction, {
            embeds: [spinningEmbed],
        });

        /*
         * Short suspense delay.
         * This is NOT a reel animation.
         */
        await wait(1500);

        /*
         * Apply the result.
         */
        let cashChange = 0;
        let resultEmbed;

        if (result.won) {
            const payout = betAmount * result.multiplier;

            // The bet is considered at stake,
            // so only the profit is added to the wallet.
            cashChange = payout - betAmount;

            resultEmbed = createEmbed({
                title: '🎰 VOID SLOTS — YOU WON!',
                description:
                    `**${formatReels(reels)}**\n\n` +
                    `✨ You matched **${result.count}× ${result.symbol.emoji} ${result.symbol.name}**!\n\n` +
                    `🎯 Payout: **${result.multiplier}×**\n` +
                    `💰 You won **$${payout.toLocaleString()}**!\n` +
                    `📈 Net profit: **+$${cashChange.toLocaleString()}**`,
                color: '#2ECC71',
            });
        } else {
            cashChange = -betAmount;

            resultEmbed = createEmbed({
                title: '🎰 VOID SLOTS — YOU LOST',
                description:
                    `**${formatReels(reels)}**\n\n` +
                    `💔 No matching combination.\n\n` +
                    `You lost **$${betAmount.toLocaleString()}**.`,
                color: '#E74C3C',
            });
        }

        userData.wallet = (userData.wallet || 0) + cashChange;
        userData.lastSlots = Date.now();

        await setEconomyData(
            client,
            guildId,
            userId,
            userData
        );

        resultEmbed.addFields(
            {
                name: '💰 New Cash Balance',
                value: `$${userData.wallet.toLocaleString()}`,
                inline: true,
            },
            {
                name: '🎲 Bet',
                value: `$${betAmount.toLocaleString()}`,
                inline: true,
            }
        );

        resultEmbed.setFooter({
            text: 'Next Void Slots spin available in 5 minutes.',
        });

        /*
         * Edit the SAME Discord message with the final result.
         */
        await InteractionHelper.safeEditReply(interaction, {
            embeds: [resultEmbed],
        });
    }, { command: 'slots' }),
};