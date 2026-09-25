import {
    SlashCommandBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ComponentType,
} from 'discord.js';

import { createEmbed } from '../../utils/embeds.js';
import {
    getEconomyData,
    setEconomyData,
} from '../../utils/economy.js';

import {
    withErrorHandling,
    createError,
    ErrorTypes,
} from '../../utils/errorHandler.js';

import { InteractionHelper } from '../../utils/interactionHelper.js';

const BJ_COOLDOWN = 5 * 60 * 1000;
const BJ_TIMEOUT = 2 * 60 * 1000;

const SUITS = [
    { symbol: '♠️', name: 'Spades' },
    { symbol: '♥️', name: 'Hearts' },
    { symbol: '♦️', name: 'Diamonds' },
    { symbol: '♣️', name: 'Clubs' },
];

const RANKS = [
    { rank: '2', value: 2 },
    { rank: '3', value: 3 },
    { rank: '4', value: 4 },
    { rank: '5', value: 5 },
    { rank: '6', value: 6 },
    { rank: '7', value: 7 },
    { rank: '8', value: 8 },
    { rank: '9', value: 9 },
    { rank: '10', value: 10 },
    { rank: 'J', value: 10 },
    { rank: 'Q', value: 10 },
    { rank: 'K', value: 10 },
    { rank: 'A', value: 11 },
];

function createDeck() {
    const deck = [];

    for (const suit of SUITS) {
        for (const rank of RANKS) {
            deck.push({
                rank: rank.rank,
                value: rank.value,
                suit: suit.symbol,
            });
        }
    }

    return deck.sort(() => Math.random() - 0.5);
}

function drawCard(deck) {
    return deck.pop();
}

function calculateHand(hand) {
    let total = 0;
    let aces = 0;

    for (const card of hand) {
        total += card.value;

        if (card.rank === 'A') {
            aces++;
        }
    }

    while (total > 21 && aces > 0) {
        total -= 10;
        aces--;
    }

    return total;
}

function isBlackjack(hand) {
    return (
        hand.length === 2 &&
        calculateHand(hand) === 21
    );
}

function formatCard(card) {
    return `${card.rank}${card.suit}`;
}

function formatHand(hand) {
    return hand.map(formatCard).join('  ');
}

function createButtons(userId, canDouble = true) {
    const hitButton = new ButtonBuilder()
        .setCustomId(`bj_hit_${userId}`)
        .setLabel('HIT')
        .setEmoji('👊')
        .setStyle(ButtonStyle.Primary);

    const standButton = new ButtonBuilder()
        .setCustomId(`bj_stand_${userId}`)
        .setLabel('STAND')
        .setEmoji('🛑')
        .setStyle(ButtonStyle.Secondary);

    const doubleButton = new ButtonBuilder()
        .setCustomId(`bj_double_${userId}`)
        .setLabel('DOUBLE')
        .setEmoji('💰')
        .setStyle(ButtonStyle.Success)
        .setDisabled(!canDouble);

    return new ActionRowBuilder().addComponents(
        hitButton,
        standButton,
        doubleButton
    );
}

function createDisabledButtons() {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('bj_finished_hit')
            .setLabel('HIT')
            .setEmoji('👊')
            .setStyle(ButtonStyle.Primary)
            .setDisabled(true),

        new ButtonBuilder()
            .setCustomId('bj_finished_stand')
            .setLabel('STAND')
            .setEmoji('🛑')
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(true),

        new ButtonBuilder()
            .setCustomId('bj_finished_double')
            .setLabel('DOUBLE')
            .setEmoji('💰')
            .setStyle(ButtonStyle.Success)
            .setDisabled(true)
    );
}

function buildGameEmbed({
    playerHand,
    dealerHand,
    bet,
    playerName,
    revealDealer = false,
    status = 'Your move.',
}) {
    const playerTotal = calculateHand(playerHand);

    let dealerText;
    let dealerTotalText;

    if (revealDealer) {
        dealerText = formatHand(dealerHand);
        dealerTotalText = calculateHand(dealerHand);
    } else {
        dealerText = `${formatCard(dealerHand[0])}  🂠`;
        dealerTotalText = '?';
    }

    return createEmbed({
        title: '🃏 Void Blackjack',
        description:
            `**${playerName}'s Hand**\n` +
            `${formatHand(playerHand)}\n` +
            `Total: **${playerTotal}**\n\n` +

            `**Dealer's Hand**\n` +
            `${dealerText}\n` +
            `Total: **${dealerTotalText}**\n\n` +

            `💰 Bet: **$${bet.toLocaleString()}**\n\n` +
            `*${status}*`,
        color: '#2C2F33',
    });
}

