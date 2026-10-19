import { isNil } from '@lib/util';

export interface DataEntry {
	success: boolean;
	body: string;
}

export interface RadpDataProvider {
	get: (request: string) => DataEntry;
}

type Registry = Partial<Record<string, string>>;

export class InMemoryDataProvider implements RadpDataProvider {
	constructor(private readonly registry: Registry) {
	}

	get(request: string): DataEntry {
		const data = this.registry[request];

		if (isNil(data)) {
			return { success: false, body: 'Not found' };
		}

		return {
			success: true,
			body: data,
		};
	}
}