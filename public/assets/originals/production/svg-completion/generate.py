"""Original hand-authored canonical SVG motifs; run from the repository root.

SVG-intended resources only. No bitmap embeddings or raster stand-ins.
Small motifs use a 32-unit construction grid, 2-unit round strokes, then
uniformly scale into their canonical viewBox. No text is painted into art.
"""
from pathlib import Path
from math import sin, cos, pi
import json, html

ROOT = Path('public')
OUT = ROOT/'assets/originals/production/svg-completion'
CATALOG = json.loads((OUT/'briefs.json').read_text())
INK='#24594F'; GOLD='#B58A3C'; PAPER='#FFFDF7'; SAGE='#C9D0C3'; OCHRE='#F1D694'

def path(d, fill='none', **attrs):
    return '<path d="'+d+'" fill="'+fill+'" '+ ' '.join(f'{k.replace("_","-")}="{v}"' for k,v in attrs.items())+'/>'
def rect(x,y,w,h,fill='none',rx=0):
    return f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="{rx}" fill="{fill}"/>'
def circle(x,y,r,fill='none'):
    return f'<circle cx="{x}" cy="{y}" r="{r}" fill="{fill}"/>'
def group(s, transform):return f'<g transform="{transform}">{s}</g>'
def envelope(x=7,y=13,w=18,h=12):
    return rect(x,y,w,h,rx=1)+path(f'M{x} {y}l{w/2} {h*.6}L{x+w} {y}')
def leaf(d='M10 23Q6 11 24 7Q27 23 10 23Z'):
    return path(d,SAGE)+path('M10 23L22 10')
def book():
    return path('M4 12Q10 8 16 13Q22 8 28 12V26Q22 22 16 27Q10 22 4 26Z')+path('M16 13V27')
def gear(cx,cy,r):
    pts=[]
    for i in range(32):
        a=pi*i/16;radius=r if i%4 in (0,3) else r*.78
        pts.append((cx+cos(a)*radius,cy+sin(a)*radius))
    return path('M'+'L'.join(f'{x:.3f} {y:.3f}' for x,y in pts)+'Z')+circle(cx,cy,r*.28)

M={}
# Family emblems: single ink, distinct outlines, no baked letters or numbers.
M['family_a']=path('M6 14L16 6L26 14V27H6Z')+path('M4 14H28M25 12V5L29 7L25 9')+envelope(10,17,12,7)
M['family_b']=path('M4 8H28L30 14Q27 18 24 14Q21 18 18 14Q15 18 12 14Q9 18 6 14Q3 17 2 14Z')+rect(5,19,12,9)+rect(19,22,8,6)+path('M11 19V23M23 22V25')
M['family_c']=circle(16,8,4)+''.join(circle(x,y,2) for x,y in [(16,3),(21,8),(16,13),(11,8)])+path('M16 13V23M16 20Q6 20 5 15Q12 13 16 20M16 19Q23 12 27 15Q25 21 16 21M12 23H20L23 29H9Z')
M['family_d']=path('M3 12V6H28M3 6Q14 1 28 6')+path('M10 25V13Q10 7 16 7Q22 7 22 13V25Z')+rect(12,12,8,6,rx=2)+circle(13,22,1)+circle(19,22,1)+path('M12 26L8 30M20 26L24 30M10 28H22')
M['family_e']=book()+path('M3 24V8L16 4L29 8V24M2 8H30')
M['family_f']=path('M9 22L23 7M5 6L11 3L17 9L11 13ZM8 8L13 5M8 18L12 22L24 8L26 3L21 6ZM4 26H28M7 26V29M25 26V29')
M['family_g']=path('M3 22V17Q16 3 29 17V22H23Q16 10 9 22Z')+rect(12,6,8,6)+path('M3 26Q7 23 11 26T19 26T29 26M3 28Q7 25 11 28T19 28T29 28')
M['family_h']=path('M3 20L12 7L22 20M10 28L15 14M23 28L18 14M16 15V28M8 12H25V17H8ZM10 8H23V12')+path('M7 28H26')
M['family_i']=path('M6 7H24Q29 7 29 12V23H7Q3 23 3 27V12Q3 7 6 7ZM7 23Q11 23 11 27H3M24 7V22')+path('M13 27L24 12L28 27ZM20 24L23 19L25 24Z',fill_rule='evenodd')
M['family_j']=rect(11,11,10,10)+path('M11 11L16 15L21 11M16 15V21M11 16H8Q4 16 4 8M21 16H24Q28 16 28 6M16 21V27')+circle(4,5,2)+circle(28,4,2)+circle(16,29,2)
M['family_k']=gear(12,14,8)+gear(24,20,5)+circle(25,7,3)+path('M25 4V10M22 7H28M3 27H29V30H3Z')
M['family_l']=path('M5 28V10Q5 3 14 3Q23 3 23 10V28ZM5 14H23M5 22H23M9 6V13M13 7V13M18 6L19 13M9 17V21M14 16V21M19 17V21M25 29L30 11M22 23L27 24M24 17L29 18')