export default {
    data: new SlashCommandBuilder()
        .setName('bj')
        .setDescription('Play a game of Blackjack')
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
        const originalBet = interaction.options.getInteger('amount');
        const now = Date.now();

        const userData = await getEconomyData(
            client,
            guildId,
            userId
        );

        const lastBj = userData.lastBj || 0;

        if (now < lastBj + BJ_COOLDOWN) {
            const remaining = lastBj + BJ_COOLDOWN - now;

            const minutes = Math.floor(
                remaining / (1000 * 60)
            );

            const seconds = Math.floor(
                (remaining % (1000 * 60)) / 1000
            );

            throw createError(
                'Blackjack cooldown active',
                ErrorTypes.RATE_LIMIT,
                `You need to cool down before playing Blackjack again. Wait **${minutes}m ${seconds}s**.`,
                {
                    remaining,
                    cooldownType: 'bj',
                }
            );
        }

        if (userData.wallet < originalBet) {
            throw createError(
                'Insufficient cash for Blackjack',
                ErrorTypes.VALIDATION,
                `You only have **$${userData.wallet.toLocaleString()}** cash, but you're trying to bet **$${originalBet.toLocaleString()}**.`,
                {
                    required: originalBet,
                    current: userData.wallet,
                }
            );
        }

        const deck = createDeck();

        let playerHand = [
            drawCard(deck),
            drawCard(deck),
        ];

        let dealerHand = [
            drawCard(deck),
            drawCard(deck),
        ];

        let currentBet = originalBet;
        let gameOver = false;

        /*
         * Blackjack cooldown starts when the game begins.
         */
        userData.lastBj = now;
        await setEconomyData(
            client,
            guildId,
            userId,
            userData
        );

        /*
         * Natural blackjack.
         */
        const playerBlackjack = isBlackjack(playerHand);
        const dealerBlackjack = isBlackjack(dealerHand);

        if (playerBlackjack || dealerBlackjack) {
            let title;
            let description;
            let cashChange;
            let color;

            if (playerBlackjack && dealerBlackjack) {
                title = '🃏 VOID BLACKJACK — PUSH';
                description =
                    `**${formatHand(playerHand)}**\n\n` +
                    `Dealer also has Blackjack.\n\n` +
                    `Nobody wins this round. Your **$${currentBet.toLocaleString()}** bet is returned.`;

                cashChange = 0;
                color = '#F1C40F';
            } else if (playerBlackjack) {
                const profit = Math.floor(
                    currentBet * 1.5
                );

                cashChange = profit;

                title = '🃏 BLACKJACK!';
                description =
                    `**${formatHand(playerHand)}**\n\n` +
                    `🎉 Natural Blackjack!\n\n` +
                    `You won **$${profit.toLocaleString()}** profit!`;

                color = '#F1C40F';
            } else {
                cashChange = -currentBet;

                title = '🃏 DEALER BLACKJACK';
                description =
                    `**${formatHand(playerHand)}**\n\n` +
                    `Dealer has **${formatHand(dealerHand)}**.\n\n` +
                    `💔 You lost **$${currentBet.toLocaleString()}**.`;

                color = '#E74C3C';
            }

            userData.wallet += cashChange;

            await setEconomyData(
                client,
                guildId,
                userId,
                userData
            );

            const embed = createEmbed({
                title,
                description,
                color,
            }).addFields({
                name: '💰 New Cash Balance',
                value: `$${userData.wallet.toLocaleString()}`,
                inline: true,
            });

            await InteractionHelper.safeEditReply(
                interaction,
                {
                    embeds: [embed],
                    components: [],
                }
            );

            return;
        }

        /*
         * Initial game message.
         */
        const initialEmbed = buildGameEmbed({
            playerHand,
            dealerHand,
            bet: currentBet,
            playerName: interaction.user.username,
            status: 'Choose your move.',
        });

        const message = await interaction.editReply({
            embeds: [initialEmbed],
            components: [
                createButtons(userId, userData.wallet >= currentBet * 2),
            ],
        });

        /*
         * Button collector.
         *
         * Only the player who started this game
         * is allowed to use the buttons.
         */
        const collector = message.createMessageComponentCollector({
            componentType: ComponentType.Button,
            time: BJ_TIMEOUT,
            filter: buttonInteraction =>
                buttonInteraction.customId.endsWith(userId),
        });

        collector.on('collect', async buttonInteraction => {
            const action = buttonInteraction.customId
                .replace(`bj_${userId}`, '')
                .replace('bj_', '');

            /*
             * HIT
             */
            if (action === 'hit') {
                playerHand.push(drawCard(deck));

                const total = calculateHand(playerHand);

                if (total > 21) {
                    gameOver = true;

                    const finalEmbed = createEmbed({
                        title: '🃏 VOID BLACKJACK — BUST',
                        description:
                            `**${formatHand(playerHand)}**\n\n` +
                            `Your total is **${total}**.\n\n` +
                            `💔 You busted and lost **$${currentBet.toLocaleString()}**.`,
                        color: '#E74C3C',
                    }).addFields({
                        name: '💰 New Cash Balance',
                        value: `$${userData.wallet.toLocaleString()}`,
                        inline: true,
                    });

                    await buttonInteraction.update({
                        embeds: [finalEmbed],
                        components: [createDisabledButtons()],
                    });

                    collector.stop('game_over');
                    return;
                }

                await buttonInteraction.update({
                    embeds: [
                        buildGameEmbed({
                            playerHand,
                            dealerHand,
                            bet: currentBet,
                            playerName: interaction.user.username,
                            status: 'Choose your move.',
                        }),
                    ],
                    components: [
                        createButtons(
                            userId,
                            userData.wallet >= currentBet * 2
                        ),
                    ],
                });

                return;
            }

            /*
             * DOUBLE
             */
            if (action === 'double') {
                if (userData.wallet < currentBet * 2) {
                    await buttonInteraction.reply({
                        content:
                            `You need **$${currentBet.toLocaleString()}** more cash to double your bet.`,
                        ephemeral: true,
                    });

                    return;
                }

                currentBet *= 2;

                playerHand.push(drawCard(deck));

                const total = calculateHand(playerHand);

                /*
                 * Automatic stand after DOUBLE.
                 */
                if (total > 21) {
                    gameOver = true;

                    const finalEmbed = createEmbed({
                        title: '🃏 VOID BLACKJACK — DOUBLE BUST',
                        description:
                            `**${formatHand(playerHand)}**\n\n` +
                            `Your total is **${total}**.\n\n` +
                            `💔 You doubled your bet to **$${currentBet.toLocaleString()}** and busted.`,
                        color: '#E74C3C',
                    }).addFields({
                        name: '💰 New Cash Balance',
                        value: `$${userData.wallet.toLocaleString()}`,
                        inline: true,
                    });

                    userData.wallet -= currentBet;

                    await setEconomyData(
                        client,
                        guildId,
                        userId,
                        userData
                    );

                    await buttonInteraction.update({
                        embeds: [finalEmbed],
                        components: [createDisabledButtons()],
                    });

                    collector.stop('game_over');
                    return;
                }

                /*
                 * Dealer plays after DOUBLE.
                 */
                while (calculateHand(dealerHand) < 17) {
                    dealerHand.push(drawCard(deck));
                }

                const dealerTotal = calculateHand(dealerHand);

                let resultTitle;
                let resultDescription;
                let cashChange;
                let color;

                if (
                    dealerTotal > 21 ||
                    total > dealerTotal
                ) {
                    cashChange = currentBet;
                    resultTitle = '🃏 VOID BLACKJACK — DOUBLE WIN';
                    resultDescription =
                        `**${formatHand(playerHand)}**\n\n` +
                        `Dealer: **${formatHand(dealerHand)}**\n\n` +
                        `🔥 Double successful!\n` +
                        `You won **$${currentBet.toLocaleString()}** profit!`;
                    color = '#2ECC71';
                } else if (total === dealerTotal) {
                    cashChange = 0;
                    resultTitle = '🃏 VOID BLACKJACK — PUSH';
                    resultDescription =
                        `**${formatHand(playerHand)}**\n\n` +
                        `Dealer: **${formatHand(dealerHand)}**\n\n` +
                        `It's a tie. Your bet is returned.`;
                    color = '#F1C40F';
                } else {
                    cashChange = -currentBet;
                    resultTitle = '🃏 VOID BLACKJACK — DOUBLE LOSS';
                    resultDescription =
                        `**${formatHand(playerHand)}**\n\n` +
                        `Dealer: **${formatHand(dealerHand)}**\n\n` +
                        `💔 You lost your doubled bet of **$${currentBet.toLocaleString()}**.`;
                    color = '#E74C3C';
                }

                userData.wallet += cashChange;

                await setEconomyData(
                    client,
                    guildId,
                    userId,
                    userData
                );

                const finalEmbed = createEmbed({
                    title: resultTitle,
                    description: resultDescription,
                    color,
                }).addFields({
                    name: '💰 New Cash Balance',
                    value: `$${userData.wallet.toLocaleString()}`,
                    inline: true,
                });

                await buttonInteraction.update({
                    embeds: [finalEmbed],
                    components: [createDisabledButtons()],
                });

                collector.stop('game_over');
                return;
            }

            /*
             * STAND
             */
            if (action === 'stand') {
                const playerTotal = calculateHand(playerHand);

                while (calculateHand(dealerHand) < 17) {
                    dealerHand.push(drawCard(deck));
                }

                const dealerTotal = calculateHand(dealerHand);

                let resultTitle;
                let resultDescription;
                let cashChange;
                let color;

                if (
                    dealerTotal > 21 ||
                    playerTotal > dealerTotal
                ) {
                    cashChange = currentBet;

                    resultTitle = '🃏 VOID BLACKJACK — YOU WIN';
                    resultDescription =
                        `**${formatHand(playerHand)}** — **${playerTotal}**\n\n` +
                        `Dealer: **${formatHand(dealerHand)}** — **${dealerTotal}**\n\n` +
                        `🎉 You won **$${currentBet.toLocaleString()}** profit!`;

                    color = '#2ECC71';
                } else if (playerTotal === dealerTotal) {
                    cashChange = 0;

                    resultTitle = '🃏 VOID BLACKJACK — PUSH';
                    resultDescription =
                        `**${formatHand(playerHand)}** — **${playerTotal}**\n\n` +
                        `Dealer: **${formatHand(dealerHand)}** — **${dealerTotal}**\n\n` +
                        `🤝 It's a tie. Your bet is returned.`;

                    color = '#F1C40F';
                } else {
                    cashChange = -currentBet;

                    resultTitle = '🃏 VOID BLACKJACK — DEALER WINS';
                    resultDescription =
                        `**${formatHand(playerHand)}** — **${playerTotal}**\n\n` +
                        `Dealer: **${formatHand(dealerHand)}** — **${dealerTotal}**\n\n` +
                        `💔 You lost **$${currentBet.toLocaleString()}**.`;

                    color = '#E74C3C';
                }

                userData.wallet += cashChange;

                await setEconomyData(
                    client,
                    guildId,
                    userId,
                    userData
                );

                const finalEmbed = createEmbed({
                    title: resultTitle,
                    description: resultDescription,
                    color,
                }).addFields({
                    name: '💰 New Cash Balance',
                    value: `$${userData.wallet.toLocaleString()}`,
                    inline: true,
                });

                await buttonInteraction.update({
                    embeds: [finalEmbed],
                    components: [createDisabledButtons()],
                });

                collector.stop('game_over');
            }
        });

        /*
         * Someone other than the player clicks a button.
         *
         * Because the collector filter ignores them, Discord would
         * otherwise just show "This interaction failed".
         *
         * The collector itself cannot receive filtered interactions,
         * so we handle this through the message's component collector
         * only for the owner's buttons.
         */
        collector.on('end', async () => {
            if (gameOver) return;

            /*
             * The game timed out.
             *
             * No money has been deducted yet, so the player simply
             * gets the bet back by ending the game without settlement.
             */
            const timeoutEmbed = buildGameEmbed({
                playerHand,
                dealerHand,
                bet: currentBet,
                playerName: interaction.user.username,
                status: '⏰ Blackjack game expired.',
            });

            await interaction.editReply({
                embeds: [timeoutEmbed],
                components: [createDisabledButtons()],
            });
        });
    }, { command: 'bj' }),
};