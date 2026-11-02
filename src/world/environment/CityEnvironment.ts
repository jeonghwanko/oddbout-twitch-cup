import profile from './city-environment.json';
import {validateCityEnvironment} from './validate-city-environment.mjs';

type ReadonlyProfile<T> = T extends object ? {readonly [K in keyof T]: ReadonlyProfile<T[K]>} : T;

/** Shared city environment. World XY is ground, Z is up; colors remain in palette.ts. */
export const CITY_ENVIRONMENT: ReadonlyProfile<typeof profile> = validateCityEnvironment(profile);
