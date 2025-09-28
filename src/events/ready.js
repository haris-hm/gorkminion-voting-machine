import { Events, ActionRowBuilder, ButtonBuilder } from "discord.js";
import { getAllBallots, closeBallot } from "../db/ballots.js";

import cron from "node-cron";

async function closeBallots(client) {
	const now = Date.now();
	const ballots = getAllBallots();

	for (const ballot of ballots) {
		console.log(`Checking ballot ${ballot.id}`);
		if (now - new Date(ballot.created_at).getTime() > ballot.ttl) {
			console.log(`Closing ballot ${ballot.id}. TTL: ${ballot.ttl} ms`);

			try {
				const channel = await client.channels.fetch(ballot.channel_id);
				const message = await channel.messages.fetch(ballot.message_id);

				// Disable the vote button
				const oldRow = message.components[message.components.length - 1];
				const disabledRow = ActionRowBuilder.from(oldRow).setComponents(
					oldRow.components.map((btn) => ButtonBuilder.from(btn).setDisabled(true)),
				);

				await message.edit({
					components: [...message.components.slice(0, -1), disabledRow],
					allowedMentions: { parse: [] },
				});

				closeBallot(ballot.id);
			} catch (err) {
				console.error("Failed to close ballot:", err);
			}
		}
	}
}

export const name = Events.ClientReady;
export const once = true;

export function execute(client) {
	console.log(`Ready! Logged in as ${client.user.tag}`);
	cron.schedule("*/5 * * * * *", async () => {
		await closeBallots(client);
	});
}
