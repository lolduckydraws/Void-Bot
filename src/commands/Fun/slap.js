import { SlashCommandBuilder } from 'discord.js';
import { successEmbed, warningEmbed } from '../../utils/embeds.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';

export default {
    data: new SlashCommandBuilder()
        .setName("slap")
        .setDescription("Slap someone across the Void.")
        .addUserOption((option) =>
            option
                .setName("target")
                .setDescription("The user to target.")
                .setRequired(true)
        ),

    category: 'Fun',

    async execute(interaction, config, client) {
        await InteractionHelper.safeDefer(interaction);

        const user = interaction.user;
        const target = interaction.options.getUser("target");

        // Prevent targeting yourself
        if (user.id === target.id) {
            const embed = warningEmbed(
                "❌ Invalid Target",
                `**${user.username}**, you can't use this command on yourself!`
            );

            return await InteractionHelper.safeEditReply(interaction, {
                embeds: [embed]
            });
        }

        // Prevent targeting bots
        if (target.bot) {
            const embed = warningEmbed(
                "❌ Invalid Target",
                "You can't use this command on bots!"
            );

            return await InteractionHelper.safeEditReply(interaction, {
                embeds: [embed]
            });
        }

        // ==========================================
        // PUT YOUR RANDOM RESPONSES HERE
        // ==========================================

        const responses = [
    `**${user.username}** slapped **${target.username}** so hard they saw the Void.`,
    `**${user.username}** smacked **${target.username}** across the face.`,
    `**${target.username}** has been slapped by **${user.username}**.`,
    `**${user.username}** chose violence against **${target.username}**.`,
];

        const response =
            responses[Math.floor(Math.random() * responses.length)];

        const embed = successEmbed(
            "👋 Slap",
            response
        );

        await InteractionHelper.safeEditReply(interaction, {
            embeds: [embed]
        });
    },
};