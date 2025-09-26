const { SlashCommandBuilder } = require("discord.js");
const fs = require("node:fs");
const path = require("node:path");

require("dotenv").config();
const ADMIN_USER = process.env.ADMIN_USER;

const commandData = new SlashCommandBuilder()
	.setName("reload")
	.setDescription("Reloads a command.")
	.addStringOption((option) =>
		option
			.setName("command")
			.setDescription("The command to reload.")
			.setRequired(true),
	);

function findCommandFile(commandsDir, commandName) {
	const entries = fs.readdirSync(commandsDir, { withFileTypes: true });
	for (const entry of entries) {
		const entryPath = path.join(commandsDir, entry.name);
		if (entry.isDirectory()) {
			const found = findCommandFile(entryPath, commandName);
			if (found) return found;
		} else if (entry.isFile() && entry.name === `${commandName}.js`) {
			return entryPath;
		}
	}
	return null;
}

async function execute(interaction) {
	if (interaction.user.id !== ADMIN_USER) {
		return interaction.reply({
			content: "You do not have permission to use this command.",
			ephemeral: true,
		});
	}

	const commandName = interaction.options
		.getString("command", true)
		.toLowerCase();
	const commandsDir = path.join(__dirname, "..");
	const commandFilePath = findCommandFile(commandsDir, commandName);

	if (!commandFilePath) {
		return interaction.reply(`There is no command with name \`${commandName}\`!`);
	}

	delete require.cache[require.resolve(commandFilePath)];

	try {
		const newCommand = require(commandFilePath);
		interaction.client.commands.set(newCommand.data.name, newCommand);

		await interaction.reply({
			content: `Command \`${newCommand.data.name}\` was reloaded!`,
			ephemeral: true,
		});
	} catch (error) {
		console.error(error);

		await interaction.reply({
			content: `There was an error while reloading a command \`${command.data.name}\`:\n\`${error.message}\``,
			ephemeral: true,
		});
	}
}

module.exports = {
	data: commandData,
	execute,
};
