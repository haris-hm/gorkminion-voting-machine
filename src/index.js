import { Client, Collection, GatewayIntentBits } from "discord.js";
import { fileURLToPath } from "node:url";

import fs from "node:fs";
import path from "node:path";
import dotenv from "dotenv";

dotenv.config();

const DISCORD_TOKEN = process.env.DISCORD_TOKEN;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const client = new Client({
	intents: [GatewayIntentBits.Guilds, GatewayIntentBits.MessageContent],
});
client.commands = new Collection();

(async () => {
	const foldersPath = path.join(__dirname, "commands");
	const commandFolders = fs.readdirSync(foldersPath);

	for (const folder of commandFolders) {
		const commandsPath = path.join(foldersPath, folder);
		const commandFiles = fs
			.readdirSync(commandsPath)
			.filter((file) => file.endsWith(".js"));

		for (const file of commandFiles) {
			const filePath = path.join(commandsPath, file);
			const command = await import(filePath);
			// Set a new item in the Collection with the key as the command name and the value as the exported module
			if ("data" in command && "execute" in command) {
				client.commands.set(command.data.name, command);
			} else {
				console.log(
					`[WARNING] The command at ${filePath} is missing a required "data" or "execute" property.`,
				);
			}
		}
	}

	const eventsPath = path.join(__dirname, "events");
	const eventFiles = fs
		.readdirSync(eventsPath)
		.filter((file) => file.endsWith(".js"));

	for (const file of eventFiles) {
		const filePath = path.join(eventsPath, file);
		const event = await import(filePath);
		if (event.once) {
			client.once(event.name, (...args) => event.execute(...args));
		} else {
			client.on(event.name, (...args) => event.execute(...args));
		}
	}

	client.login(DISCORD_TOKEN);
})();
