<script lang="ts">
    import { onMount, untrack } from "svelte";
    import CaretDown from "../icons/CaretDown.svelte";
    import Check from "../icons/Check.svelte";
    import Spinner from "./Spinner.svelte";
    import type { DropdownItem, DropdownProps } from "../../types/dropdown.ts";

    const uniqueId = $props.id();

    let {
        items,
        value = $bindable(""),
        id = uniqueId,
        name,
        label,
        placeholder = "Select an option",
        required = false,
        disabled = false,
        loading = false,
        onchange,
        searchable = false
    }: DropdownProps & { searchable?: boolean } = $props();

    let root: HTMLDivElement;
    let control = $state<HTMLInputElement | HTMLButtonElement>()!;
    let formSelect: HTMLSelectElement;
    let panel: HTMLDivElement;

    // UI state
    let open = $state(false);
    let query = $state("");
    let activeIndex = $state(-1);
    let invalid = $state(false);
    let typeAhead = "";
    let lastTypedAt = 0;

    const initialValue = untrack(() => value);
    const selected = $derived(items.find((item) => item.value === value));
    const submittedValue = $derived(selected?.disabled ? "" : (selected?.value ?? ""));
    const options = $derived(
        (required ? items : [{ value: "", label: placeholder }, ...items]).filter(
            (item) =>
                !searchable ||
                !query.trim() ||
                (item.label + " " + (item.searchText ?? ""))
                    .toLowerCase()
                    .includes(query.trim().toLowerCase())
        )
    );
    const activeOption = $derived(options[activeIndex]);
    const expanded = $derived(open && !disabled && !loading);

    function unavailable() {
        return disabled || loading || formSelect?.matches(":disabled");
    }

    function close() {
        open = false;
        query = "";
        activeIndex = -1;
    }

    function reveal(direction = 1) {
        if (unavailable()) return;

        query = "";
        const currentIndex = options.findIndex((item) => item.value === value && !item.disabled);
        activeIndex =
            currentIndex >= 0
                ? currentIndex
                : direction === 1
                  ? options.findIndex((item) => !item.disabled)
                  : options.findLastIndex((item) => !item.disabled);
        open = true;
    }

    function choose(item: DropdownItem) {
        if (unavailable() || item.disabled) return;

        value = item.value;
        invalid = false;
        close();
        onchange?.(
            value,
            items.find((entry) => entry.value === value)
        );
        control.focus();
    }

    function navigate(direction: number) {
        const start = activeIndex < 0 ? (direction === 1 ? -1 : 0) : activeIndex;

        for (let step = 1; step <= options.length; step++) {
            const index =
                (((start + direction * step) % options.length) + options.length) % options.length;
            if (!options[index].disabled) {
                activeIndex = index;
                return;
            }
        }

        activeIndex = -1;
    }

    function keydown(event: KeyboardEvent) {
        if (unavailable()) return;

        if (event.key === "Escape" && open) {
            event.preventDefault();
            event.stopPropagation();
            close();
        } else if (event.key === "Tab") close();
        else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            const direction = event.key === "ArrowDown" ? 1 : -1;
            if (!open) reveal(direction);
            else navigate(direction);
        } else if (event.key === "Enter" || (!searchable && event.key === " ")) {
            event.preventDefault();
            if (!open) reveal();
            else if (activeOption) choose(activeOption);
        } else if (open && (event.key === "Home" || event.key === "End") && !searchable) {
            event.preventDefault();
            activeIndex =
                event.key === "Home"
                    ? options.findIndex((item) => !item.disabled)
                    : options.findLastIndex((item) => !item.disabled);
        } else if (
            !searchable &&
            event.key.length === 1 &&
            !event.ctrlKey &&
            !event.metaKey &&
            !event.altKey
        ) {
            event.preventDefault();
            if (!open) reveal();
            const now = Date.now();
            typeAhead = now - lastTypedAt > 700 ? event.key : typeAhead + event.key;
            lastTypedAt = now;
            const index = options.findIndex(
                (item) =>
                    !item.disabled && item.label.toLowerCase().startsWith(typeAhead.toLowerCase())
            );
            if (index >= 0) activeIndex = index;
        }
    }

    function positionPanel() {
        const rect = root.getBoundingClientRect();
        const above =
            window.innerHeight - rect.bottom < 200 && rect.top > window.innerHeight - rect.bottom;

        panel.style.width = Math.min(rect.width, window.innerWidth - 16) + "px";
        panel.style.left =
            Math.max(8, Math.min(rect.left, window.innerWidth - rect.width - 8)) + "px";
        panel.style.top = above ? "auto" : rect.bottom + 4 + "px";
        panel.style.bottom = above ? window.innerHeight - rect.top + 4 + "px" : "auto";
        panel.style.maxHeight =
            Math.max(
                80,
                Math.min(280, (above ? rect.top : window.innerHeight - rect.bottom) - 16)
            ) + "px";
    }

    // Keep the panel positioned above surrounding containers and dialogs.
    $effect(() => {
        if (!expanded) {
            panel?.hidePopover();
            return;
        }

        positionPanel();
        panel.showPopover();

        const outside = (event: PointerEvent) => {
            if (event.target instanceof Node && !root.contains(event.target)) close();
        };
        const reposition = (event: Event) => {
            if (event.target instanceof Node && panel.contains(event.target)) return;
            positionPanel();
        };

        document.addEventListener("pointerdown", outside);
        window.addEventListener("resize", positionPanel);
        document.addEventListener("scroll", reposition, true);

        return () => {
            panel.hidePopover();
            document.removeEventListener("pointerdown", outside);
            window.removeEventListener("resize", positionPanel);
            document.removeEventListener("scroll", reposition, true);
        };
    });

    $effect(() => {
        if (expanded && activeOption) {
            panel.querySelector('[data-active="true"]')?.scrollIntoView({ block: "nearest" });
        }
    });

    onMount(() => {
        const form = formSelect.form;

        const reset = () => {
            value = initialValue;
            invalid = false;
            close();
        };

        form?.addEventListener("reset", reset);
        return () => form?.removeEventListener("reset", reset);
    });
