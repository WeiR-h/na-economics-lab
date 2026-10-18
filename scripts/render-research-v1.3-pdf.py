"""Create a readable PDF from the reusable Chinese research manuscript."""
import re,json,html
from pathlib import Path
from reportlab.platypus import SimpleDocTemplate,Paragraph,Spacer,Table,TableStyle,Image,KeepTogether
from reportlab.lib.styles import getSampleStyleSheet,ParagraphStyle
from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from pypdf import PdfReader

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'output/pdf';OUT.mkdir(parents=True,exist_ok=True)
for name,file in [('YaHei','msyh.ttc'),('YaHeiBold','msyhbd.ttc')]:
    pdfmetrics.registerFont(TTFont(name,str(Path('C:/Windows/Fonts')/file),subfontIndex=0))
styles=getSampleStyleSheet()
styles.add(ParagraphStyle(name='CNBody',fontName='YaHei',fontSize=10.2,leading=17.5,textColor=colors.HexColor('#253c31'),spaceAfter=8,wordWrap='CJK',allowWidows=0,allowOrphans=0))
styles.add(ParagraphStyle(name='CNTitle',parent=styles['CNBody'],fontName='YaHeiBold',fontSize=21,leading=31,spaceAfter=12))
styles.add(ParagraphStyle(name='CNHeading',parent=styles['CNBody'],fontName='YaHeiBold',fontSize=14.4,leading=23,spaceBefore=13,spaceAfter=7,keepWithNext=True))
styles.add(ParagraphStyle(name='CNCell',parent=styles['CNBody'],fontSize=8.1,leading=12.5,spaceAfter=0))
styles.add(ParagraphStyle(name='CNTableHead',parent=styles['CNCell'],fontName='YaHeiBold',textColor=colors.white))
styles.add(ParagraphStyle(name='CNCaption',parent=styles['CNBody'],fontSize=8.5,leading=13,textColor=colors.HexColor('#64766b')))
def inline(text):
    text=text.replace('−','-').replace('—','-').replace('–','-')
    pieces=[];pos=0
    for match in re.finditer(r'\[([^\]]+)\]\(([^)]+)\)',text):
        pieces.append(html.escape(text[pos:match.start()]))
        pieces.append('<link href="'+html.escape(match[2],quote=True)+'" color="#155a46">'+html.escape(match[1])+'</link>')
        pos=match.end()
    pieces.append(html.escape(text[pos:]))
    return ''.join(pieces)
story=[]
lines=(ROOT/'docs/research-v1.3-2026-10-16.md').read_text(encoding='utf-8').splitlines()
i=0
while i<len(lines):
    text=lines[i].strip()
    if not text:i+=1;continue
    if text.startswith('# '):story.append(Paragraph(inline(text[2:]),styles['CNTitle']));i+=1;continue
    if text.startswith('## '):story.append(Paragraph(inline(text[3:]),styles['CNHeading']));i+=1;continue
    if text.startswith('|'):
        rows=[]
        while i<len(lines) and lines[i].strip().startswith('|'):
            cells=[c.strip() for c in lines[i].strip().strip('|').split('|')]
            if not all(re.fullmatch(r'[- :]+',c) for c in cells):rows.append(cells)
            i+=1
        n=len(rows[0]);width=499
        widths=([95,170,234] if n==3 else [180]+[(width-180)/(n-1)]*(n-1))
        data=[[Paragraph(inline(c),styles['CNTableHead' if j==0 else 'CNCell']) for c in row] for j,row in enumerate(rows)]
        table=Table(data,colWidths=widths,repeatRows=1,hAlign='LEFT')
        table.setStyle(TableStyle([('BACKGROUND',(0,0),(-1,0),colors.HexColor('#155a46')),('VALIGN',(0,0),(-1,-1),'TOP'),('LEFTPADDING',(0,0),(-1,-1),7),('RIGHTPADDING',(0,0),(-1,-1),7),('TOPPADDING',(0,0),(-1,-1),7),('BOTTOMPADDING',(0,0),(-1,-1),7),('LINEBELOW',(0,0),(-1,-1),.45,colors.HexColor('#dce5df')),('ROWBACKGROUNDS',(0,1),(-1,-1),[colors.white,colors.HexColor('#f3f6f4')])]))
        story.extend([table,Spacer(1,10)]);continue
    img=re.fullmatch(r'!\[([^\]]+)\]\(([^)]+)\)',text)
    if img:
        file=(ROOT/'docs'/img[2]).resolve();image=Image(str(file));image.drawHeight*=499/image.drawWidth;image.drawWidth=499
        story.append(KeepTogether([image,Spacer(1,4),Paragraph(inline(img[1])+' · 来源：本研究条件性模拟',styles['CNCaption'])]));i+=1;continue
    story.append(Paragraph(inline(text),styles['CNBody']));i+=1

story.append(Paragraph('参考资料与日期',styles['CNHeading']))
ledger=json.loads((ROOT/'data/source-audit.json').read_text(encoding='utf-8'))
for j,source in enumerate(ledger['sources'],1):
    story.append(KeepTogether([Paragraph(inline(f"{j}. {source['type']} · {source['date']}"),styles['CNBody']),Paragraph('<link href="'+html.escape(source['url'],quote=True)+'" color="#155a46">'+html.escape(source['url'])+'</link>',styles['CNCaption'])]))
def footer(canvas,doc):
    canvas.saveState();canvas.setStrokeColor(colors.HexColor('#dce5df'));canvas.line(48,43,A4[0]-48,43)
    canvas.setFont('YaHei',8);canvas.setFillColor(colors.HexColor('#66766d'))
    canvas.drawString(48,29,'初焰钠宙04题 · 研究v1.3 · WeiR-h · 2026-10-16')
    canvas.drawRightString(A4[0]-48,29,str(doc.page));canvas.restoreState()
target=OUT/'AIDC-Na-LFP-Research-v1.3.pdf'
doc=SimpleDocTemplate(str(target),pagesize=A4,leftMargin=48,rightMargin=48,topMargin=43,bottomMargin=57,title='钠电与磷酸铁锂在AIDC中的长期经济边界研究 v1.3',author='WeiR-h')
doc.build(story,onFirstPage=footer,onLaterPages=footer)
reader=PdfReader(target);text='\n'.join(p.extract_text() for p in reader.pages)
for needle in ['共建','74','经营','WeiR-h','43.65','123.31','3.6C','47','432','1035.41','518.00','55.56','232','121']:
    if needle not in text:raise AssertionError('Missing research key: '+needle)
assert reader.metadata.author=='WeiR-h'
assert text.count('AI工具辅助')==1
assert '署名待' not in text and 'GPT辅助研究' not in text
report={'file':str(target),'pages':len(reader.pages),'textCharacters':len(text),'author':'WeiR-h','keyValuesPresent':True,'visualReview':'pending','dataStatus':'public-product-and-award-evidence-with-conditional-economic-model'}
(ROOT/'evidence/product-prices-2026-10-14/pdf-verification-v1.3.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps(report,ensure_ascii=False))
