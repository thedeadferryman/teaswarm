export type Func<A extends unknown[], R> = (...args: A) => R;

export type Decorator<A extends unknown[], R> = (func: Func<A, R>) => Func<A, R | undefined>;

export interface LossyOptions {
	name: string;
	chance: number;
	trace: boolean;
}

export const trace = (flag: boolean, ...data: unknown[]) => {
	if (flag) print(...data);
};

export const lossy = <A extends unknown[], R>(options: LossyOptions): Decorator<A, R> => {
	return (func: Func<A, R>) => {
		return (...args: A): R | undefined => {
			const roll = math.random(100);

			if (roll >= options.chance) {
				trace(options.trace, `lossy exec ${options.name}`);
				return func(...args);
			} else {
				trace(options.trace, `lossy drop ${options.name}`);
			}
		};
	};
};