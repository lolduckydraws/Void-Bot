import { SlashCommandBuilder } from 'discord.js';

export default {
    data: new SlashCommandBuilder()
        .setName('monkey')
        .setDescription('Monkey someone across the Void.')
        .addUserOption(option =>
            option
                .setName('target')
                .setDescription('The user to monkey.')
                .setRequired(true)
        ),

    category: 'Fun',

    async execute(interaction) {
        await interaction.reply(
            `🐒 **${interaction.user.username}** monke'd **${interaction.options.getUser('target').username}**.`
        );
    },
};