import { defineEnvVars } from '@sveltejs/kit/env';

export const variables = defineEnvVars({
    DATABASE_HOST: {},
    DATABASE_PORT: {},
    DATABASE_NAME: {},
    DATABASE_USER: {},
    DATABASE_PASSWORD: {}
});