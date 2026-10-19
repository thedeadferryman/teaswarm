import * as ts from 'typescript';
import * as tstl from 'typescript-to-lua';
import * as path from 'node:path';
import * as fs from 'node:fs';

const plugin: tstl.Plugin = {
	beforeEmit(program: ts.Program, options: tstl.CompilerOptions, emitHost: tstl.EmitHost, files: tstl.EmitFile[]) {
		for (const file of files) {
			// Convert project-relative module names into
			// OpenOS library-relative module names.
			file.code = file.code.replace(
				/\brequire\(\s*(["'])lib\./g,
				'require($1',
			);

			// Put TSTL's runtime library alongside
			// our own require-able modules.
			if (path.basename(file.outputPath) === 'lualib_bundle.lua') {
				file.outputPath = path.join(
					path.dirname(file.outputPath),
					'lib',
					'lualib_bundle.lua',
				);

				fs.mkdirSync(path.dirname(file.outputPath), {
					recursive: true,
				});
			}
		}
	},
};

export default plugin;