# PyInstaller spec — freezes the 0xFLUX backend into one 0xflux-engine.exe.
# Build from backend/:  python -m PyInstaller flux_engine.spec --noconfirm
from PyInstaller.utils.hooks import collect_data_files, collect_submodules

hidden = (
    collect_submodules("app")
    + collect_submodules("uvicorn")
    + collect_submodules("websockets")
    + collect_submodules("dns")
    + collect_submodules("scapy.layers")
    + collect_submodules("scapy.arch")
    + [
        "scapy.all",
        "aiosqlite",
        "sqlalchemy.dialects.sqlite.aiosqlite",
        "nmap",
        "whois",
        "psutil",
    ]
)
datas = collect_data_files("whois") + collect_data_files("reportlab") + collect_data_files("scapy")

a = Analysis(
    ["flux_engine.py"],
    pathex=["."],
    hiddenimports=hidden,
    datas=datas,
    excludes=["tkinter", "matplotlib", "IPython", "pytest", "numpy"],
    noarchive=False,
)
pyz = PYZ(a.pure)
exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.datas,
    [],
    name="0xflux-engine",
    console=True,          # the desktop shell starts it hidden (CREATE_NO_WINDOW)
    upx=False,
    icon="../src-tauri/icons/icon.ico",
)
