import type { ForgeConfig } from "@electron-forge/shared-types";
import { MakerSquirrel } from "@electron-forge/maker-squirrel";
import { MakerZIP } from "@electron-forge/maker-zip";
import { MakerDeb } from "@electron-forge/maker-deb";
import { MakerRpm } from "@electron-forge/maker-rpm";
import { VitePlugin } from "@electron-forge/plugin-vite";
import { FusesPlugin } from "@electron-forge/plugin-fuses";
import { PublisherGithub } from "@electron-forge/publisher-github";
import { FuseV1Options, FuseVersion } from "@electron/fuses";
import { MakerDMG } from "@electron-forge/maker-dmg";
import path from "node:path";

const isMac = process.platform === "darwin";
const isWindows = process.platform === "win32";
const isLinux = process.platform === "linux";

const makers = [
  ...(isWindows
    ? [
        new MakerSquirrel({
          setupIcon: path.resolve(__dirname, "assets", "icons", "icon.ico"),
        }),
      ]
    : []),

  ...(isMac
    ? [
        new MakerDMG({
          format: "ULFO",
        }),
        new MakerZIP({}, ["darwin"]),
      ]
    : []),

  ...(isLinux ? [new MakerDeb({}), new MakerRpm({})] : []),
];

const config: ForgeConfig = {
  packagerConfig: {
    icon: path.resolve(__dirname, "assets", "icons", "icon"),
    asar: true,
  },
  rebuildConfig: {},
  makers,

  publishers: [
    new PublisherGithub({
      repository: {
        owner: "engroup-dev",
        name: "egc-management",
      },
      draft: true,
      prerelease: false,
    }),
  ],

  plugins: [
    new VitePlugin({
      build: [
        {
          entry: "src/main.ts",
          config: "vite.main.config.ts",
          target: "main",
        },
        {
          entry: "src/preload.ts",
          config: "vite.preload.config.ts",
          target: "preload",
        },
      ],
      renderer: [
        {
          name: "main_window",
          config: "vite.renderer.config.ts",
        },
      ],
    }),
    new FusesPlugin({
      version: FuseVersion.V1,
      [FuseV1Options.RunAsNode]: false,
      [FuseV1Options.EnableCookieEncryption]: true,
      [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
      [FuseV1Options.EnableNodeCliInspectArguments]: false,
      [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
      [FuseV1Options.OnlyLoadAppFromAsar]: true,
    }),
  ],
};

export default config;
