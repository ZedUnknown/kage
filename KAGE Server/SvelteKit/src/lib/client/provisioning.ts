export async function provisioningRequest(path: string, data: object) {
	const response = await fetch(path, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(data)
	});
	if (!response.ok) {
		const body = await response.json().catch(() => ({}));
		throw new Error(body.error || 'Could not complete the provisioning request.');
	}
	return response;
}

export async function saveProvisioningFile(response: Response) {
	const filename = response.headers.get('Content-Disposition')?.match(/filename="([^"]+)"/)?.[1];
	if (!filename) throw new Error('The server did not return a setup download.');
	const url = URL.createObjectURL(await response.blob());
	const link = document.createElement('a');
	link.href = url;
	link.download = filename;
	document.body.appendChild(link);
	link.click();
	link.remove();
	setTimeout(() => URL.revokeObjectURL(url), 1000);
}
