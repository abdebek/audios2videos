## Documentation

### Dev

Run:

```
npm start
```

### Publish

To publish your ElectronJS app as an MSI installer using Electron Forge, you can follow these steps:

1. Install Electron Forge:

```
npm install -g electron-forge
```

2. Create a new Electron Forge project:

```
electron-forge init
```

3. Select the "ElectronJS" project type.
4. Enter the name of your app and other relevant information.
5. Once the project has been created, navigate to the project directory and install the dependencies:

```
npm install
```

6. Build the MSI installer:

```
npm run make
```

This will create an MSI installer in the `out` directory.

7. You can now distribute the MSI installer to your users.

```

```
