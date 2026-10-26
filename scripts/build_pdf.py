#!/usr/bin/env python3
"""Build the designed PDF from docs/INVESTIGATION.md (requires reportlab)."""
import argparse
from html import escape
from pathlib import Path
import re
import textwrap
from reportlab.lib import colors
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.lib.enums import TA_LEFT
from reportlab.lib.styles import ParagraphStyle
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, PageBreak, Table, TableStyle, Preformatted, KeepTogether, Flowable
from reportlab.graphics.shapes import Drawing, Rect, String, Line, Polygon
ROOT = Path(__file__).resolve().parents[1]
NAVY = colors.HexColor("#111b2e")
TEAL = colors.HexColor("#137988")
VIOLET = colors.HexColor("#7956b0")
MUTED = colors.HexColor("#546277")
INK = colors.HexColor("#1b293b")
LIGHT = colors.HexColor("#edf3f7")
W = 504
# Embed fonts so the PDF does not depend on viewer substitutions.
font_root = Path('/usr/share/fonts/truetype/dejavu')
if font_root.exists():
    pdfmetrics.registerFont(TTFont('LabSans', str(font_root / 'DejaVuSans.ttf')))
    pdfmetrics.registerFont(TTFont('LabSans-Bold', str(font_root / 'DejaVuSans-Bold.ttf')))
    pdfmetrics.registerFont(TTFont('LabMono', str(font_root / 'DejaVuSansMono.ttf')))
else:
    font_root = Path('/System/Library/Fonts/Supplemental')
    pdfmetrics.registerFont(TTFont('LabSans', str(font_root / 'Arial.ttf')))
    pdfmetrics.registerFont(TTFont('LabSans-Bold', str(font_root / 'Arial Bold.ttf')))
    pdfmetrics.registerFont(TTFont('LabMono', str(font_root / 'Courier New.ttf')))
pdfmetrics.registerFontFamily('LabSans', normal='LabSans', bold='LabSans-Bold', italic='LabSans', boldItalic='LabSans-Bold')

body = ParagraphStyle("body", fontName="LabSans", fontSize=10.4, leading=15.1, textColor=INK, spaceAfter=10)
heading = ParagraphStyle("heading", fontName="LabSans-Bold", fontSize=22, leading=27, textColor=NAVY, spaceAfter=20)
small = ParagraphStyle("small", parent=body, fontSize=8.7, leading=12.3, textColor=MUTED)
cell = ParagraphStyle("cell", parent=body, fontSize=9, leading=12.3, spaceAfter=0)
header = ParagraphStyle("header", parent=cell, fontName="LabSans-Bold", textColor=colors.white)
code_style = ParagraphStyle("code", fontName="LabMono", fontSize=8.5, leading=12, textColor=TEAL)

def clean(text):
    return text.translate(str.maketrans({"\u2011":"-","\u2013":"-","\u2014":"-","\u2212":"-","\u00d7":"x","\u2192":"->","\u201c":'"',"\u201d":'"',"\u2019":"'"}))

def inline(text):
    text = escape(clean(text))
    text = re.sub(r"\*\*(.+?)\*\*", r"<b>\1</b>", text)
    text = re.sub(r"`([^`]+)`", r'<font name="LabMono" color="#137988">\1</font>', text)
    return text

def table(rows, compact=False):
    columns = len(rows[0])
    widths = [W*.29, W*.40, W*.31] if columns == 3 else [W / columns] * columns
    rendered = [[Paragraph(inline(value), header if i == 0 else cell) for value in row] for i,row in enumerate(rows)]
    result = Table(rendered, colWidths=widths, repeatRows=1, hAlign="LEFT")
    result.setStyle(TableStyle([
        ("BACKGROUND",(0,0),(-1,0),NAVY),("VALIGN",(0,0),(-1,-1),"TOP"),
        ("LEFTPADDING",(0,0),(-1,-1),9),("RIGHTPADDING",(0,0),(-1,-1),9),
        ("TOPPADDING",(0,0),(-1,-1),6 if compact else 9),("BOTTOMPADDING",(0,0),(-1,-1),6 if compact else 9),
        ("ROWBACKGROUNDS",(0,1),(-1,-1),[colors.white,LIGHT]),
        ("LINEBELOW",(0,0),(-1,0),.5,NAVY),("LINEBELOW",(0,1),(-1,-1),.4,colors.HexColor("#d6e0e7"))]))
    return result

