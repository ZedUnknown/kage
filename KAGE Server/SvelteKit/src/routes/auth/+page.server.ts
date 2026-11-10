import { verificationRequired } from '#lib/server/config.ts';

export const load = () => ({ verificationRequired: verificationRequired() });
