"""Minimal offline OUI (MAC prefix → vendor) table.

A small, commonly-seen subset ships inline so vendor hints work with zero
network access. Replace/extend ``_OUI`` with the full IEEE OUI list for
production coverage (the file format is just {"AABBCC": "Vendor"}).
"""
from __future__ import annotations

from typing import Optional

_OUI: dict[str, str] = {
    "FCFBFB": "Cisco", "001A2B": "Cisco", "00000C": "Cisco",
    "B827EB": "Raspberry Pi Foundation", "DCA632": "Raspberry Pi",
    "E45F01": "Raspberry Pi", "28CDC1": "Raspberry Pi",
    "F0D5BF": "Intel", "001B21": "Intel", "3C970E": "Intel",
    "AC DE48".replace(" ", ""): "Apple", "F0989D": "Apple", "A4B197": "Apple",
    "001124": "Apple", "D49A20": "Apple", "8C8590": "Apple",
    "FCFC48": "Apple", "88665A": "Apple",
    "00155D": "Microsoft (Hyper-V)", "000D3A": "Microsoft",
    "001C42": "Parallels", "080027": "VirtualBox", "005056": "VMware",
    "001A11": "Google", "F4F5E8": "Google", "3C5AB4": "Google",
    "D83ADD": "Google", "A47733": "Google",
    "5CCF7F": "Espressif (ESP)", "240AC4": "Espressif", "A020A6": "Espressif",
    "ECFABC": "Samsung", "002454": "Samsung", "5CF6DC": "Samsung",
    "D022BE": "Samsung", "FCA13E": "Samsung",
    "C83A35": "Tenda", "001583": "AVM (FRITZ!Box)", "3810D5": "AVM",
    "B0BE76": "TP-Link", "50C7BF": "TP-Link", "1C61B4": "TP-Link",
    "A42BB0": "TP-Link", "0C8063": "TP-Link",
    "F81A67": "TP-Link", "E894F6": "TP-Link",
    "001346": "D-Link", "340804": "D-Link",
    "44D9E7": "Ubiquiti", "788A20": "Ubiquiti", "FCECDA": "Ubiquiti",
    "245A4C": "Ubiquiti", "687251": "Ubiquiti",
    "001882": "Huawei", "48435A": "Huawei", "E0247F": "Huawei",
    "002129": "Netgear", "A040A0": "Netgear", "9C3DCF": "Netgear",
}


def lookup_vendor(mac: Optional[str]) -> Optional[str]:
    if not mac:
        return None
    prefix = mac.replace(":", "").replace("-", "").upper()[:6]
    return _OUI.get(prefix)