# Districts: only their canonical recognition feature, never ownership counts.
M['district_residential']=path('M4 15L16 5L28 15V28H4Z',PAPER)+path('M2 15L16 4L30 15')+rect(12,17,8,7,SAGE)
M['district_market']=path('M4 10H28L30 16Q27 20 24 16Q21 20 18 16Q15 20 12 16Q9 20 6 16Q3 20 2 16Z',OCHRE)+path('M5 19V28M27 19V28M3 28H29')
M['district_workshop']=path('M4 18L16 6L28 18M5 18V28M27 18V28M16 6V13')+group(path('M7 8H17V15H7Z',OCHRE)+path('M12 15V28'), 'rotate(28 12 18)')
M['district_park']=path('M4 28V15Q4 3 16 3Q28 3 28 15V28')+leaf('M11 27Q6 15 24 12Q26 26 11 27Z')
M['district_station']=path('M3 28V21L10 15L17 21V28M13 28V7H25V28M11 7L19 3L27 7',PAPER)+circle(19,13,4,SAGE)+path('M19 11V13L21 14M3 28H29')
M['district_harbor']=path('M4 23L21 7L28 14L11 30Z',OCHRE)+path('M8 19L15 26M13 14L20 21M18 9L25 16')+path('M22 15V7M28 15V7')+f'<ellipse cx="25" cy="7" rx="4" ry="3" fill="{SAGE}"/>'

M['equipment_packaging_icon']=rect(8,7,16,13,OCHRE,1)+path('M16 7V20M8 11H24M5 23H27M8 23V28M24 23V28M16 7Q11 3 10 7Q10 10 16 7Q22 2 23 6Q23 10 16 7')
M['equipment_crews_icon']=path('M5 8H21L24 20H8Z',OCHRE)+path('M4 5L8 20H27M21 8H27')+circle(10,25,4)+circle(24,25,3)
M['equipment_shops_icon']=path('M5 12H27V28H5Z',PAPER)+path('M5 7H27L29 13Q25 18 22 13Q18 18 15 13Q11 18 8 13Q4 17 3 13Z',SAGE)+rect(13,19,7,9)
M['equipment_railway_icon']=path('M8 3L5 29M24 3L27 29M6 25H26M7 18H25M8 10H24')+rect(10,7,12,11,OCHRE,1)+circle(12,21,2)+circle(20,21,2)
M['synergy_joint_delivery']=path('M4 8L8 4L12 8V13H4ZM20 8L24 4L28 8V13H20Z')+path('M8 13Q8 22 16 20Q24 22 24 13M16 20V26')+rect(11,21,10,9,OCHRE)+path('M11 24H21M16 21V30M16 21Q11 16 11 19Q11 22 16 21Q22 16 22 19Q22 22 16 21')
M['synergy_sorting_network']=rect(3,4,9,8,SAGE)+rect(21,4,9,8,SAGE)+rect(11,21,10,8,OCHRE)+path('M7 8H8M25 8H26M7 12V16H25V12M16 16V21M11 25H21')
M['synergy_tourism_service']=path('M9 25Q2 21 4 12M12 4Q24 2 28 13M28 22Q23 30 14 28M3 10L4 15L8 12M25 21L28 18L30 22')+path('M5 17V10M3 10Q0 6 5 3Q10 5 8 10Z',SAGE)+path('M20 16H29L26 22H22ZM24 16V9L28 14H24',OCHRE)+envelope(9,13,12,8)
M['research_materials']=path('M4 11L13 4H25V19L16 28L4 16Z',PAPER)+circle(20,9,2)+path('M8 25L23 10L27 14L12 29H8Z',OCHRE)+path('M21 12L25 16')
M['research_logistics']=path('M4 5H10Q14 5 14 10V25M4 13H6Q10 13 10 18V28')+path('M20 5H28V28H20Z',PAPER)+path('M20 10H24M20 16H24M20 22H24')
M['research_commerce']=path('M4 6H28L30 12Q26 17 22 12Q18 17 14 12Q10 17 6 12Q2 16 2 12Z',SAGE)+rect(7,17,12,12,PAPER,1)+path('M11 17V29M14 21H16M14 25H16')+circle(25,24,4,OCHRE)

