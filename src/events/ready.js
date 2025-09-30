import { Events } from "discord.js";

import cron from "node-cron";
import { closeBallots, sendWarningMessages } from "../utils/ballotResults.js";

const CRON_SCHEDULE = process.env.CRON_SCHEDULE || "*/5 * * * *";

export const name = Events.ClientReady;
export const once = true;

export function execute(client) {
	console.log(`${client.user.tag} is ready!`);

	cron.schedule(CRON_SCHEDULE, async () => {
		await sendWarningMessages(client);
		await closeBallots(client);
	});
}