</script>

<div
    class="dropdown"
    bind:this={root}
    onfocusout={(event) => {
        if (!(event.relatedTarget instanceof Node) || !root.contains(event.relatedTarget)) close();
    }}
>
    <select
        class="form-value"
        {name}
        value={submittedValue}
        {required}
        disabled={disabled || loading}
        tabindex="-1"
        aria-hidden="true"
        bind:this={formSelect}
        oninvalid={(event) => {
            event.preventDefault();
            invalid = true;
            control.focus();
        }}
    >
        <option value="">{placeholder}</option>

        {#each items as item (item.value)}
            <option
                value={item.value}
                disabled={item.disabled}
            >
                {item.label}
            </option>
        {/each}
    </select>

    {#if searchable}
        <input
            {id}
            bind:this={control}
            role="combobox"
            type="text"
            autocomplete="off"
            value={expanded ? query : (selected?.label ?? "")}
            {placeholder}
            disabled={disabled || loading}
            aria-label={label}
            aria-autocomplete="list"
            aria-expanded={expanded}
            aria-controls={id + "-options"}
            aria-activedescendant={expanded && activeOption
                ? id + "-option-" + activeIndex
                : undefined}
            aria-required={required}
            aria-invalid={invalid}
            aria-describedby={invalid ? id + "-error" : undefined}
            onfocus={() => reveal()}
            onclick={() => {
                if (!open) reveal();
            }}
            oninput={(event) => {
                query = event.currentTarget.value;
                open = true;
                activeIndex = options.findIndex((item) => !item.disabled);
            }}
            onkeydown={keydown}
        />
    {:else}
        <button
            {id}
            bind:this={control}
            type="button"
            role="combobox"
            class="dropdown-trigger"
            disabled={disabled || loading}
            aria-label={label}
            aria-haspopup="listbox"
            aria-expanded={expanded}
            aria-controls={id + "-options"}
            aria-activedescendant={expanded && activeOption
                ? id + "-option-" + activeIndex
                : undefined}
            aria-required={required}
            aria-invalid={invalid}
            aria-describedby={invalid ? id + "-error" : undefined}
            onclick={() => (open ? close() : reveal())}
            onkeydown={keydown}
        >
            <span class:placeholder={!selected}>
                {selected?.label ?? placeholder}
            </span>
        </button>
    {/if}

    <span
        class="caret"
        aria-hidden="true"
    >
        {#if loading}
            <Spinner />
        {:else}
            <CaretDown properties="size-4" />
        {/if}
    </span>

    <div
        class="dropdown-panel"
        popover="manual"
        bind:this={panel}
    >
        <div
            id={id + "-options"}
            role="listbox"
            aria-label={label}
        >
            {#each options as item, index (item.value)}
                <button
                    type="button"
                    id={id + "-option-" + index}
                    role="option"
                    tabindex="-1"
                    aria-selected={item.value === submittedValue}
                    aria-disabled={!!item.disabled}
                    class="dropdown-option"
                    class:active={index === activeIndex}
                    data-active={index === activeIndex}
                    disabled={item.disabled || disabled || loading}
                    onpointerdown={(event) => event.preventDefault()}
                    onclick={() => choose(item)}
                >
                    <span>{item.label}</span>

                    {#if item.value === submittedValue}
                        <span aria-hidden="true">
                            <Check properties="size-4" />
                        </span>
                    {/if}
                </button>
            {:else}
                <p
                    class="empty-options"
                    role="status"
                >
                    {loading ? "Loading…" : "No matching options"}
                </p>
            {/each}
        </div>
    </div>

    {#if invalid}
        <small
            class="field-error"
            id={id + "-error"}
            role="alert"
        >
            Choose {label.toLowerCase()}.
        </small>
    {/if}
</div>

<style>
    .dropdown {
        position: relative;
        min-width: 0;
        width: 100%;
    }

    .form-value {
        position: absolute;
        width: 1px;
        height: 1px;
        padding: 0;
        margin: -1px;
        overflow: hidden;
        clip-path: inset(50%);
        border: 0;
    }

    .dropdown input,
    button.dropdown-trigger {
        width: 100%;
        padding: 10px 38px 10px 12px;
        border: 1px solid var(--line-strong);
        border-radius: 8px;
        background: var(--field);
        color: var(--text);
        font: inherit;
        line-height: 1.5;
        text-align: left;
    }

    button.dropdown-trigger {
        justify-content: flex-start;
        font-weight: 400;
    }

    button.dropdown-trigger:hover:not(:disabled) {
        border-color: #636371;
        background: var(--field);
    }

    .dropdown :is(input, button.dropdown-trigger):focus-visible {
        border-color: var(--accent);
        box-shadow: 0 0 0 3px var(--accent-dim);
        outline: none;
    }

    .dropdown [aria-invalid="true"] {
        border-color: var(--accent);
    }

    .placeholder {
        color: var(--muted);
    }

    .caret {
        position: absolute;
        right: 12px;
        top: 14px;
        display: flex;
        color: var(--muted);
        pointer-events: none;
    }

    .dropdown-panel {
        position: fixed;
        margin: 0;
        padding: 4px;
        overflow: auto;
        overscroll-behavior: contain;
        border: 1px solid var(--line-strong);
        border-radius: 8px;
        background: var(--surface-raised);
        color: var(--text);
        box-shadow: 0 12px 30px #0006;
    }

    button.dropdown-option {
        display: flex;
        width: 100%;
        justify-content: space-between;
        gap: 12px;
        padding: 9px 10px;
        border-radius: 5px;
        background: transparent;
        color: var(--text-secondary);
        font-weight: 400;
        text-align: left;
        white-space: normal;
        overflow-wrap: anywhere;
    }

    button.dropdown-option:is(.active, :hover):not(:disabled) {
        background: #292934;
        color: var(--text);
    }

    button.dropdown-option[aria-selected="true"]:not(:disabled) {
        background: #343440;
        color: var(--text);
    }

    button.dropdown-option[aria-selected="true"]:is(.active, :hover):not(:disabled) {
        background: #3c3c49;
    }

    .empty-options {
        margin: 0;
        padding: 14px 10px;
        color: var(--muted);
    }

    .field-error {
        color: var(--accent-soft);
    }
</style>
