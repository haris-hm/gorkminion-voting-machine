import { SlashCommandBuilder, MessageFlags } from "discord.js";
import { fileURLToPath } from "node:url";

import fs from "node:fs";
import path from "node:path";

const ADMIN_USER = process.env.ADMIN_USER;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function findCommandFile(commandsDir, commandName) {
	const entries = fs.readdirSync(commandsDir, { withFileTypes: true });
	for (const entry of entries) {
		const entryPath = path.join(commandsDir, entry.name);
		if (entry.isDirectory()) {
			const found = findCommandFile(entryPath, commandName);
			if (found) return found;
		} else if (
			entry.isFile() &&
			entry.name.toLowerCase() === `${commandName}.js`
		) {
			return entryPath;
		}
	}
	return null;
}

export const data = new SlashCommandBuilder()
	.setName("reload")
	.setDescription("Reloads a command.")
	.addStringOption((option) =>
		option
			.setName("command")
			.setDescription("The command to reload.")
			.setRequired(true),
	);

export async function execute(interaction) {
	if (interaction.user.id !== ADMIN_USER) {
		return interaction.reply({
			content: "You do not have permission to use this command.",
			flags: MessageFlags.Ephemeral,
		});
	}

	const commandName = interaction.options
		.getString("command", true)
		.toLowerCase()
		.replace("_", "");
	const commandsDir = path.join(__dirname, "..");
	const commandFilePath = findCommandFile(commandsDir, commandName);

	if (!commandFilePath) {
		return interaction.reply({
			content: `There is no command with name \`${commandName}\`!`,
			flags: MessageFlags.Ephemeral,
		});
	}

	try {
		const newCommand = await import(`${commandFilePath}?update=${Date.now()}`);
		interaction.client.commands.set(newCommand.data.name, newCommand);
		await interaction.reply({
			content: `Command \`${newCommand.data.name}\` was reloaded!`,
			flags: MessageFlags.Ephemeral,
		});
	} catch (error) {
		console.error(error);
		await interaction.reply({
			content: `There was an error while reloading a command \`${command.data.name}\`:\n\`${error.message}\``,
			flags: MessageFlags.Ephemeral,
		});
	}
}
