import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { Collection } from 'discord.js';
import { logger } from '../../utils/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const MAX_COMMANDS = 100;
const COMMAND_COUNT_WARN_THRESHOLD = 90;

// Void SMP server
const VOID_SMP_GUILD_ID = '826205931708219432';

/**
 * Get all JavaScript command files recursively.
 */
async function getAllFiles(directory, fileList = []) {
    let files;

    try {
        files = await fs.readdir(directory, {
            withFileTypes: true,
        });
    } catch (error) {
        logger.error(
            `Failed to read command directory: ${directory}`,
            error
        );
        throw error;
    }

    for (const file of files) {
        const filePath = path.join(directory, file.name);

        if (file.isDirectory()) {
            // Ignore module/helper directories.
            if (file.name === 'modules') {
                continue;
            }

            await getAllFiles(filePath, fileList);
            continue;
        }

        if (
            file.isFile() &&
            file.name.endsWith('.js')
        ) {
            fileList.push(filePath);
        }
    }

    return fileList;
}

/**
 * Extract subcommand names for logging/debugging.
 */
function getSubcommandInfo(commandData) {
    const subcommands = [];

    if (!commandData?.options) {
        return subcommands;
    }

    for (const option of commandData.options) {
        // SUB_COMMAND
        if (option.type === 1) {
            subcommands.push(option.name);
            continue;
        }

        // SUB_COMMAND_GROUP
        if (option.type === 2 && option.options) {
            for (const subOption of option.options) {
                if (subOption.type === 1) {
                    subcommands.push(
                        `${option.name}/${subOption.name}`
                    );
                }
            }
        }
    }

    return subcommands;
}

/**
 * Load all commands into client.commands.
 */
export async function loadCommands(client) {
    client.commands = new Collection();

    const commandsPath = path.resolve(
        __dirname,
        '../../commands'
    );

    logger.info(
        `Loading commands from: ${commandsPath}`
    );

    const commandFiles =
        await getAllFiles(commandsPath);

    logger.info(
        `Found ${commandFiles.length} command files to load`
    );

    const loadedNames = new Set();
    let loadedCount = 0;
    let failedCount = 0;

    for (const filePath of commandFiles) {
        const normalizedPath =
            filePath.replace(/\\/g, '/');

        try {
            /*
             * Use pathToFileURL instead of manually creating
             * file:// URLs. This works correctly on Windows
             * and Linux.
             */
            const moduleUrl =
                pathToFileURL(filePath).href;

            const commandModule =
                await import(moduleUrl);

            const command =
                commandModule.default ?? commandModule;

            /*
             * Every command must have:
             *
             * data    -> SlashCommandBuilder
             * execute -> function
             */
            if (
                !command ||
                !command.data ||
                typeof command.execute !== 'function'
            ) {
                logger.warn(
                    `Skipping invalid command: ${normalizedPath}`
                );

                logger.warn(
                    'Command must export "data" and "execute".'
                );

                failedCount++;
                continue;
            }

            /*
             * Discord.js SlashCommandBuilder should have
             * a toJSON() method.
             */
            if (
                typeof command.data.toJSON !== 'function'
            ) {
                logger.warn(
                    `Skipping command with invalid data: ${normalizedPath}`
                );

                failedCount++;
                continue;
            }

            const commandData =
                command.data.toJSON();

            if (!commandData.name) {
                logger.warn(
                    `Skipping command without a name: ${normalizedPath}`
                );

                failedCount++;
                continue;
            }

            const commandName =
                commandData.name;

            /*
             * Prevent duplicate top-level command names.
             */
            if (loadedNames.has(commandName)) {
                logger.warn(
                    `Duplicate command "${commandName}" detected.`
                );

                logger.warn(
                    `Skipping: ${normalizedPath}`
                );

                continue;
            }

            loadedNames.add(commandName);

            /*
             * Add useful metadata to the command.
             */
            const commandDir =
                path.dirname(filePath);

            command.category =
                path.basename(commandDir);

            command.filePath =
                normalizedPath;

            /*
             * Store the command.
             */
            client.commands.set(
                commandName,
                command
            );

            loadedCount++;

            logger.info(
                `Loaded command: /${commandName} ` +
                `from ${normalizedPath}`
            );

            const subcommands =
                getSubcommandInfo(commandData);

            if (subcommands.length > 0) {
                logger.info(
                    `  └─ Subcommands: ${subcommands.join(', ')}`
                );
            }

        } catch (error) {
            failedCount++;

            logger.error(
                `Failed to load command: ${normalizedPath}`,
                error
            );
        }
    }

    logger.info(
        `Command loading complete: ${loadedCount} loaded, ${failedCount} failed`
    );

    if (loadedCount === 0) {
        throw new Error(
            'No commands were successfully loaded.'
        );
    }

    return client.commands;
}

