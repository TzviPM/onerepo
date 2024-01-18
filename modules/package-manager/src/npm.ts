import { batch, run } from '@onerepo/subprocess';
import type { PackageManager, MinimalWorkspace, NpmInfo } from './methods';

const cmd = 'npm';

export const Npm = {
	add: async (packages, opts = {}) => {
		const pkgs = Array.isArray(packages) ? packages : [packages];
		await run({
			name: 'Add packages',
			cmd,
			args: ['install', ...pkgs, ...(opts?.dev ? ['--save-dev'] : [])],
		});
	},

	batch: async (processes) => {
		return batch(
			processes.map((proc) => ({
				...proc,
				cmd: 'npm',
				args: ['exec', proc.cmd, ...(proc.args ?? [])],
			})),
		);
	},

	dedupe: async () => {
		await run({
			name: 'Dedupe dependencies',
			cmd,
			args: ['dedupe'],
		});
	},

	info: async (name, spec) => {
		try {
			const [data] = await run({
				name: `Get ${name} info`,
				...spec,
				cmd,
				args: ['info', name, '--json'],
			});

			return JSON.parse(data) as NpmInfo;
		} catch (e) {
			return null;
		}
	},

	install: async (cwd?: string) => {
		await run({
			name: 'Install dependencies',
			cmd,
			args: ['install'],
			opts: { cwd },
		});

		return 'package-lock.json';
	},

	loggedIn: async (opts = {}) => {
		try {
			await run({
				name: 'Who am I?',
				cmd,
				args: ['whoami', ...(opts.registry ? ['--registry', opts.registry] : [])],
				runDry: true,
			});
			return true;
		} catch (e) {
			return false;
		}
	},

	publish: async (opts = {}) => {
		const { access, cwd, otp, tag, workspaces } = opts;
		await run({
			name: `Publish${workspaces?.length ? ` ${workspaces.join(', ')}` : ''}`,
			cmd,
			args: [
				'publish',
				...(access ? ['--access', access] : []),
				...(tag ? ['--tag', tag] : []),
				...(otp ? ['--otp', otp] : []),
				...(workspaces?.length ? ['--workspaces', ...workspaces.map((ws) => ws.name)] : []),
				...(process.env.ONEREPO_DRY_RUN === 'true' ? ['--dry-run'] : []),
			],
			opts: cwd ? { cwd: cwd } : {},
			runDry: true,
		});
	},

	publishable: async <T extends MinimalWorkspace>(workspaces: Array<T>) => {
		const filtered = workspaces.filter((ws) => !ws.private && ws.version);
		const publishable = new Set<T>(filtered);

		const responses = await batch(
			filtered.map(({ name }) => ({
				name: `Get ${name} versions`,
				cmd,
				args: ['info', name, 'name', 'versions', '--json'],
				runDry: true,
				skipFailures: true,
			})),
		);

		for (const res of responses) {
			if (res instanceof Error || res[1]) {
				continue;
			}
			try {
				const { name, versions } = JSON.parse(res[0]);
				const ws = workspaces.find((ws) => ws.name === name);
				if (ws && ws.version && versions.includes(ws.version)) {
					publishable.delete(ws);
				}
			} catch (e) {
				// no catch
			}
		}

		return Array.from(publishable);
	},

	remove: async (packages) => {
		const pkgs = Array.isArray(packages) ? packages : [packages];
		await run({
			name: 'Remove packages',
			cmd,
			args: ['uninstall', ...pkgs],
		});
	},

	run: async (opts) => {
		return await run({
			...opts,
			cmd: 'npm',
			args: ['exec', opts.cmd, ...(opts.args ?? [])],
		});
	},
} satisfies PackageManager;
