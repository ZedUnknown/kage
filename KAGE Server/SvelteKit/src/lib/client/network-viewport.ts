export interface NetworkView {
	x: number;
	y: number;
	scale: number;
}

export const minNetworkScale = 0.2;
export const maxNetworkScale = 2;
export const limitNetworkScale = (scale: number) => Math.max(minNetworkScale, Math.min(maxNetworkScale, scale));

// Keep the same point in the network beneath the pointer when zooming.
export function zoomNetwork(
	view: NetworkView,
	scale: number,
	anchorX: number,
	anchorY: number
): NetworkView {
	const nextScale = limitNetworkScale(scale);
	const ratio = nextScale / view.scale;

	return {
		x: anchorX - (anchorX - view.x) * ratio,
		y: anchorY - (anchorY - view.y) * ratio,
		scale: nextScale
	};
}

export function fitNetwork(
	width: number,
	height: number,
	contentWidth: number,
	contentHeight: number
): NetworkView {
	const scale = limitNetworkScale(Math.min(
		1,
		Math.max(1, width - 48) / Math.max(1, contentWidth),
		Math.max(1, height - 80) / Math.max(1, contentHeight)
	));

	return { x: (width - contentWidth * scale) / 2, y: (height - contentHeight * scale) / 2, scale };
}