/**
 * Convert loaded commands into Discord API payloads.
 */
function collectCommandPayloads(client) {
    const commands = [];
    const registeredNames = new Set();

    let totalSubcommands = 0;

    if (
        !client.commands ||
        client.commands.size === 0
    ) {
        throw new Error(
            'client.commands is empty. Load commands before registering them.'
        );
    }

    for (const command of client.commands.values()) {
        if (
            !command?.data ||
            typeof command.data.toJSON !== 'function'
        ) {
            logger.warn(
                'Skipping command with invalid data.'
            );
            continue;
        }

        const commandJson =
            command.data.toJSON();

        const commandName =
            commandJson.name;

        if (!commandName) {
            logger.warn(
                'Skipping command without a name.'
            );
            continue;
        }

        if (
            registeredNames.has(commandName)
        ) {
            logger.warn(
                `Skipping duplicate command: ${commandName}`
            );
            continue;
        }

        registeredNames.add(commandName);

        commands.push(commandJson);

        totalSubcommands +=
            getSubcommandInfo(
                commandJson
            ).length;
    }

    return {
        commands,
        totalSubcommands,
    };
}

/**
 * Validate commands before sending them to Discord.
 */
function validateCommands(commands) {
    const errors = [];

    for (const command of commands) {
        if (!command.name) {
            errors.push(
                'A command is missing its name.'
            );
            continue;
        }

        if (
            command.name.length > 32
        ) {
            errors.push(
                `/${command.name} has a name longer than 32 characters.`
            );
        }

        if (
            command.description &&
            command.description.length > 100
        ) {
            errors.push(
                `/${command.name} has a description longer than 100 characters.`
            );
        }

        if (!command.options) {
            continue;
        }

        for (const option of command.options) {
            if (
                option.name &&
                option.name.length > 32
            ) {
                errors.push(
                    `/${command.name} option "${option.name}" has a name longer than 32 characters.`
                );
            }

            if (
                option.description &&
                option.description.length > 100
            ) {
                errors.push(
                    `/${command.name} option "${option.name}" has a description longer than 100 characters.`
                );
            }

            if (!option.options) {
                continue;
            }

            for (const subOption of option.options) {
                if (
                    subOption.name &&
                    subOption.name.length > 32
                ) {
                    errors.push(
                        `/${command.name} subcommand "${subOption.name}" has a name longer than 32 characters.`
                    );
                }

                if (
                    subOption.description &&
                    subOption.description.length > 100
                ) {
                    errors.push(
                        `/${command.name} subcommand "${subOption.name}" has a description longer than 100 characters.`
                    );
                }
            }
        }
    }

    if (errors.length > 0) {
        logger.error(
            'Command validation failed:'
        );

        for (const error of errors) {
            logger.error(`- ${error}`);
        }

        throw new Error(
            `Command validation failed with ${errors.length} error(s).`
        );
    }
}

/**
 * Make sure we never send more than Discord's
 * top-level guild command limit.
 */
function prepareCommandsForRegistration(
    commands
) {
    if (
        commands.length >=
        COMMAND_COUNT_WARN_THRESHOLD
    ) {
        logger.warn(
            `Command count (${commands.length}) is close to Discord's ${MAX_COMMANDS} command limit.`
        );
    }

    if (
        commands.length <= MAX_COMMANDS
    ) {
        return commands;
    }

    logger.warn(
        `Command count (${commands.length}) exceeds Discord's limit.`
    );

    return commands.slice(
        0,
        MAX_COMMANDS
    );
}

/**
 * Register slash commands specifically to Void SMP.
 *
 * Guild commands update immediately, making this ideal
 * for development/testing.
 */