# Topic entrance motifs: large few shapes, 16px minimum with accompanying labels.
M['topic_daily']=rect(4,6,24,11,PAPER,3)+path('M7 10Q10 13 7 15M25 10Q22 13 25 15')+path('M5 20H26L29 27H5Z',SAGE)+path('M9 24H28')
M['topic_food']=path('M5 14H27Q25 27 16 27Q7 27 5 14Z',PAPER)+path('M11 28H21M4 7L27 3M5 11L28 7')
M['topic_living']=path('M6 24Q2 13 9 9Q14 5 18 11L25 12L20 15Q22 25 12 26Z',SAGE)+path('M7 15Q14 15 12 21M12 26V29M17 25V28M4 19L1 22')+circle(15,11,1,INK)+circle(25,23,5,SAGE)+path('M22 26L28 21')
M['topic_town']=path('M3 16L14 6L25 16M6 15V28H22V15',PAPER)+rect(10,18,6,6,SAGE)+path('M22 27L28 18M25 15L30 19L27 23L22 19Z',OCHRE)
M['topic_nature']=circle(23,8,4,OCHRE)+path('M23 2V1M23 15V14M29 8H31M16 8H15M28 3L29 2M18 13L17 14')+leaf('M7 28Q2 12 21 15Q25 29 7 28Z')
M['topic_people']=path('M3 6H20V17H12L7 22V17H3Z',PAPER)+path('M14 19H29V29H24L20 25H14Z',SAGE)

# Milestone emblems, 128px source. Use iconic envelopes/books, no milestone digits.
M['reward_album_24_emblem']=envelope(6,15,20,13)+path('M16 18Q5 15 7 4Q18 3 16 18M16 18Q15 6 27 5Q29 15 16 18',SAGE)+path('M4 23Q16 19 28 23L26 28Q16 25 6 28Z',OCHRE)
rosette=[(16+cos(i*pi/48)*(13+cos(i*pi/4)),16+sin(i*pi/48)*(13+cos(i*pi/4))) for i in range(96)]
M['reward_board_48_emblem']=path('M'+'L'.join(f'{x:.3f} {y:.3f}' for x,y in rosette)+'Z',OCHRE)+circle(16,16,10,PAPER)+group(rect(10,8,12,9,PAPER,1)+path('M10 8L16 13L22 8'),'rotate(-20 16 18)')+group(rect(10,8,12,9,PAPER,1)+path('M10 8L16 13L22 8'),'rotate(20 16 18)')+rect(8,16,16,10,PAPER,1)+path('M8 16L16 22L24 16')
M['reward_first_collection_emblem']=path('M10 12L2 6L3 18L10 22M22 12L30 6L29 18L22 22M3 12L9 16M29 12L23 16',PAPER)+envelope(8,13,16,12)+circle(16,22,2,OCHRE)
M['reward_expanded_album_emblem']=path('M3 15L7 12L12 16V28L7 24L3 27ZM29 15L25 12L20 16V28L25 24L29 27Z',PAPER)+rect(12,8,8,20,SAGE,1)+path('M15 10V26M3 23Q0 21 2 17M29 23Q32 21 30 17')
M['reward_complete_72_emblem']=book()+path('M6 13V9L10 6L14 9V13M16 13V6H21V13M23 13V3H27V13M22 3L25 1L28 3M12 4L14 1M17 3V1M20 4L22 1',PAPER)

