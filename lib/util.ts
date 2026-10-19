// @noSelfInFile

import type { Component, Addr } from '@lib/types';

export const asComponent = <T>(value: T): T & Component => {
	return value as (T & Component);
};

export const batches = (value: string, batchSize: number) => {
	const result = [];
	let batch = '';

	for (let i = 0; i < value.length; i++) {
		if (batch.length >= batchSize) {
			result.push(batch);
			batch = '';
		}

		batch += value[i];
	}

	if (batch.length > 0) result.push(batch);

	return result;
};

export const collect = <T>(values: T[], buckets: number[]) => {
	const result: (T[])[] = [];
	let bucket: T[] = [];

	if (buckets.length <= 0) return [values];

	for (let i = 0; i < values.length; i++) {
		const bucketSize = buckets[math.min(result.length, buckets.length - 1)] ?? 1;

		if (bucket.length >= bucketSize) {
			result.push(bucket);
			bucket = [];
		}

		bucket.push(values[i]!!);
	}

	if (bucket.length > 0) {
		result.push(bucket);
	}

	return result;
};

export const packAddr = (addr: Addr) => {
	const bytes = addr.split('-')
		.flatMap(it => batches(it, 2))
		.map(it => tonumber(it, 16) ?? 0);

	const pattern = 'B'.repeat(bytes.length + 1);

	return string.pack(pattern, bytes.length, ...bytes);
};

const addrGrouping = [4, 2, 2, 2, 6];

export const unpackAddr = (bAddr: string) => {
	const [sz, restPos] = string.unpack('B', bAddr);

	const pattern = 'B'.repeat(sz);

	const hexBytes = string.unpack(pattern, bAddr, restPos)
		.slice(0, -1)
		.map(it => string.format('%02x', it))
	;

	return collect(hexBytes, addrGrouping)
		.map(it => it.join(''))
		.join('-')
		;
};

export const isNil = <T>(value: T | null | undefined): value is null | undefined =>
	value === null || value === undefined;

interface LuaTypeMap {
	string: string;
	number: number;
	boolean: boolean;
}

export const expect = <T, K extends keyof LuaTypeMap>(value: T, exp: K): LuaTypeMap[K] => {
	if (type(value) == exp) {
		return value as LuaTypeMap[K];
	}

	throw `expected ${exp}, got ${type(value)}`;
};