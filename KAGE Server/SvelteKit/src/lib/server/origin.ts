export function allowedOrigins(configured: string | undefined): Set<string> {
	const entries = configured?.split(';').map((entry) => entry.trim()).filter(Boolean) ?? [];
	return new Set(
		entries.map((entry, index) => {
			let url: URL;
			try {
				url = new URL(entry);
			} catch {
				throw new Error(`CORS_ALLOW_ORIGINS entry ${index + 1} must be an absolute URL`);
			}
			if (
				!['http:', 'https:'].includes(url.protocol) ||
				url.username ||
				url.password ||
				url.pathname !== '/' ||
				url.search ||
				url.hash
			) {
				throw new Error(`CORS_ALLOW_ORIGINS entry ${index + 1} must be an HTTP(S) origin without a path`);
			}
			return url.origin;
		})
	);
}
