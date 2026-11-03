// Embed a Windows manifest so 0xFLUX always launches elevated (administrator).
// Elevation is required for packet capture, OS fingerprinting and UDP scanning;
// the bundled engine, started as a child process, inherits the elevated token.
fn main() {
    let mut attributes = tauri_build::Attributes::new();

    #[cfg(windows)]
    {
        const MANIFEST: &str = r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<assembly xmlns="urn:schemas-microsoft-com:asm.v1" manifestVersion="1.0">
  <trustInfo xmlns="urn:schemas-microsoft-com:asm.v3">
    <security>
      <requestedPrivileges>
        <requestedExecutionLevel level="requireAdministrator" uiAccess="false" />
      </requestedPrivileges>
    </security>
  </trustInfo>
  <!-- Common Controls v6 (TaskDialogIndirect, etc.). Tauri's default manifest
       declares it; replacing the manifest without it makes Windows fail to start the app. -->
  <dependency>
    <dependentAssembly>
      <assemblyIdentity type="win32" name="Microsoft.Windows.Common-Controls"
                        version="6.0.0.0" processorArchitecture="*"
                        publicKeyToken="6595b64144ccf1df" language="*" />
    </dependentAssembly>
  </dependency>
</assembly>
"#;
        attributes = attributes
            .windows_attributes(tauri_build::WindowsAttributes::new().app_manifest(MANIFEST));
    }

    tauri_build::try_build(attributes).expect("failed to run tauri-build");
}
