import * as tstl from 'typescript-to-lua';

const plugin: tstl.Plugin = {
	moduleResolution(
		moduleIdentifier: string,
		requiringFile: string,
		options: tstl.CompilerOptions,
		emitHost: tstl.EmitHost,
	) {
		if (moduleIdentifier.startsWith('@lib/')) {
			const newId = moduleIdentifier.replace('@lib/', '');
			console.log(moduleIdentifier, newId);
			return newId;
		}
	},
};

export default plugin;