/** @type {import("prettier").Config} */
const config = {
	useTabs: true,
	singleQuote: true,
	trailingComma: 'none',
	printWidth: 100,
	plugins: ['prettier-plugin-svelte', 'prettier-plugin-tailwindcss'],
	overrides: [
		{ files: '*.svelte', options: { parser: 'svelte' } },
		{
			files: 'src/lib/client/components/common/DropDown.svelte',
			options: {
				useTabs: false,
				tabWidth: 4,
				singleQuote: false,
				singleAttributePerLine: true,
				htmlWhitespaceSensitivity: 'ignore'
			}
		}
	],
	tailwindStylesheet: './src/routes/layout.css'
};

export default config;
