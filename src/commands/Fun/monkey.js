import { SlashCommandBuilder } from 'discord.js';
import { successEmbed, warningEmbed } from '../../utils/embeds.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';

const ALLOWED_USER_IDS = [
    '440663214477541376',
    '488048302273724418',
];

export default {
    data: new SlashCommandBuilder()
        .setName("SA")
        .setDescription("Rape someone in the Void.")
        .addUserOption((option) =>
            option
                .setName("target")
                .setDescription("The user to monke.")
                .setRequired(true)
        ),

    category: 'Fun',

    async execute(interaction, config, client) {
        await InteractionHelper.safeDefer(interaction);

        const user = interaction.user;
        const target = interaction.options.getUser("target");

        // Only selected users can use this command
        if (!ALLOWED_USER_IDS.includes(user.id)) {
            const embed = warningEmbed(
                "🚫 Access Denied",
                `**${user.username}**, you don't have permission to use this command.`
            );

            return await InteractionHelper.safeEditReply(interaction, {
                embeds: [embed]
            });
        }

        // Prevent targeting yourself
        if (user.id === target.id) {
            const embed = warningEmbed(
                "❌ Invalid Target",
                `**${user.username}**, you can't monke yourself!`
            );

            return await InteractionHelper.safeEditReply(interaction, {
                embeds: [embed]
            });
        }

        // Prevent targeting bots
        if (target.bot) {
            const embed = warningEmbed(
                "❌ Invalid Target",
                "You can't monke bots!"
            );

            return await InteractionHelper.safeEditReply(interaction, {
                embeds: [embed]
            });
        }

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