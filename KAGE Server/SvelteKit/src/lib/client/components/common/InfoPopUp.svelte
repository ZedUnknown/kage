<script lang="ts">
	import Phone from "$lib/components/icons/Phone.svelte";
	import { UPLOAD_BASE_URL } from "$lib/constants";
    import { portal } from "$lib/utils/portal";
	import Avatar from "./Avatar.svelte";
	import ImagePreview from "./ImagePreview.svelte";


let {
    data,
    toggle = $bindable(),
    anchorElement,

    commonMode = false, // Show only creation, update and last-seen details.
    opt_allUsersDetails = [] // only needed in commonMode
} = $props();

    let showImagePreview = $state(false);

    let src = data.profile_photo ? `${UPLOAD_BASE_URL}/${data.profile_photo}` : undefined;
    let alt = data.full_name || data.name;

    let style = $derived(() => {
        if (!anchorElement || !toggle) return 'display:none;';

        const rect = anchorElement.getBoundingClientRect();

        return `position:fixed; top:${rect.top - 9}px; left:${rect.right + 8}px; z-index:9999;`;
    });

</script>

<ImagePreview bind:show={showImagePreview} {src} {alt} />

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
    use:portal
    style={style()}
    tabindex="-1"
    class="min-w-[260px] {commonMode ? 'rounded-xl' : 'rounded-2xl'} border border-gray-300 bg-white shadow-lg transition {toggle ? 'scale-100 opacity-100' : 'scale-95 opacity-0 pointer-events-none'}"

    onmouseenter={() => toggle = true}
    onmouseleave={() => toggle = false}
>
    <div class="flex flex-col w-full py-3">

        {#if !commonMode}
            <div class="flex gap-3.5 w-full px-3 items-center">
                <button
                    onclick={() => {
                        if (!src) return;
                        showImagePreview = true;
                    }}
                >
                    <Avatar
                        displayImage={src}
                        displayText={alt}
                        status={null}
                    />
                </button>

                <div class=" flex flex-col w-full flex-1">
                    <div class="flex items-center gap-1 mb-0.5">
                        <div class="text-md font-medium line-clamp-1">{data.full_name || data.name}</div>
                        <div class="text-sm text-gray-500 line-clamp-1">{data.username ? `@${data.username}` : ''}</div>
                    </div>
                    <div class=" flex items-center gap-2">
                        <!-- <div>
                            <span class="relative flex size-2">
                                <span class="relative inline-flex rounded-full size-2 {user.is_active ? 'bg-emerald-600' : 'bg-red-400'}"></span>
                            </span>
                        </div> -->
                        <!-- <span class="text-xs">{user.is_active ? 'Active' : 'Inactive'}</span> -->
                        <div class="text-xs font-google-sans text-gray-500">
                            ID: {data.id}
                        </div>
                    </div>
                </div>
            </div>

            <hr class="border-gray-300 my-2.5">
        {/if}

        <div class=" flex flex-col w-full px-2.5 items-center">
            <div class=" flex flex-col w-full gap-2">
                {#if !commonMode}
                    <div class="flex flex-col w-full gap-1">
                        <h2 class="text-xs tracking-wide font-bold text-gray-500">Personal Info</h2>

                        <div class="border border-gray-300 rounded-lg p-2 flex flex-col gap-2">

                            <div class=" flex items-center gap-2">
                                <div class="text-xs text-gray-500">
                                    <Phone properties="size-4 text-gray-500"/>
                                </div>
                                <div class="text-xs font-google-sans text-gray-900">{data.phone_number ? data.phone_number : 'N/A'}</div>
                            </div>

                        </div>
                    </div>
                {/if}

                <div class="flex flex-col w-full gap-1">
                    <!-- <h2 class="text-sm tracking-wide font-bold text-gray-500">Account Info</h2> -->

                    <div class="border border-gray-300 rounded-lg p-2 flex flex-col gap-2">
                        {#if data.created_at}
                            <div class=" flex items-center gap-2">
                                <div class="text-xs text-gray-500">Created At:</div>
                                <div class="text-xs font-google-sans text-gray-500">{new Date(data.created_at).toLocaleDateString()}</div>
                            </div>
                        {/if}

                        {#if data.created_by}
                            <div class=" flex items-center gap-2">
                                <div class="text-xs text-gray-500">Created By:</div>
                                <div class="text-xs font-google-sans text-gray-500">{opt_allUsersDetails.find(user => user.id === data.created_by)?.username || data.created_by}</div>
                            </div>
                        {/if}

                        {#if data.updated_at}
                            <div class=" flex items-center gap-2">
                                <div class="text-xs text-gray-500">Updated At:</div>
                                <div class="text-xs font-google-sans text-gray-500">{new Date(data.updated_at).toLocaleDateString()}</div>
                            </div>
                        {/if}

                        {#if data.updated_by}
                            <div class=" flex items-center gap-2">
                                <div class="text-xs text-gray-500">Updated By:</div>
                                <div class="text-xs font-google-sans text-gray-500">{opt_allUsersDetails.find(user => user.id === data.updated_by)?.username || data.updated_by}</div>
                            </div>
                        {/if}

                        {#if data.last_seen}
                            <div class=" flex items-center gap-2">
                                <div class="text-xs text-gray-500">Last Seen:</div>
                                <div class="text-xs font-google-sans text-gray-500">{new Date(data.last_seen).toLocaleDateString()}</div>
                            </div>
                        {/if}
                    </div>
                </div>

            </div>
        </div>

    </div>
</div>