# Example setting wallet

This is a static starting wallet for a separate setting repository. Replace `example_setting` with a unique ASCII `manifest.id` and update the ZIP root folder to match it.

`data/mechanics.json` is illustrative metadata only. The current app safely stores `.trpg` files but does not load this schema, activate this setting, or execute code from its archive. Define setting mechanics only after the engine/runtime contract is agreed and versioned.

Keep this wallet self-contained. The packer includes ordinary wallet files but excludes Git history, dependency/build caches, environment files, keys, and certificates. Do not add credentials or personal data.