def workflow():
    d = Drawing(W, 360)
    def node(x,y,w,h,title,sub=None,fill=LIGHT):
        d.add(Rect(x,y,w,h,rx=7,ry=7,fillColor=fill,strokeColor=colors.HexColor("#b7c8d5"),strokeWidth=.8))
        d.add(String(x+w/2,y+h/2+(4 if sub else -3),title,fontName="LabSans-Bold",fontSize=10,fillColor=INK,textAnchor="middle"))
        if sub:d.add(String(x+w/2,y+12,sub,fontName="LabSans",fontSize=8.3,fillColor=MUTED,textAnchor="middle"))
    def arrow(x1,y1,x2,y2,color=TEAL):
        d.add(Line(x1,y1,x2,y2,strokeColor=color,strokeWidth=1.4))
        if x1==x2:
            d.add(Polygon([x2,y2,x2-4,y2+7,x2+4,y2+7],fillColor=color,strokeColor=None))
        elif x2>x1:
            d.add(Polygon([x2,y2,x2-7,y2-4,x2-7,y2+4],fillColor=color,strokeColor=None))
        else:
            d.add(Polygon([x2,y2,x2+7,y2-4,x2+7,y2+4],fillColor=color,strokeColor=None))
    node(138,306,240,44,"Pin model and source","Exact commits + tokenizer")
    arrow(258,306,258,284)
    node(138,240,240,44,"Calibrate without steering","Residual medians on positions >= 1")
    d.add(Line(258,240,258,225,strokeColor=TEAL,strokeWidth=1.4))
    d.add(Line(124,225,392,225,strokeColor=TEAL,strokeWidth=1.4))
    arrow(124,225,124,208)
    arrow(392,225,392,208)
    node(8,156,232,52,"Hugging Face / BF16","Literal down_proj pre-hook")
    node(276,156,232,52,"Export residual vectors","llama.cpp / BF16, Q8 or Q4")
    d.add(Line(124,156,124,137,strokeColor=TEAL,strokeWidth=1.4))
    d.add(Line(392,156,392,137,strokeColor=TEAL,strokeWidth=1.4))
    d.add(Line(124,137,392,137,strokeColor=TEAL,strokeWidth=1.4))
    arrow(258,137,258,121)
    node(138,72,240,49,"Run the identical prompt","Baseline / recipe / reverse")
    arrow(258,72,258,54)
    node(138,5,240,49,"Save, check, and score","Sham -> coherence -> blinded evaluation")
    return d

def footer(canvas, doc):
    if doc.page == 1:return
    canvas.saveState()
    canvas.setFillColor(TEAL)
    canvas.rect(48,751,26,3,fill=1,stroke=0)
    canvas.setFillColor(MUTED)
    canvas.setFont("LabSans",8)
    canvas.drawString(82,750,"QWEN NEURON LAB  /  INVESTIGATION & LOCAL IMPLEMENTATION")
    canvas.setStrokeColor(colors.HexColor("#d6e0e7"))
    canvas.line(48,43,564,43)
    canvas.setFont("LabSans",8)
    canvas.drawString(48,28,"Rishabh Gupta  |  25 October 2026")
    canvas.drawRightString(564,28,str(doc.page).zfill(2))
    canvas.restoreState()

class Cover(Flowable):
    def __init__(self): Flowable.__init__(self); self.width=W;self.height=640
    def draw(self):
        c=self.canv
        c.saveState()
        px,py=c.absolutePosition(0,0)
        c.setFillColor(NAVY);c.rect(-px,-py,612,792,fill=1,stroke=0)
        c.setFillColor(colors.HexColor("#79e0ef"));c.setFont("LabSans-Bold",10)
        c.drawString(0,650,"QWEN / NEURON LAB")
        c.setFillColor(colors.white);c.setFont("LabSans-Bold",43)
        c.drawString(0,552,"One prompt.")
        c.setFillColor(colors.HexColor("#c2afff"));c.drawString(0,499,"Different paths.")
        c.setFillColor(colors.HexColor("#bac9dd"));c.setFont("LabSans",14)
        for i,line in enumerate(["An investigation of Qwen3.5-4B neuron steering,","a local M4 Pro implementation, and an","interactive animation for Claude artifacts."]):c.drawString(0,449-i*23,line)
        c.setStrokeColor(colors.HexColor("#657b99"));c.setLineWidth(1.2)
        c.roundRect(145,306,226,44,9,stroke=1,fill=0)
        c.setFillColor(colors.white);c.setFont("LabSans",12)
        c.drawCentredString(258,323,"One fixed user prompt")
        c.line(258,306,258,284);c.line(78,284,438,284)
        labels=[("Baseline","#79e0ef",0),("Selected recipe","#c2afff",180),("Reverse recipe","#ffc993",360)]
        for label,color,x in labels:
            c.setStrokeColor(colors.HexColor(color));c.line(x+78,284,x+78,263)
            c.setFillColor(colors.HexColor("#19283f"));c.roundRect(x,209,156,54,8,fill=1,stroke=1)
            c.setFillColor(colors.HexColor(color));c.setFont("LabSans-Bold",11);c.drawCentredString(x+78,231,label)
        c.setFillColor(colors.HexColor("#aebed5"));c.setFont("LabSans",10)
        for i,line in enumerate(["Source-verified implementation. Reproducible experiments.","BF16 reference + experimental GGUF port.","No unmeasured personality or hardware results are claimed."]):c.drawString(0,158-i*19,line)
        c.setStrokeColor(colors.HexColor("#35465f"));c.line(0,77,516,77)
        c.setFillColor(colors.white);c.setFont("LabSans-Bold",11);c.drawString(0,51,"Prepared for Rishabh Gupta")
        c.setFillColor(colors.HexColor("#aebed5"));c.setFont("LabSans",10);c.drawString(0,31,"25 October 2026  /  Apple M4 Pro  /  48 GB unified memory")
        c.restoreState()

