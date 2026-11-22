<script lang="ts">
	import type { Session } from "../../../src/lib/session/session.ts";
	import { provideSession } from "../../../src/lib/session/context.ts";
	import Reader from "./Reader.svelte";

	let { session }: { session: Session } = $props();
	// The layout creates one session per tenant; it never changes under a mounted layout.
	// svelte-ignore state_referenced_locally
	provideSession(session);
</script>

<Reader />
