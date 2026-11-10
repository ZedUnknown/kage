export type DropdownItem = {
	value: string;
	label: string;
	searchText?: string;
	disabled?: boolean;
};

export type DropdownProps = {
	items: DropdownItem[];
	value?: string;
	id?: string;
	name?: string;
	label: string;
	placeholder?: string;
	required?: boolean;
	disabled?: boolean;
	loading?: boolean;
	onchange?: (value: string, item: DropdownItem | undefined) => void;
};
