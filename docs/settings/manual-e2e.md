# Manual end-to-end test: Fallout `.trpg`

This is the single-setting acceptance path for checking package import, explicit activation, persistence, and teardown on PWA and Android. It does not depend on a server-side package catalog: each client imports and stores the `.trpg` locally.

## Build the package

From the app repository root:

```sh
python3 scripts/pack-setting.py modules/fallout --output artifacts/fallout-2d20-1.trpg
```

The packer builds `runtime/setting.cjs` from the manifest-declared runtime entry and includes it alongside the setting wallet files. The resulting archive must stay within the package limits enforced by the packer and installer.

## PWA

1. Start the web app (`npm run web -- --lan`) or deploy a fresh `npm run build` export to the normal PWA host.
2. For the empty-state check, use a fresh browser profile or clear this site's storage first. Confirm there are no setting-specific game tabs before a package is installed.
3. Open **Game setting** from the Home screen menu, choose **Local `.trpg`**, and select `artifacts/fallout-2d20-1.trpg`.
4. Install the selected file, then explicitly select **Fallout 2d20** from the installed list. Installation alone must not activate its code.
5. Verify that the setting's screens appear and can use their data, screens, and registered mechanics. Smoke-test character creation, equipment/inventory, one Fallout-specific mechanic, and the module language selector.
6. Reload the PWA. The locally installed package and active selection should be restored from IndexedDB, and its runtime should be activated again.
7. Delete the active package. Setting-specific tabs and settings should disappear; the client must not silently switch back to bundled Fallout.

## Android APK

Use an APK built from this engine branch. On the device:

1. Install and launch the APK; verify the initial setting list is empty on a clean app install.
2. Open **Game setting** → **Local `.trpg`**. In the Android document picker, select the same archive and install it.
3. Explicitly select Fallout 2d20 and run the same screen/mechanics smoke checks as on PWA.
4. Force-close and reopen the app. The package is expected to remain in app-private storage and be reactivated without a backend.
5. Delete it and confirm the setting-specific UI is removed, with no Fallout fallback.

## Acceptance notes

- Package installation validates and caches files locally; activation is a separate explicit action.
- PWA storage is IndexedDB. Native storage is under the app's private document directory.
- The runtime bundle is executable setting code, not a sandbox; install only a trusted `.trpg`.
- The current Arena sandbox has no Java or Android SDK, so it can build and serve the PWA and create the `.trpg`, but it cannot build/install or manually exercise an Android APK here. Complete the Android steps on a device with an APK built by the normal Android pipeline.
