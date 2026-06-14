"""
Generate Tradescharge investor pitch deck PDF.
Run: python scripts/generate_pitch_deck.py
"""

from io import BytesIO

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_LEFT
from reportlab.lib.pagesizes import landscape
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import inch
from reportlab.platypus import (
    PageBreak,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)

OUTPUT = "d:/Tradescharge/docs/Tradescharge-Pitch-Deck.pdf"
OUTPUT_FALLBACK = "d:/Tradescharge/docs/Tradescharge-Pitch-Deck-new.pdf"
PAGE = landscape((13.333 * inch, 7.5 * inch))  # 16:9 style
CONTENT_W = PAGE[0] - 1.3 * inch  # usable width inside margins

NAVY = colors.HexColor("#0f172a")
TEAL = colors.HexColor("#0d9488")
LIGHT = colors.HexColor("#f1f5f9")
MUTED = colors.HexColor("#64748b")
WHITE = colors.white
ACCENT = colors.HexColor("#14b8a6")


def slide_bg(canvas, _doc):
    canvas.saveState()
    canvas.setFillColor(NAVY)
    canvas.rect(0, 0, PAGE[0], PAGE[1], fill=1, stroke=0)
    canvas.setFillColor(ACCENT)
    canvas.rect(0, PAGE[1] - 6, PAGE[0], 6, fill=1, stroke=0)
    canvas.restoreState()


def cover_bg(canvas, _doc):
    canvas.saveState()
    canvas.setFillColor(NAVY)
    canvas.rect(0, 0, PAGE[0], PAGE[1], fill=1, stroke=0)
    canvas.setFillColor(TEAL)
    canvas.circle(PAGE[0] * 0.85, PAGE[1] * 0.2, 120, fill=1, stroke=0)
    canvas.setFillColor(colors.HexColor("#134e4a"))
    canvas.circle(PAGE[0] * 0.15, PAGE[1] * 0.75, 80, fill=1, stroke=0)
    canvas.restoreState()


def build_styles():
    base = getSampleStyleSheet()
    return {
        "cover_title": ParagraphStyle(
            "cover_title",
            parent=base["Title"],
            fontSize=44,
            leading=50,
            textColor=WHITE,
            alignment=TA_CENTER,
            spaceAfter=12,
        ),
        "cover_sub": ParagraphStyle(
            "cover_sub",
            parent=base["Normal"],
            fontSize=18,
            leading=24,
            textColor=colors.HexColor("#99f6e4"),
            alignment=TA_CENTER,
            spaceAfter=8,
        ),
        "cover_meta": ParagraphStyle(
            "cover_meta",
            parent=base["Normal"],
            fontSize=12,
            textColor=MUTED,
            alignment=TA_CENTER,
        ),
        "slide_title": ParagraphStyle(
            "slide_title",
            parent=base["Heading1"],
            fontSize=28,
            leading=34,
            textColor=ACCENT,
            spaceAfter=16,
        ),
        "h2": ParagraphStyle(
            "h2",
            parent=base["Heading2"],
            fontSize=16,
            leading=20,
            textColor=WHITE,
            spaceBefore=10,
            spaceAfter=6,
        ),
        "body": ParagraphStyle(
            "body",
            parent=base["Normal"],
            fontSize=13,
            leading=18,
            textColor=LIGHT,
            spaceAfter=6,
        ),
        "bullet": ParagraphStyle(
            "bullet",
            parent=base["Normal"],
            fontSize=12,
            leading=16,
            textColor=LIGHT,
            leftIndent=18,
            bulletIndent=6,
            spaceAfter=4,
        ),
        "small": ParagraphStyle(
            "small",
            parent=base["Normal"],
            fontSize=10,
            leading=13,
            textColor=MUTED,
        ),
        "footer": ParagraphStyle(
            "footer",
            parent=base["Normal"],
            fontSize=9,
            textColor=MUTED,
            alignment=TA_CENTER,
        ),
        "th": ParagraphStyle(
            "th",
            parent=base["Normal"],
            fontName="Helvetica-Bold",
            fontSize=11,
            leading=14,
            textColor=WHITE,
        ),
        "td": ParagraphStyle(
            "td",
            parent=base["Normal"],
            fontSize=10,
            leading=13,
            textColor=LIGHT,
        ),
    }


