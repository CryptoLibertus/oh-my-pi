import * as path from "node:path";
import { ModelRegistry } from "@oh-my-pi/pi-coding-agent/config/model-registry";
import { Settings } from "@oh-my-pi/pi-coding-agent/config/settings";
import { ExtensionRuntime, loadExtensionFromFactory } from "@oh-my-pi/pi-coding-agent/extensibility/extensions/loader";
import { emitSessionShutdownEvent, ExtensionRunner } from "@oh-my-pi/pi-coding-agent/extensibility/extensions/runner";
import type {
	ExtensionActions,
	ExtensionContextActions,
	ExtensionError,
	ExtensionFactory,
	ExtensionUIContext,
} from "@oh-my-pi/pi-coding-agent/extensibility/extensions/types";
import { SessionManager } from "@oh-my-pi/pi-coding-agent/session/session-manager";
import { EventBus } from "@oh-my-pi/pi-coding-agent/utils/event-bus";
import { TempDir } from "@oh-my-pi/pi-utils";
import { createInMemoryAuthStorage } from "./agent-session-setup";

export interface ExtensionHarnessOptions {
	hasUI?: boolean;
	ui?: Partial<ExtensionUIContext>;
	actions?: Partial<ExtensionActions>;
	contextActions?: Partial<ExtensionContextActions>;
}

/**
 * Exercise a factory with the real loader, event runner, and managed timers.
 * No model requests, terminal, saved sessions, or user credentials are needed.
 * Call dispose() before restoring Bun fake timers, even when an assertion fails.
 */
export async function createExtensionHarness(factory: ExtensionFactory, options: ExtensionHarnessOptions = {}) {
	const dir = TempDir.createSync("extension-harness-");
	const auth = createInMemoryAuthStorage();
	const registry = new ModelRegistry(auth, path.join(dir.path(), "models.yml"));
	const session = SessionManager.inMemory(dir.path());
	const statuses = new Map<string, string>();
	const statusUpdates: { key: string; text: string | undefined }[] = [];
	const errors: ExtensionError[] = [];
	const notifications: { message: string; type: string | undefined }[] = [];
	let disposed = false;
	let running = false;
	let runner: ExtensionRunner;
	const unsupported = () => {
		throw new Error("Supply an action override to exercise this host operation in the extension harness");
	};

	async function bind() {
		const runtime = new ExtensionRuntime();
		const extension = await loadExtensionFromFactory(
			factory,
			dir.path(),
			new EventBus(),
			runtime,
			"<test-extension>",
		);
		const next = new ExtensionRunner(
			[extension],
			runtime,
			dir.path(),
			session,
			registry,
			undefined,
			Settings.isolated(),
		);
		next.onError(error => errors.push(error));
		const ui: ExtensionUIContext | undefined =
			options.hasUI === false
				? undefined
				: {
						...next.getUIContext(),
						setStatus(key, text) {
							statusUpdates.push({ key, text });
							if (text === undefined) statuses.delete(key);
							else statuses.set(key, text);
						},
						notify(message, type) {
							notifications.push({ message, type });
						},
						...options.ui,
					};
		next.initialize(
			{
				sendMessage: unsupported,
				sendUserMessage: unsupported,
				appendEntry: unsupported,
				setLabel: unsupported,
				getActiveTools: () => [],
				getAllTools: () => [],
				setActiveTools: unsupported,
				getCommands: () => [],
				setModel: unsupported,
				getThinkingLevel: () => undefined,
				setThinkingLevel: unsupported,
				getSessionName: () => undefined,
				setSessionName: unsupported,
				...options.actions,
			},
			{
				getModel: () => undefined,
				isIdle: () => true,
				abort: unsupported,
				hasPendingMessages: () => false,
				shutdown: unsupported,
				getContextUsage: () => undefined,
				compact: unsupported,
				getSystemPrompt: () => [],
				...options.contextActions,
			},
			undefined,
			ui,
			options.hasUI === false ? "print" : "tui",
		);
		return next;
	}

	function ensureOpen() {
		if (disposed) throw new Error("Extension harness has been disposed");
	}

	async function start() {
		ensureOpen();
		running = true;
		await runner.emit({ type: "session_start" });
	}

	async function shutdown() {
		if (!running) return;
		running = false;
		await emitSessionShutdownEvent(runner);
	}

	try {
		runner = await bind();
	} catch (error) {
		auth.close();
		dir.removeSync();
		throw error;
	}

	return {
		get runner() {
			return runner;
		},
		statuses,
		statusUpdates,
		notifications,
		errors,
		start,
		shutdown,
		async reload() {
			ensureOpen();
			await shutdown();
			statuses.clear();
			runner = await bind();
			await start();
		},
		async dispose() {
			if (disposed) return;
			disposed = true;
			try {
				await shutdown();
			} finally {
				runner.clearManagedTimers();
				runner.disposeFileFallbacks();
				auth.close();
				dir.removeSync();
			}
		},
	};
}
