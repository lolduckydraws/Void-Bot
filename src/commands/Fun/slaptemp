import { SlashCommandBuilder } from 'discord.js';
import { successEmbed, warningEmbed } from '../../utils/embeds.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';

const ALLOWED_USER_IDS = [
    '440663214477541376',
    '488048302273724418',
];

export default {
    data: new SlashCommandBuilder()
        .setName("Monkey")
        .setDescription("Monkey someone across the Void.")
        .addUserOption((option) =>
            option
                .setName("target")
                .setDescription("The user to slap.")
                .setRequired(true)
        ),

    category: 'Fun',

    async execute(interaction, config, client) {

        // Only allowed users can use this command
        if (!ALLOWED_USER_IDS.includes(interaction.user.id)) {
            const embed = warningEmbed(
                "🚫 Access Denied",
                "You don't have permission to use this command."
            );

            return await InteractionHelper.safeReply(interaction, {
                embeds: [embed],
                ephemeral: true
            });
        }

        await InteractionHelper.safeDefer(interaction);

        const user = interaction.user;
        const target = interaction.options.getUser("target");

        // Prevent slapping yourself
        if (user.id === target.id) {
            const embed = warningEmbed(
                "❌ Invalid Target",
                `**${user.username}**, you can't slap yourself!`
            );

            return await InteractionHelper.safeEditReply(interaction, {
                embeds: [embed]
            });
        }

            return await InteractionHelper.safeEditReply(interaction, {
                embeds: [embed]
            });
        }

        const responses = [
            `**${user.username}** slapped **${target.username}** across the Void! 👋`,
            `**${user.username}** smacked **${target.username}** so hard they saw the Void. 💀`,
            `**${user.username}** chose violence and slapped **${target.username}**. 👋`,
            `**${target.username}** just got absolutely slapped by **${user.username}**. 😭`,
            `**${user.username}** walked up to **${target.username}** and delivered a completely unnecessary slap. 👋`,
        ];

        const response =
            responses[Math.floor(Math.random() * responses.length)];

        const embed = successEmbed(
            "👋 MonkeyP",
            response
        );

        await InteractionHelper.safeEditReply(interaction, {
            embeds: [embed]
        });
    },
};