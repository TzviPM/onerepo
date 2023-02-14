import inquirer from 'inquirer';
import { batch, run } from '@onerepo/subprocess';
import type { Builder, Handler } from '@onerepo/types';
import type { Workspace } from '@onerepo/graph';
import { getBranch, getStatus } from '@onerepo/git';

export const command = ['publish', 'release'];

export const description = 'Publish all workspaces with versions not available in the registry.';

type Args = {
	'allow-dirty': boolean;
	build: boolean;
	otp: boolean;
};

export const builder: Builder<Args> = (yargs) =>
	yargs
		.usage('$0 release [options]')
		.option('build', {
			type: 'boolean',
			description: 'Build workspaces before publishing',
			default: true,
		})
		.option('otp', {
			type: 'boolean',
			description: 'Set to true if your publishes require an OTP for NPM.',
			default: false,
		})
		.option('allow-dirty', {
			type: 'boolean',
			default: false,
			hidden: true,
			description: 'Bypass checks to ensure no local changes before publishing.',
		});

export const handler: Handler<Args> = async (argv, { graph, logger }) => {
	const { 'allow-dirty': allowDirty, build, 'dry-run': isDry, otp: otpRequired, verbosity } = argv;

	await run({
		name: 'Ensure registry auth',
		cmd: 'npm',
		args: ['whoami'],
	});

	const workspaces = Object.values(graph.workspaces).filter((ws) => !ws.private);
	const publishable: Array<Workspace> = [];

	const infoStep = logger.createStep('Get version info');
	for (const workspace of workspaces) {
		const [info] = await run({
			name: `Get versions of ${workspace.name}`,
			cmd: 'npm',
			args: ['info', workspace.name, '--json'],
			step: infoStep,
			runDry: true,
		});

		const { versions } = JSON.parse(info);
		if (!versions.includes(workspace.version)) {
			publishable.push(workspace);
		}
	}
	await infoStep.end();

	// TODO: how to ensure that there is a build command?
	if (build) {
		await run({
			name: `Build workspaces`,
			cmd: process.argv[1],
			args: ['build', '-w', ...publishable.map((ws) => ws.name), `-${'v'.repeat(verbosity)}`],
			runDry: true,
		});
	}

	const cleanStep = logger.createStep('Ensure clean working directory');
	const branch = await getBranch({ step: cleanStep });
	if (!allowDirty && branch !== process.env.ONE_REPO_HEAD_BRANCH) {
		cleanStep.error(
			`Publish is only available from the branch "${process.env.ONE_REPO_HEAD_BRANCH}", but you are currently on "${branch}". Please switch branches and re-run to continue.`
		);
		await cleanStep.end();
		return;
	}
	const status = await getStatus({ step: cleanStep });
	if (!allowDirty && status) {
		cleanStep.error(`Working directory must be unmodified to ensure safe publish. Current status is:\n  ${status}`);
		await cleanStep.end();
		return;
	}
	await cleanStep.end();

	let otp: string | void;
	if (otpRequired) {
		logger.pause();
		const { otp: inputOtp } = await inquirer.prompt([
			{
				type: 'input',
				name: 'otp',
				prefix: '🔐',
				message: 'Please enter your npm OTP:',
			},
		]);
		otp = inputOtp;
		logger.unpause();
	}

	await batch(
		publishable.map((ws) => ({
			name: `Publish ${ws.name}`,
			cmd: 'npm',
			args: [
				'publish',
				'--access',
				'public',
				'--tag',
				'latest',
				...(otp ? ['--otp', otp] : []),
				...(isDry ? ['--dry-run'] : []),
			],
			opts: {
				cwd: ws.resolve('dist'),
			},
			runDry: true,
		}))
	);
};
