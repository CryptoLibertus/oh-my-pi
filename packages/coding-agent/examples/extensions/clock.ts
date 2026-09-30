/** Machine-local clock in the status bar below the command editor. */
import type { ExtensionAPI } from "@oh-my-pi/pi-coding-agent";

export default function clock(pi: ExtensionAPI) {
	let stop: (() => void) | undefined;

	pi.on("session_start", (_event, ctx) => {
		stop?.();
		stop = undefined;
		if (!ctx.hasUI) return;

		const update = () => {
			const now = new Date();
			const time = [now.getHours(), now.getMinutes(), now.getSeconds()]
				.map(part => String(part).padStart(2, "0"))
				.join(":");
			ctx.ui.setStatus("clock", time);
		};

		update();
		const timer = ctx.setInterval(update, 1000);
		stop = () => {
			ctx.clearTimer(timer);
			ctx.ui.setStatus("clock", undefined);
		};
	});

	pi.on("session_shutdown", () => {
		stop?.();
		stop = undefined;
	});
}
