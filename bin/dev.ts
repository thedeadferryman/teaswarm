for (const pkg of Object.keys(_G.package.loaded)) {
	if (
		pkg.startsWith('net.')
		|| pkg.startsWith('std.')
		|| ['types', 'util'].includes(pkg)
	) {
		_G.package.loaded[pkg] = undefined;
	}
}

const main = (...argv: string[]) => {
	const [toExec, repeats] = argv;

	const times = repeats === undefined ? 1 : tonumber(repeats, 10) ?? 1;

	for (let i = 0; i < times; i++) {
		dofile(toExec);
	}
};


main(...$vararg);