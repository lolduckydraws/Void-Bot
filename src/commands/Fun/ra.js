import { SlashCommandBuilder } from 'discord.js';
import { successEmbed, warningEmbed } from '../../utils/embeds.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';

export default {
    data: new SlashCommandBuilder()
        .setName("ra")
        .setDescription("Rp someone in the void.")
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
    `**${user.username}** dihhstroyed **${target.username}**'s ass, ouch that must've hurt.`,
    `**${target.username}**'s ass got ripped apart by **${user.username}**.`,
    `**${target.username}** got a mouth full c*m from **${user.username}**.`,
    `**${user.username}** chose sexual violence against **${target.username}**.`,
];

        const response =
            responses[Math.floor(Math.random() * responses.length)];

        const embed = successEmbed(
            "Rape",
            response
        );

        await InteractionHelper.safeEditReply(interaction, {
            embeds: [embed]
        });
    },
};