async function registerGuildCommands(
    client,
    clientId,
    guildId,
    commands,
    totalSubcommands
) {
    if (!clientId) {
        throw new Error(
            'CLIENT_ID is required for slash command registration.'
        );
    }

    if (!guildId) {
        throw new Error(
            'GUILD_ID is required for slash command registration.'
        );
    }

    if (!client.rest) {
        throw new Error(
            'Discord REST client is not available.'
        );
    }

    if (!Array.isArray(commands)) {
        throw new Error(
            'Command payload must be an array.'
        );
    }

    logger.info(
        `Preparing ${commands.length} slash commands for Void SMP (${guildId})`
    );

    validateCommands(commands);

    logger.info(
        'Command validation passed.'
    );

    const commandsToRegister =
        prepareCommandsForRegistration(
            commands
        );

    logger.info(
        `Registering ${commandsToRegister.length} slash commands to Void SMP...`
    );

    try {
        /*
         * PUT replaces the guild's command list with
         * exactly the commands in this array.
         */
        const registeredCommands =
            await client.rest.put(
                `/applications/${clientId}/guilds/${guildId}/commands`,
                {
                    body: commandsToRegister,
                }
            );

        logger.info(
            `Successfully registered ${registeredCommands.length} slash commands to Void SMP.`
        );

        logger.info(
            `Total subcommands detected: ${totalSubcommands}`
        );

        return registeredCommands;

    } catch (error) {
        logger.error(
            'Discord rejected slash-command registration:',
            error
        );

        throw error;
    }
}

/**
 * Register all loaded commands.
 */
export async function registerCommands(
    client,
    options = {}
) {
    const {
        clientId,
    } = options;

    try {
        if (!client) {
            throw new Error(
                'Discord client is required.'
            );
        }

        if (!clientId) {
            throw new Error(
                'CLIENT_ID is required.'
            );
        }

        const {
            commands,
            totalSubcommands,
        } = collectCommandPayloads(
            client
        );

        if (commands.length === 0) {
            throw new Error(
                'No valid slash commands were found to register.'
            );
        }

        return await registerGuildCommands(
            client,
            clientId,
            VOID_SMP_GUILD_ID,
            commands,
            totalSubcommands
        );

    } catch (error) {
        logger.error(
            'Error registering slash commands:',
            error
        );

        throw error;
    }
}

/**
 * Reload a single command without restarting the bot.
 */
export async function reloadCommand(
    client,
    commandName
) {
    if (
        !client?.commands
    ) {
        return {
            success: false,
            message:
                'Command collection is not initialized.',
        };
    }

    const oldCommand =
        client.commands.get(
            commandName
        );

    if (!oldCommand) {
        return {
            success: false,
            message:
                `Command "${commandName}" not found.`,
        };
    }

    if (!oldCommand.filePath) {
        return {
            success: false,
            message:
                `Command "${commandName}" does not have a file path.`,
        };
    }

    try {
        const commandPath =
            path.resolve(
                oldCommand.filePath
            );

        const moduleUrl =
            pathToFileURL(
                commandPath
            );

        /*
         * Cache-bust the ES module so Node loads
         * the updated command.
         */
        moduleUrl.searchParams.set(
            't',
            Date.now().toString()
        );

        const commandModule =
            await import(
                moduleUrl.href
            );

        const newCommand =
            commandModule.default ??
            commandModule;

        if (
            !newCommand?.data ||
            typeof newCommand.execute !== 'function'
        ) {
            throw new Error(
                'Reloaded module does not export a valid command.'
            );
        }

        if (
            typeof newCommand.data.toJSON !== 'function'
        ) {
            throw new Error(
                'Reloaded command has invalid command data.'
            );
        }

        /*
         * Preserve metadata.
         */
        newCommand.category =
            oldCommand.category;

        newCommand.filePath =
            oldCommand.filePath;

        client.commands.set(
            commandName,
            newCommand
        );

        logger.info(
            `Reloaded command: ${commandName}`
        );

        return {
            success: true,
            message:
                `Successfully reloaded command "${commandName}".`,
        };

    } catch (error) {
        logger.error(
            `Error reloading command "${commandName}":`,
            error
        );

        return {
            success: false,
            message:
                `Error reloading command: ${error.message}`,
        };
    }
}
