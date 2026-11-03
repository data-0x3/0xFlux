"""Branded 0xFLUX PDF report generation (reportlab)."""
from __future__ import annotations

import io
from typing import Any

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import (
    Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle,
)

_BLACK = colors.HexColor("#080808")
_SURFACE = colors.HexColor("#161616")
_BORDER = colors.HexColor("#252525")
_MUTED = colors.HexColor("#929292")
_WHITE = colors.HexColor("#FFFFFF")


def _styles():
    ss = getSampleStyleSheet()
    ss.add(ParagraphStyle("FluxTitle", parent=ss["Title"], textColor=_BLACK,
                          fontName="Helvetica-Bold", fontSize=22, spaceAfter=2))
    ss.add(ParagraphStyle("FluxSub", parent=ss["Normal"], textColor=_MUTED,
                          fontName="Helvetica", fontSize=9, spaceAfter=14))
    ss.add(ParagraphStyle("FluxH2", parent=ss["Heading2"], textColor=_BLACK,
                          fontName="Helvetica-Bold", fontSize=13, spaceBefore=12, spaceAfter=6))
    return ss


def build_pdf(scan: dict[str, Any]) -> bytes:
    buf = io.BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=A4, topMargin=18 * mm, bottomMargin=18 * mm,
                            leftMargin=18 * mm, rightMargin=18 * mm, title=f"0xFLUX Scan {scan['id']}")
    ss = _styles()
    story: list = []

    story.append(Paragraph("0xFLUX", ss["FluxTitle"]))
    story.append(Paragraph("Network Intelligence Report &nbsp;·&nbsp; developed by 0x3", ss["FluxSub"]))

    summary = [
        ["Target", scan["target"], "Profile", scan["profile"]],
        ["Engine", scan["engine"], "Status", scan["status"]],
        ["Started", (scan["started_at"] or "")[:19].replace("T", " "),
         "Duration", f"{scan['duration_s'] or 0:.2f}s"],
        ["Hosts up", str(scan["hosts_up"]), "Open ports", str(scan["ports_open"])],
    ]
    t = Table(summary, colWidths=[28 * mm, 60 * mm, 28 * mm, 50 * mm])
    t.setStyle(TableStyle([
        ("FONT", (0, 0), (-1, -1), "Helvetica", 9),
        ("FONT", (0, 0), (0, -1), "Helvetica-Bold", 9),
        ("FONT", (2, 0), (2, -1), "Helvetica-Bold", 9),
        ("TEXTCOLOR", (0, 0), (-1, -1), _BLACK),
        ("LINEBELOW", (0, 0), (-1, -1), 0.4, _BORDER),
        ("TOPPADDING", (0, 0), (-1, -1), 5), ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
    ]))
    story.append(t)

    for host in scan.get("hosts", []):
        story.append(Paragraph(
            f"{host['ip']}" + (f" &nbsp;({host['hostname']})" if host.get("hostname") else ""),
            ss["FluxH2"]))
        meta = []
        if host.get("mac"):
            meta.append(f"MAC {host['mac']}")
        if host.get("vendor"):
            meta.append(host["vendor"])
        if host.get("os_guess"):
            meta.append(f"OS: {host['os_guess']}")
        if meta:
            story.append(Paragraph(" &nbsp;·&nbsp; ".join(meta), ss["FluxSub"]))

        open_ports = [p for p in host.get("ports", []) if p["state"] == "open"]
        if open_ports:
            rows = [["Port", "Proto", "State", "Service", "Version"]]
            rows += [[str(p["number"]), p["protocol"], p["state"],
                      p.get("service") or "—", p.get("version") or "—"] for p in open_ports]
            pt = Table(rows, colWidths=[18 * mm, 16 * mm, 20 * mm, 40 * mm, 72 * mm])
            pt.setStyle(TableStyle([
                ("FONT", (0, 0), (-1, -1), "Helvetica", 8.5),
                ("FONT", (0, 0), (-1, 0), "Helvetica-Bold", 8.5),
                ("BACKGROUND", (0, 0), (-1, 0), _BLACK),
                ("TEXTCOLOR", (0, 0), (-1, 0), _WHITE),
                ("TEXTCOLOR", (0, 1), (-1, -1), _BLACK),
                ("ROWBACKGROUNDS", (0, 1), (-1, -1), [_WHITE, colors.HexColor("#F4F4F4")]),
                ("GRID", (0, 0), (-1, -1), 0.3, _BORDER),
                ("TOPPADDING", (0, 0), (-1, -1), 4), ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
            ]))
            story.append(pt)
        else:
            story.append(Paragraph("No open ports detected.", ss["FluxSub"]))
        story.append(Spacer(1, 4))

    doc.build(story)
    return buf.getvalue()
