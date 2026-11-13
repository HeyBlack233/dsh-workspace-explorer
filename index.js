import z from '@deepseek-ai/schemastery';

/** Host half: the client module owns all UI. */
export const Config = z.object({
  // Workspaces group ordering shown by the explorer. Volatile so a change from
  // the page or the Settings form updates in place without reloading the plugin.
  orderBy: z.union(['manual', 'updated']).default('manual').volatile(),
});

export function apply() {}
