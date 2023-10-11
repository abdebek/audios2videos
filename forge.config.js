module.exports = {
  packagerConfig: {
    asar: true,
    icon: "assets/icon.ico",
  },
  icon: "assets/icon.ico",
  rebuildConfig: {},
  makers: [
    {
      name: "@electron-forge/maker-squirrel",
      config: {
        icon: "assets/icon.ico",
      },
    },
  ],
  plugins: [
    {
      name: "@electron-forge/plugin-auto-unpack-natives",
      config: {},
    },
  ],
};