def mini_svg(asset, motif):
    w,h=asset['source_size']
    mono=asset['category']=='family_emblem'
    if mono:motif=motif.replace(SAGE,'none').replace(OCHRE,'none').replace(PAPER,'none')
    content=group(group(motif,'translate(3 3) scale(.8125)'),f'scale({w/32} {h/32})')
    return wrap(asset,content,stroke=INK,sw=2)

def wrap(asset, content, stroke=INK, sw=2):
    w,h=asset['source_size']
    return f'<svg xmlns="http://www.w3.org/2000/svg" width="{w}" height="{h}" viewBox="0 0 {w} {h}" fill="none" stroke="{stroke}" stroke-width="{sw}" stroke-linecap="round" stroke-linejoin="round"><title>{html.escape(asset["name"])}</title>{content}</svg>\n'

def frame(asset):
    aid=asset['id'];s=''
    if aid=='reward_frame_leaf':
        s=path('M62 732Q28 442 66 84M1138 732Q1172 442 1134 84',stroke=INK,stroke_width=8)
        for y in range(150,701,110):
            s+=path(f'M62 {y+30}Q26 {y+4} 34 {y-34}Q86 {y-16} 62 {y+30}Z',SAGE)
            s+=path(f'M1138 {y+30}Q1174 {y+4} 1166 {y-34}Q1114 {y-16} 1138 {y+30}Z',SAGE)
        s+=path('M86 742Q140 710 192 742M1114 742Q1060 710 1008 742',stroke=INK,stroke_width=6)
    elif aid=='reward_frame_plaza':
        for x,y,r in [(68,68,0),(1132,68,90),(1132,732,180),(68,732,270)]:
            s+=group(path('M-32 24V-32H24Q24 24-32 24Z',OCHRE)+path('M-32-32L24 24M-32-4H16M-4-32V16'),f'translate({x} {y}) rotate({r})')
        s+=path('M120 758H1080M120 748H1080',stroke=GOLD,stroke_width=6)
        for x in [190,850]:s+=rect(x,726,160,12,OCHRE,2)+path(f'M{x+16} 738V758M{x+144} 738V758',stroke_width=6)
    elif aid=='reward_frame_sunset':
        s=path('M480 82A120 52 0 0 1 720 82Z',OCHRE)+path('M600 36V28M460 48L448 40M740 48L752 40',stroke_width=6)
        s+=path('M144 74Q150 42 182 54Q196 30 222 52Q270 46 278 74ZM922 74Q930 46 978 52Q1004 30 1018 54Q1050 42 1056 74Z',SAGE)
        s+=path('M36 742Q220 710 400 746T800 740T1164 742',stroke=GOLD,stroke_width=8)
        s+=path('M64 122V680M1136 122V680',stroke=GOLD,stroke_width=4)
    elif aid=='reward_frame_journey':
        s=path('M38 122V40H1108L1160 92V760H88L38 704V122ZM1108 40V92H1160M38 704H88V760',stroke=GOLD,stroke_width=6)
        s+=path('M72 180Q36 350 70 520T72 676M1128 184Q1164 360 1130 520T1130 632',stroke=INK,stroke_width=4)
        s+=circle(68,68,28,PAPER)+path('M68 44L80 68L68 90L56 68Z',OCHRE)
        s+=rect(1090,716,60,36,OCHRE,6)+path('M1108 716V708H1132V716M1108 718V750M1132 718V750',stroke_width=4)
    elif aid=='memorial_frame':
        s=path('M28 28H612V612H28ZM62 62V578H578V62Z',PAPER,fill_rule='evenodd',stroke=GOLD,stroke_width=4)
        s+=path('M46 596H594M46 604H594',stroke=GOLD,stroke_width=4)+circle(320,36,16,OCHRE)+circle(320,36,6,PAPER)
    elif aid=='board_base':
        # Canonical safe ends y776 while the inner window ends y784.
        # Open bottom is intentional; no safe geometry exists for a bottom rail.
        s=path('M28 774V44Q28 28 44 28H1156Q1172 28 1172 44V774',stroke=GOLD,stroke_width=4)
        s+=path('M40 40H1160V88H40Z',PAPER,stroke_width=0)+path('M152 88H1158',stroke=SAGE,stroke_width=2)
    elif aid=='board_foil':
        s=path('M26 774V26H1174V774M30 774V30H1170V774',stroke=GOLD,stroke_width=2)
        for x in [58,1142]:s+=group(path('M-20 0L0-20L20 0L0 20Z',OCHRE)+path('M-12 0H12M0-12V12',stroke_width=2),f'translate({x} 58)')
        s+=path('M28 744V774M1172 744V774',stroke=GOLD,stroke_width=4)
    elif aid=='album_base':
        s=path('M48 96V56Q48 32 76 32H1124Q1152 32 1152 56V744Q1152 768 1124 768H76Q48 768 48 744V96ZM94 94V706H1106V94Z',SAGE,fill_rule='evenodd',stroke=INK,stroke_width=4)
        s+=path('M76 60V740',stroke=GOLD,stroke_width=4)
        for y in range(120,689,56):s+=path(f'M60 {y}Q78 {y-10} 88 {y}',stroke=GOLD,stroke_width=4)
    else:raise KeyError(aid)
    return wrap(asset,s,stroke=GOLD,sw=4)