def build(out):
    raw=(ROOT/"docs/INVESTIGATION.md").read_text()
    sections=re.split(r"^## ",raw,flags=re.M)[1:]
    story=[Cover(),PageBreak()]
    for section_index,section in enumerate(sections):
        title,_,content=section.partition("\n")
        number,_,title=title.partition(" / ")
        story.append(Paragraph("CHAPTER "+number,ParagraphStyle("chapter",parent=small,textColor=TEAL,fontName="LabSans-Bold",spaceAfter=8)))
        story.append(Paragraph(inline(title),heading))
        lines=content.strip().splitlines()
        i=0
        while i<len(lines):
            line=lines[i].strip()
            if not line:i+=1;continue
            if line=="[[WORKFLOW]]":
                story += [workflow(),Spacer(1,12)];i+=1;continue
            if line.startswith("```"):
                i+=1;block=[]
                while i<len(lines) and not lines[i].strip().startswith("```"):
                    for wrapped in textwrap.wrap(clean(lines[i]),width=90,replace_whitespace=False,drop_whitespace=False) or [""]:block.append(wrapped)
                    i+=1
                pre=Preformatted("\n".join(block),code_style)
                t=Table([[pre]],colWidths=[W],hAlign="LEFT")
                t.setStyle(TableStyle([("BACKGROUND",(0,0),(-1,-1),LIGHT),("BOX",(0,0),(-1,-1),.5,colors.HexColor("#cedce6")),("LEFTPADDING",(0,0),(-1,-1),12),("RIGHTPADDING",(0,0),(-1,-1),12),("TOPPADDING",(0,0),(-1,-1),12),("BOTTOMPADDING",(0,0),(-1,-1),12)]))
                story += [t,Spacer(1,12)];i+=1;continue
            if line.startswith("|"):
                rows=[]
                while i<len(lines) and lines[i].strip().startswith("|"):
                    values=[v.strip() for v in lines[i].strip().strip("|").split("|")]
                    if not all(re.fullmatch(r"[-: ]+",v) for v in values):rows.append(values)
                    i+=1
                story += [table(rows, compact=section_index in (1,16)),Spacer(1,14)];continue
            para=[]
            while i<len(lines) and lines[i].strip() and not lines[i].strip().startswith(("```","|","[[WORKFLOW]]")):
                para.append(lines[i].strip());i+=1
            text=" ".join(para)
            style=small if section_index==18 else body
            if text.startswith("https://"):
                text=' '.join('<link href="'+escape(u)+'" color="#137988">'+escape(u)+'</link>' for u in text.split())
                story.append(Paragraph(text,ParagraphStyle("url",parent=small,fontSize=8.1,leading=11,splitLongWords=True)))
            else:story.append(Paragraph(inline(text),style))
        if section_index!=len(sections)-1:story.append(PageBreak())
    out.parent.mkdir(parents=True,exist_ok=True)
    doc=SimpleDocTemplate(str(out),pagesize=(612,792),rightMargin=48,leftMargin=48,topMargin=65,bottomMargin=59,
                          title="One prompt. Different paths. - Qwen3.5-4B Neuron Steering",author="Rishabh Gupta",
                          subject="Source investigation, Apple Silicon setup, model steering, llama.cpp, and animation workflow")
    doc.build(story,onFirstPage=footer,onLaterPages=footer)
    print(out)

if __name__=="__main__":
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument("--out",type=Path,default=ROOT/"docs/Qwen_Neuron_Steering_Guide.pdf")
    build(p.parse_args().out)
