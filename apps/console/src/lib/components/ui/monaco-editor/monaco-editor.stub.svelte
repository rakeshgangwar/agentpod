<script lang="ts">
  interface Props {
    code?: string;
    language?: string;
    readonly?: boolean;
    class?: string;
    onchange?: (value: string) => void;
    onsave?: () => void;
  }
  let { code = "", onchange }: Props = $props();
</script>

<textarea
  value={code}
  oninput={(e) => onchange?.((e.target as HTMLTextAreaElement).value)}
></textarea>