def ornament(asset):
    if asset['id']=='reward_tree_ornament':
        s=''
        for x,y,r in [(112,108,54),(312,84,62),(512,112,50),(712,80,60),(912,104,52)]:
            s+=circle(x,y,r,SAGE)+path(f'M{x} {y+14}V224M{x} {y+62}L{x-24} {y+36}M{x} {y+52}L{x+20} {y+22}',stroke_width=8)
            s+=path(f'M{x-48} 230Q{x-42} 198 {x-18} 214Q{x} 190 {x+20} 214Q{x+44} 202 {x+48} 230Z',SAGE)
    else:
        s=f'<ellipse cx="512" cy="214" rx="260" ry="22" fill="{SAGE}"/>'
        s+=path('M280 210Q512 252 744 210M352 200Q392 72 484 180M672 200Q632 72 540 180M416 180Q448 42 504 180M608 180Q576 42 520 180',stroke='#7FAEAD',stroke_width=14)
        s+=path('M512 26Q470 84 512 108Q554 84 512 26Z',fill='#7FAEAD',stroke_width=6)
    return wrap(asset,s,stroke=INK,sw=6)

def overlay(asset):
    aid=asset['id']
    if aid=='shop_canopy':
        s=path('M118 244H394L412 282H100Z',SAGE)+path('M100 282H412V300Q386 316 360 300Q334 316 308 300Q282 316 256 300Q230 316 204 300Q178 316 152 300Q126 316 100 300Z',OCHRE)
        s+=path('M164 246L152 282M210 246L204 282M256 246V282M302 246L308 282M348 246L360 282',stroke=INK,stroke_width=4)
    elif aid=='shop_banner':
        s=path('M416 248V448M416 258H466',stroke=GOLD,stroke_width=8)+path('M426 266H462V422L444 410L426 422Z',SAGE,stroke_width=4)
        s+=path('M434 282H454M434 400H454',stroke=GOLD,stroke_width=4)
    else:
        s=path('M256 142V154',stroke=INK,stroke_width=6)+circle(256,184,30,OCHRE)+circle(256,184,22,PAPER)
    return wrap(asset,s,stroke=INK,sw=4)

def main():
    assert len(CATALOG)==52
    made=[]
    for a in CATALOG:
        if a['id'] in M:s=mini_svg(a,M[a['id']])
        elif a['profile_id']=='ornament':s=ornament(a)
        elif a['category']=='shop_overlay':s=overlay(a)
        else:s=frame(a)
        for rel in a['runtime_exports']:
            target=ROOT/rel;target.parent.mkdir(parents=True,exist_ok=True);target.write_text(s)
        made.append(a['id'])
    print('Wrote',len(made),'original SVG assets')

if __name__=='__main__':main()