def para(text: str, style: ParagraphStyle) -> Paragraph:
    """Wrap cell text so ReportLab renders & and wraps lines."""
    safe = text.replace("&", "&amp;")
    return Paragraph(safe, style)


def bullets(items, style):
    return [Paragraph(f"• {item}", style) for item in items]


def make_table(rows: list[list[str]], col_fracs: list[float], styles: dict) -> Table:
    col_widths = [CONTENT_W * f for f in col_fracs]
    data = []
    for ri, row in enumerate(rows):
        cell_style = styles["th"] if ri == 0 else styles["td"]
        data.append([para(cell, cell_style) for cell in row])

    t = Table(data, colWidths=col_widths, hAlign="LEFT", repeatRows=1)
    t.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), TEAL),
                ("BACKGROUND", (0, 1), (-1, -1), colors.HexColor("#1e293b")),
                ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#334155")),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("TOPPADDING", (0, 0), (-1, -1), 8),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
                ("LEFTPADDING", (0, 0), (-1, -1), 10),
                ("RIGHTPADDING", (0, 0), (-1, -1), 10),
            ]
        )
    )
    return t


def main():
    styles = build_styles()
    story = []

    # Cover
    story.append(Spacer(1, 1.6 * inch))
    story.append(Paragraph("Tradescharge", styles["cover_title"]))
    story.append(Paragraph("Real-time net F&amp;O P&amp;L after every Zerodha cost", styles["cover_sub"]))
    story.append(Spacer(1, 0.3 * inch))
    story.append(Paragraph("Investor pitch deck · May 2026 · Confidential", styles["cover_meta"]))
    story.append(PageBreak())

    # Problem
    story.append(Paragraph("The problem", styles["slide_title"]))
    story.extend(
        bullets(
            [
                "Kite shows <b>gross P&amp;L</b> on open and closed legs — not what you actually keep after brokerage, STT, exchange fees, GST, and stamp duty.",
                "On busy scalp days, <b>turnover qty ≠ net flat qty</b>; traders misread breakeven and exit too early or too late.",
                "Transaction costs are invisible until the <b>contract note</b> — too late for intraday decisions on SL, target, and capital protection.",
                "Third-party tools often show analytics or greeks; few show <b>live, charge-aware net P&amp;L</b> aligned to Zerodha’s fee structure.",
            ],
            styles["bullet"],
        )
    )
    story.append(PageBreak())

    # Solution
    story.append(Paragraph("The solution", styles["slide_title"]))
    story.append(
        Paragraph(
            "Tradescharge is a <b>view-only</b> dashboard that connects to Zerodha via Kite Connect OAuth. "
            "Traders continue to place orders on Kite; Tradescharge shows the true economics of each leg in real time.",
            styles["body"],
        )
    )
    story.extend(
        bullets(
            [
                "<b>Live net P&amp;L</b> per open and closed position with entry + exit charge breakdown.",
                "<b>Portfolio-aware breakeven</b> — points and lots required to cover all legs and costs.",
                "<b>Capital balance</b> reflecting margin-enabled cash and today’s charge-aware net result.",
                "<b>Reconciliation-grade charge engine</b> built from Zerodha’s published F&amp;O fee schedule.",
            ],
            styles["bullet"],
        )
    )
    story.append(PageBreak())

    # Market
    story.append(Paragraph("Market opportunity", styles["slide_title"]))
    story.append(
        make_table(
            [
                ["Segment", "Estimate", "Notes"],
                ["TAM — India retail F&O participants", "~8–10M accounts", "Rapid growth post 2020; options dominate volume"],
                ["SAM — Zerodha active F&O traders", "~2.5M users", "Primary MVP segment (Zerodha ecosystem)"],
                ["SOM — Year 3 target", "15,000–25,000 paying", "0.6–1% of SAM; community-led acquisition"],
            ],
            [0.36, 0.22, 0.42],
            styles,
        )
    )
    story.append(Spacer(1, 0.15 * inch))
    story.append(
        Paragraph(
            "India F&amp;O turnover remains among the world’s largest; retail participation and options complexity "
            "increase demand for <b>post-cost clarity</b> during the session, not only EOD statements.",
            styles["body"],
        )
    )
    story.append(PageBreak())

    # Competition
    story.append(Paragraph("Competitive landscape", styles["slide_title"]))
    story.append(
        make_table(
            [
                ["Player", "What they offer", "Gap vs Tradescharge"],
                ["Zerodha Kite", "Gross P&L, margins, orders", "No live per-leg net after all charges"],
                ["Sensibull / Opstra", "Strategy, OI, greeks", "Not contract-note-grade live net P&L"],
                ["Broker contract note", "Final accurate costs", "EOD only; no intraday support"],
                ["Excel / manual", "Custom trackers", "Stale, error-prone, no live ticks"],
            ],
            [0.22, 0.38, 0.40],
            styles,
        )
    )
    story.append(PageBreak())

    # Advantage
    story.append(Paragraph("Competitive advantage", styles["slide_title"]))
    story.extend(
        bullets(
            [
                "<b>Accuracy moat:</b> Charge engine validated against Zerodha contract notes and tradebook (May 2025: portfolio gross ₹-6,682 and net ₹-13,532 matched within ₹0.44).",
                "<b>Live-first design:</b> Built for intraday ticks and multi-leg portfolios, not EOD spreadsheets.",
                "<b>Trust positioning:</b> View-only — no order routing; reduces regulatory and user-trust friction vs execution apps.",
                "<b>Zerodha-native:</b> Fee logic mirrors Kite’s F&amp;O schedule (brokerage caps, STT on sell, stamp on buy, IGST).",
                "<b>Depth for scalpers:</b> Handles multiple round-trips per symbol; uses Kite authoritative gross with transparent charge split.",
            ],
            styles["bullet"],
        )
    )
    story.append(PageBreak())

    # Product
    story.append(Paragraph("Product — features &amp; benefits", styles["slide_title"]))
    story.append(
        make_table(
            [
                ["Feature", "Benefit to trader"],
                ["Real-time gross & net P&L per leg", "Know true win/loss before contract note"],
                ["Entry / exit charge breakdown", "See STT, brokerage, GST, stamp, exchange, SEBI"],
                ["Charge-aware breakeven calculator", "Set SL/target with costs included"],
                ["Live index tickers + option chain", "Context without leaving P&L view"],
                ["Closed book + executed tab", "Audit day against broker records"],
                ["Demo mode", "Try without login; convert via Kite OAuth"],
            ],
            [0.42, 0.58],
            styles,
        )
    )
    story.append(PageBreak())

    # Traction
    story.append(Paragraph("Traction &amp; validation", styles["slide_title"]))
    story.append(Paragraph("Product maturity", styles["h2"]))
    story.extend(
        bullets(
            [
                "MVP live: React dashboard + Express API + Kite Connect OAuth (view-only default).",
                "Automated test suite for charges, order validation, closed-position builder, and live sync.",
                "Short-option writer support and margin-aware capital display shipped.",
            ],
            styles["bullet"],
        )
    )
    story.append(Paragraph("Validation completed", styles["h2"]))
    story.extend(
        bullets(
            [
                "May 25, 2026: 5 closed F&amp;O legs reconciled to contract note — gross, net, and charge heads (Δ &lt; ₹1).",
                "Cross-checked against Kite P&amp;L export and tradebook CSV (172 trades).",
                "PRD reference contract note (₹17.46L turnover → ₹2,415.61 charges) — engine test passing.",
            ],
            styles["bullet"],
        )
    )
    story.append(Paragraph("Users &amp; growth trajectory", styles["h2"]))
    story.extend(
        bullets(
            [
                "<b>Stage:</b> Pre-revenue closed beta — founder dogfooding + invite-only testers.",
                "<b>User feedback:</b> Informal; formal cohort study planned post-Render deploy.",
                "<b>Trajectory:</b> Q2 2026 — 10–20 beta users → Q3 — public waitlist → Q4 — paid tier pilot (500 users target).",
            ],
            styles["bullet"],
        )
    )
    story.append(
        Paragraph(
            "<i>Note: Traction figures are targets for planning; update before investor meetings with actuals.</i>",
            styles["small"],
        )
    )
    story.append(PageBreak())

    # Business model
    story.append(Paragraph("Business model", styles["slide_title"]))
    story.append(Paragraph("Revenue", styles["h2"]))
    story.extend(
        bullets(
            [
                "<b>Freemium SaaS (B2C):</b> Free tier — 1 index, delayed refresh, 3 legs visible; Pro ₹399–₹799/mo — live stream, full book, breakeven tools, export.",
                "<b>Annual plan:</b> ₹3,999/yr (~2 months free) for active traders.",
                "<b>Future:</b> Referral with discount brokers (no payment for order flow — view-only today).",
            ],
            styles["bullet"],
        )
    )
    story.append(Paragraph("Customer acquisition", styles["h2"]))
    story.extend(
        bullets(
            [
                "Content: Reddit (r/IndianStreetBets, r/IndiaInvestments), X, YouTube — “gross vs net P&amp;L” education.",
                "Community: Closed beta → waitlist → founder-led demos.",
                "SEO: “Zerodha net P&amp;L calculator”, “F&amp;O charges live”, contract-note reconciliation.",
                "Partnerships: Trading educators, Telegram groups (compliance-safe disclaimers).",
            ],
            styles["bullet"],
        )
    )
    story.append(PageBreak())

    # Financials
    story.append(Paragraph("Financial forecast (illustrative)", styles["slide_title"]))
    story.append(
        Paragraph(
            "Assumptions: 5% free-to-paid conversion among active beta users; ARPU ₹550/mo blended; "
            "infra ₹15–25K/mo at scale; solo founder + contractors Year 1.",
            styles["small"],
        )
    )
    story.append(Spacer(1, 0.1 * inch))
    story.append(
        make_table(
            [
                ["Metric", "Year 1", "Year 2", "Year 3"],
                ["Paying subscribers (EoY)", "400", "2,500", "12,000"],
                ["MRR (₹)", "2.2L", "13.8L", "66L"],
                ["ARR (₹)", "26L", "1.65 Cr", "7.9 Cr"],
                ["Gross margin", "~85%", "~88%", "~90%"],
                ["Net burn / profit", "(₹8–12L)", "Break-even", "Profitable"],
            ],
            [0.34, 0.22, 0.22, 0.22],
            styles,
        )
    )
    story.append(Spacer(1, 0.12 * inch))
    story.append(
        Paragraph(
            "<i>Forecasts are illustrative for discussion. Not audited. Requires validation through paid beta and CAC/LTV measurement.</i>",
            styles["small"],
        )
    )
    story.append(PageBreak())

    # Close
    story.append(Paragraph("The ask &amp; next steps", styles["slide_title"]))
    story.extend(
        bullets(
            [
                "<b>Raise / use of funds:</b> ₹25–40L pre-seed or angel — 40% infra &amp; Kite compliance, 35% growth, 25% product (multi-broker roadmap).",
                "<b>12-month milestones:</b> Render production deploy → 500 paying users → multi-day reconciliation report → Bank Nifty/BFO parity.",
                "<b>Why now:</b> Retail F&amp;O participation at peak; traders feel cost pain daily; no dominant “net P&amp;L layer” on Kite.",
            ],
            styles["bullet"],
        )
    )
    story.append(Spacer(1, 0.4 * inch))
    story.append(Paragraph("Contact founder for beta access · tradescharge (beta)", styles["cover_meta"]))
    story.append(Paragraph("View-only · Not investment advice · Zerodha/Kite Connect independent product", styles["small"]))

    def on_page(canvas, doc):
        if canvas.getPageNumber() == 1:
            cover_bg(canvas, doc)
        else:
            slide_bg(canvas, doc)
            canvas.saveState()
            canvas.setFont("Helvetica", 9)
            canvas.setFillColor(MUTED)
            canvas.drawString(
                0.65 * inch,
                0.35 * inch,
                f"Tradescharge · Confidential · {canvas.getPageNumber()}",
            )
            canvas.restoreState()

    buf = BytesIO()
    doc = SimpleDocTemplate(
        buf,
        pagesize=PAGE,
        leftMargin=0.65 * inch,
        rightMargin=0.65 * inch,
        topMargin=0.55 * inch,
        bottomMargin=0.45 * inch,
    )
    doc.build(story, onFirstPage=on_page, onLaterPages=on_page)
    pdf_bytes = buf.getvalue()

    for out_path in (OUTPUT, OUTPUT_FALLBACK):
        try:
            with open(out_path, "wb") as f:
                f.write(pdf_bytes)
            print(f"Wrote {out_path} ({len(pdf_bytes):,} bytes)")
            break
        except PermissionError:
            continue
    else:
        raise PermissionError(
            f"Could not write PDF. Close {OUTPUT} if open in a viewer, then re-run."
        )


if __name__ == "__main__":
    main()
